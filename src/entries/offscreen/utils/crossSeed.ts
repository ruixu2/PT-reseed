import { onMessage, sendMessage } from "@/messages.ts";
import { ptdIndexDb } from "../adapter/indexdb.ts";
import type { IConfigPiniaStorageSchema, IMetadataPiniaStorageSchema, ITorrentMetadata } from "@/shared/types.ts";
import { logger } from "./logger.ts";
import { parseTorrentName } from "./nameParser.ts";
import { getHostFromUrl } from "@ptd/site";

export async function getTorrentMetadata(infoHash: string) {
  return await (await ptdIndexDb).get("torrent_metadata", infoHash);
}

onMessage("getTorrentMetadata", async ({ data: infoHash }) => await getTorrentMetadata(infoHash));

export async function saveTorrentMetadata(metadata: ITorrentMetadata) {
  return await (await ptdIndexDb).put("torrent_metadata", metadata);
}

onMessage("saveTorrentMetadata", async ({ data: metadata }) => await saveTorrentMetadata(metadata));

export async function getAllTorrentMetadata() {
  return await (await ptdIndexDb).getAll("torrent_metadata");
}

onMessage("getAllTorrentMetadata", getAllTorrentMetadata);

export async function scanDownloaderForCrossSeed(downloaderId: string) {
  logger({ msg: `Scanning downloader ${downloaderId} for cross-seeding` });
  const torrents = (await sendMessage("getDownloaderTorrents", downloaderId)) as any[];
  const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;
  const siteHostMap = metadataStore.siteHostMap || {};

  const finishedTorrents = torrents.filter((t) => t.isCompleted);
  const results: ITorrentMetadata[] = [];

  for (const torrent of finishedTorrents) {
    let metadata = await getTorrentMetadata(torrent.infoHash);

    if (!metadata) {
      logger({ msg: `Fetching file list for torrent ${torrent.name} (${torrent.infoHash})` });
      const files = (await sendMessage("getDownloaderTorrentFiles", {
        downloaderId,
        torrentId: torrent.id,
      })) as any[];

      // 识别来源站点
      let originSite: string | undefined;
      if (torrent.trackers) {
        for (const trackerUrl of torrent.trackers) {
          const host = getHostFromUrl(trackerUrl);
          if (siteHostMap[host]) {
            originSite = siteHostMap[host];
            break;
          }
        }
      }

      metadata = {
        infoHash: torrent.infoHash,
        name: torrent.name,
        totalSize: torrent.totalSize,
        files: files,
        trackers: torrent.trackers,
        originSite: originSite,
        dateAdded: torrent.dateAdded,
        clientId: torrent.clientId,
        savePath: torrent.savePath,
      };

      await saveTorrentMetadata(metadata);
    }
    results.push(metadata);
  }

  return results;
}

onMessage(
  "scanDownloaderForCrossSeed",
  async ({ data: downloaderId }) => await scanDownloaderForCrossSeed(downloaderId),
);

/**
 * 分析重复种子
 */
export async function analyzeDuplicateTorrents() {
  const allMetadata = await getAllTorrentMetadata();

  // 第一步：按“最大文件大小”进行分组 (L2 模糊匹配基础)
  const groups = new Map<number, ITorrentMetadata[]>();

  for (const metadata of allMetadata) {
    const largestFile = getLargestFile(metadata);
    if (!largestFile) continue;

    const size = largestFile.length;
    if (!groups.has(size)) {
      groups.set(size, []);
    }
    groups.get(size)!.push(metadata);
  }

  const duplicates: ITorrentMetadata[][] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const subGroups: ITorrentMetadata[][] = [];

    for (const item of group) {
      let found = false;
      for (const subGroup of subGroups) {
        const target = subGroup[0];
        // 模糊匹配逻辑：最大文件一致
        if (isFuzzyMatch(item, target)) {
          subGroup.push(item);
          found = true;
          break;
        }
      }
      if (!found) {
        subGroups.push([item]);
      }
    }

    for (const subGroup of subGroups) {
      if (subGroup.length > 1) {
        duplicates.push(subGroup);
      }
    }
  }

  return duplicates;
}

function getLargestFile(metadata: ITorrentMetadata) {
  if (!metadata.files || metadata.files.length === 0) return null;
  return [...metadata.files].sort((a, b) => b.length - a.length)[0];
}

function isFuzzyMatch(a: ITorrentMetadata, b: ITorrentMetadata): boolean {
  const la = getLargestFile(a);
  const lb = getLargestFile(b);

  if (!la || !lb) return false;

  // 最大文件大小完全一致且总大小差异小于 1%
  const sizeDiff = Math.abs(a.totalSize - b.totalSize);
  const isTotalSizeClose = sizeDiff < a.totalSize * 0.01;

  return la.length === lb.length && isTotalSizeClose;
}

function isSameFileList(a: ITorrentMetadata, b: ITorrentMetadata): boolean {
  if (a.files.length !== b.files.length) return false;

  // 排序后比对文件路径和大小
  const filesA = [...a.files].sort((x, y) => x.path.localeCompare(y.path));
  const filesB = [...b.files].sort((x, y) => x.path.localeCompare(y.path));

  for (let i = 0; i < filesA.length; i++) {
    if (filesA[i].path !== filesB[i].path || filesA[i].length !== filesB[i].length) {
      return false;
    }
  }

  return true;
}

onMessage("analyzeDuplicateTorrents", async () => await analyzeDuplicateTorrents());

/**
 * 在所有站点搜索该种子
 */
export async function searchTorrentOnAllSites(infoHash: string) {
  const metadata = await getTorrentMetadata(infoHash);
  if (!metadata) return [];

  const parsedName = parseTorrentName(metadata.name);
  const keyword = parsedName.imdbId ? `imdb|${parsedName.imdbId}` : parsedName.title;

  const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;
  const configStore = (await sendMessage("getExtStorage", "config")) as IConfigPiniaStorageSchema;

  const targetSites = configStore.crossSeedControl?.targetSites || [];
  const iyuuToken = configStore.crossSeedControl?.iyuuToken;

  const allResults: any[] = [];

  // --- IYUU API 查重逻辑 ---
  if (iyuuToken && metadata.infoHash) {
    logger({ msg: `Querying IYUU API for InfoHash: ${metadata.infoHash}` });
    try {
      const iyuuRes = await fetch(
        `https://api.iyuu.cn/index.php?m=App&c=Api&a=hash&hash=${metadata.infoHash}&sign=${iyuuToken}&version=PT-reseed`,
      );
      const iyuuData = await iyuuRes.json();

      if (iyuuData && iyuuData.ret === 200 && iyuuData.data) {
        const iyuuMatches = iyuuData.data;
        // IYUU 返回的结构可能是一个数组或者对象，需适配
        const matchArray = Array.isArray(iyuuMatches) ? iyuuMatches : Object.values(iyuuMatches);

        for (const match of matchArray as any[]) {
          const siteId = match.site || match.sid; // IYUU字段可能叫 site 或 sid
          const torrentId = match.id || match.torrent_id;

          if (siteId && torrentId && metadataStore.sites[siteId] && metadataStore.sites[siteId].enabled) {
            // 排除来源站和非目标站
            if (metadata.originSite && siteId === metadata.originSite) continue;
            if (targetSites.length > 0 && !targetSites.includes(siteId as any)) continue;

            allResults.push({
              id: torrentId,
              site: siteId,
              title: `[IYUU Match] ${metadata.name}`,
              subTitle: "Discovered via IYUU Global Database",
              size: metadata.totalSize,
              matchLevel: "L3", // IYUU 基于 Hash 匹配，可认为是极高信任度
            });
          }
        }
        logger({ msg: `IYUU API returned ${allResults.length} potential matches.` });

        // 如果 IYUU 找到了结果，可以选择跳过常规的按标题全站搜索，节省大量 API 请求
        if (allResults.length > 0) {
          return allResults;
        }
      }
    } catch (e) {
      logger({ msg: "IYUU API Query Failed", data: e });
    }
  }
  // --- 常规全站爬虫查重逻辑 ---

  const sites = Object.entries(metadataStore.sites).filter(([id, config]) => {
    // 过滤掉来源站点
    if (metadata.originSite && id === metadata.originSite) {
      return false;
    }
    // 过滤用户指定的目标站点
    if (targetSites.length > 0 && !targetSites.includes(id as any)) {
      return false;
    }
    return config.enabled;
  });

  for (const [siteId] of sites) {
    try {
      const searchResult: any = await sendMessage("getSiteSearchResult", { siteId, keyword });
      if (searchResult && searchResult.data) {
        // L2 模糊匹配：总大小差异在 1% 以内
        const matches = searchResult.data.filter((r: any) => {
          const sizeDiff = Math.abs(r.size - metadata.totalSize);
          const isMatch = sizeDiff < metadata.totalSize * 0.01 || sizeDiff < 1024 * 1024; // 1% 或 1MB 以内
          if (isMatch) {
            // 标记匹配类型
            r.matchLevel = sizeDiff < 1024 ? "L1" : "L2";
          }
          return isMatch;
        });
        allResults.push(...matches);
      }
    } catch (e) {
      logger({ msg: `Search failed for site ${siteId}`, data: e });
    }
  }

  return allResults;
}

onMessage("searchTorrentOnAllSites", async ({ data: infoHash }) => await searchTorrentOnAllSites(infoHash));

/**
 * 根据大小查找本地是否存在该种子
 */
export async function findLocalTorrentBySize(size: number) {
  const allMetadata = await getAllTorrentMetadata();

  return allMetadata.filter((m) => {
    const sizeDiff = Math.abs(m.totalSize - size);
    // 精确匹配 (1KB)
    if (sizeDiff < 1024) return true;

    // L2 匹配：最大文件大小与总大小的关系
    // 在只有 size 的情况下，我们只能判断总大小是否接近
    return sizeDiff < m.totalSize * 0.01 || sizeDiff < 1024 * 1024;
  });
}

onMessage("findLocalTorrentBySize", async ({ data: size }) => await findLocalTorrentBySize(size));
