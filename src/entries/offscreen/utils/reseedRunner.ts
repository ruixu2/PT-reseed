import { onMessage, sendMessage } from "@/messages.ts";
import { ptdIndexDb } from "../adapter/indexdb.ts";
import type {
  IReseedTask,
  IReseedResult,
  TReseedTaskStatus,
  ITorrentMetadata,
  IConfigPiniaStorageSchema,
} from "@/shared/types.ts";
import { logger } from "./logger.ts";
import { sleep, applyPathMapping } from "~/helper.ts";
import { getRemoteTorrentFile } from "@ptd/downloader/utils.ts";

let runningTask = false;

export async function addTorrentsToReseedQueue(torrents: any[]) {
  const db = await ptdIndexDb;
  const now = Date.now();

  for (const torrent of torrents) {
    const task: IReseedTask = {
      infoHash: torrent.infoHash,
      name: torrent.name,
      clientId: torrent.clientId,
      savePath: torrent.savePath,
      status: "waiting",
      addedAt: now,
      updatedAt: now,
    };
    await db.put("reseed_queue", task);
  }

  // 尝试启动队列处理器
  startReseedRunner().catch();
}

onMessage("addTorrentsToReseedQueue", async ({ data: torrents }) => await addTorrentsToReseedQueue(torrents));

export async function getReseedQueue() {
  return await (await ptdIndexDb).getAll("reseed_queue");
}

onMessage("getReseedQueue", getReseedQueue);

export async function getAllReseedResults() {
  return await (await ptdIndexDb).getAll("reseed_results");
}

onMessage("getAllReseedResults", getAllReseedResults);

export async function getReseedResults(infoHash: string) {
  return await (await ptdIndexDb).getAllFromIndex("reseed_results", "by-source", infoHash);
}

onMessage("getReseedResults", async ({ data: infoHash }) => await getReseedResults(infoHash));

export async function saveReseedResult(result: IReseedResult) {
  return await (await ptdIndexDb).put("reseed_results", result);
}

onMessage("saveReseedResult", async ({ data: result }) => await saveReseedResult(result));

export async function markReseedResultInjected(
  sourceInfoHash: string,
  siteId: string,
  torrentId: string,
  targetClientId: string,
  targetTorrentHash: string,
) {
  const resultId = `${sourceInfoHash}_${siteId}_${torrentId}`;
  const db = await ptdIndexDb;
  const result = await db.get("reseed_results", resultId);
  if (result) {
    result.status = "injected";
    result.targetClientId = targetClientId;
    result.targetTorrentHash = targetTorrentHash;
    await db.put("reseed_results", result);
  }
}

onMessage(
  "markReseedResultInjected",
  async ({ data }) =>
    await markReseedResultInjected(
      data.sourceInfoHash,
      data.siteId,
      data.torrentId,
      data.targetClientId,
      data.targetTorrentHash,
    ),
);

async function updateTaskStatus(infoHash: string, status: TReseedTaskStatus, error?: string) {
  const db = await ptdIndexDb;
  const task = await db.get("reseed_queue", infoHash);
  if (task) {
    task.status = status;
    task.updatedAt = Date.now();
    if (error) task.error = error;
    await db.put("reseed_queue", task);
  }
}

export async function startReseedRunner() {
  if (runningTask) return;
  runningTask = true;

  logger({ msg: "Reseed Runner started" });

  try {
    while (true) {
      const db = await ptdIndexDb;
      const tasks = await db.getAll("reseed_queue");
      const nextTask = tasks.find((t) => t.status === "waiting");

      if (!nextTask) {
        logger({ msg: "Reseed Runner: No more tasks in queue" });
        break;
      }

      await processNextTask(nextTask);
      // 每个任务之间固定等待一定时间，保护站点
      await sleep(5000);
    }
  } finally {
    runningTask = false;
    logger({ msg: "Reseed Runner stopped" });
  }
}

async function processNextTask(task: IReseedTask) {
  logger({ msg: `Processing task: ${task.name}` });
  await updateTaskStatus(task.infoHash, "searching");

  try {
    const results = (await sendMessage("searchTorrentOnAllSites", task.infoHash)) as any[];
    const configStore = (await sendMessage("getExtStorage", "config")) as any;

    if (results && results.length > 0) {
      for (const res of results) {
        // 执行 L3 深度校验
        let l3Status: IReseedResult["status"] = "pending";
        let targetClientId: string | undefined;
        let targetTorrentHash: string | undefined;

        try {
          const matchLevel = await performL3Check(task.infoHash, res);
          if (matchLevel) {
            res.matchLevel = matchLevel; // 设置真实的匹配级别 (L3 / L2.5)

            let shouldInject = false;
            if (
              configStore.crossSeedControl?.autoInject &&
              (matchLevel === "L3" || matchLevel === "L2.5" || res.matchLevel === "L1")
            ) {
              shouldInject = true;

              // 站点保护：如果种子带有 H&R 等惩罚标签，拒绝自动注入
              if (configStore.crossSeedControl?.safeInjectOnly && res.tags) {
                const hasRiskTag = res.tags.some(
                  (tag: any) =>
                    tag.name?.toUpperCase().includes("H&R") ||
                    tag.name?.toUpperCase().includes("HNR") ||
                    tag.color === "red" ||
                    tag.color === "danger",
                );
                if (hasRiskTag) {
                  shouldInject = false;
                  logger({ msg: `Auto-inject blocked for ${res.title} due to risk tags.` });
                }
              }
            }

            // 自动注入逻辑
            if (shouldInject) {
              const targetPath = applyPathMapping(
                task.savePath,
                task.clientId,
                task.clientId,
                configStore.crossSeedControl.pathMappings || [],
              );
              logger({ msg: `Auto-injecting ${res.title} into ${task.clientId}` });
              const result: any = await sendMessage("downloadTorrent", {
                torrent: res,
                downloaderId: task.clientId,
                addTorrentOptions: {
                  savePath: targetPath,
                  addAtPaused: true,
                },
              });

              if (result.success) {
                l3Status = "injected";
                targetClientId = task.clientId;
                targetTorrentHash = result.id;
              } else {
                l3Status = "pending";
              }
            } else {
              l3Status = "pending"; // 匹配成功，标记为待审核
            }
          } else {
            l3Status = "ignored"; // 匹配失败，忽略
          }
        } catch (e) {
          logger({ msg: `L3 Check failed for ${res.site}`, data: e });
          l3Status = "ignored";
        }

        const reseedResult: IReseedResult = {
          id: `${task.infoHash}_${res.site}_${res.id}`,
          sourceInfoHash: task.infoHash,
          siteId: res.site,
          torrentId: res.id,
          title: res.title,
          subTitle: res.subTitle,
          size: res.size,
          status: l3Status,
          targetClientId,
          targetTorrentHash,
          data: res,
        };
        await (await ptdIndexDb).put("reseed_results", reseedResult);
      }
      await updateTaskStatus(task.infoHash, "matched");
    } else {
      await updateTaskStatus(task.infoHash, "no_match");
    }
  } catch (e: any) {
    logger({ msg: `Task failed: ${task.name}`, data: e });
    await updateTaskStatus(task.infoHash, "error", e.message || "Unknown error");
  }
}

/**
 * L3 级深层分片校验
 */
async function performL3Check(localInfoHash: string, remoteTorrent: any): Promise<string | false> {
  logger({ msg: `Performing L3 Deep Check for ${remoteTorrent.site}: ${remoteTorrent.title}` });

  const localMeta = (await (await ptdIndexDb).get("torrent_metadata", localInfoHash)) as ITorrentMetadata;
  if (!localMeta) return false;

  try {
    // 1. 获取目标远端种子的配置与文件
    const downloadConfig = (await sendMessage("getSiteTorrentDownloadRequestConfig", {
      siteId: remoteTorrent.site,
      torrent: remoteTorrent,
    })) as any;

    const remoteFile = await getRemoteTorrentFile(downloadConfig);

    // 2. 尝试真正的分片 Hash (L3) 比对
    if (localMeta.originSite) {
      try {
        const originSearch: any = await sendMessage("getSiteSearchResult", {
          siteId: localMeta.originSite,
          keyword: localMeta.infoHash,
        });

        let originTorrentInfo = originSearch?.data?.find((t: any) => t.id || t.link);

        if (!originTorrentInfo && localMeta.name) {
          const titleSearch: any = await sendMessage("getSiteSearchResult", {
            siteId: localMeta.originSite,
            keyword: localMeta.name,
          });
          originTorrentInfo = titleSearch?.data?.find((t: any) => Math.abs(t.size - localMeta.totalSize) < 1024);
        }

        if (originTorrentInfo) {
          const originDownloadConfig = (await sendMessage("getSiteTorrentDownloadRequestConfig", {
            siteId: localMeta.originSite,
            torrent: originTorrentInfo,
          })) as any;

          const originFile = await getRemoteTorrentFile(originDownloadConfig);

          if (originFile.info.pieces && remoteFile.info.pieces) {
            const isPieceLengthSame = originFile.info.pieceLength === remoteFile.info.pieceLength;
            const isPiecesSame =
              Array.isArray(originFile.info.pieces) &&
              Array.isArray(remoteFile.info.pieces) &&
              originFile.info.pieces.join("") === remoteFile.info.pieces.join("");

            if (isPieceLengthSame && isPiecesSame) {
              logger({ msg: `L3 True Piece Hash Match Success for ${remoteTorrent.title}` });
              return "L3";
            } else {
              logger({ msg: `L3 True Piece Hash Match Failed for ${remoteTorrent.title}` });
              return false;
            }
          }
        }
      } catch (e) {
        logger({ msg: `Failed to fetch origin torrent for L3 check:`, data: e });
      }
    }

    // 3. 回退到严格的文件列表比对
    return isStrictSameFileList(localMeta, remoteFile.info) ? "L2.5" : false;
  } catch (e) {
    logger({ msg: "L3 performL3Check Error:", data: e });
    return false;
  }
}

function isStrictSameFileList(local: ITorrentMetadata, remote: any): boolean {
  // 1. 总大小比对
  const remoteLength = remote.length || remote.files?.reduce((acc: number, f: any) => acc + f.length, 0);
  if (Math.abs(local.totalSize - remoteLength) > 1024) return false;

  // 2. 文件数量比对
  const localFiles = [...local.files].sort((x, y) => x.path.localeCompare(y.path));
  const remoteFiles = (remote.files || [{ path: remote.name, length: remote.length }])
    .map((f: any) => ({
      path: Array.isArray(f.path) ? f.path.join("/") : f.path,
      length: f.length,
    }))
    .sort((x: any, y: any) => x.path.localeCompare(y.path));

  if (localFiles.length !== remoteFiles.length) return false;

  // 3. 逐个文件大小比对
  for (let i = 0; i < localFiles.length; i++) {
    if (Math.abs(localFiles[i].length - remoteFiles[i].length) > 1024) {
      return false;
    }
  }

  return true;
}

onMessage("startReseedRunner", async () => await startReseedRunner());

// ── Staging Area Handlers ──

export async function getPendingReseedResults(): Promise<IReseedResult[]> {
  const db = await ptdIndexDb;
  const allResults = await db.getAll("reseed_results");
  return allResults.filter((r) => r.status === "pending");
}

onMessage("getPendingReseedResults", async () => await getPendingReseedResults());

export async function markReseedResultStatus(data: {
  sourceInfoHash: string;
  siteId: string;
  torrentId: string;
  status: IReseedResult["status"];
}) {
  const resultId = `${data.sourceInfoHash}_${data.siteId}_${data.torrentId}`;
  const db = await ptdIndexDb;
  const result = await db.get("reseed_results", resultId);
  if (result) {
    result.status = data.status;
    await db.put("reseed_results", result);
  }
}

onMessage("markReseedResultStatus", async ({ data }) => await markReseedResultStatus(data));

export async function batchMarkReseedResultsStatus(
  items: Array<{
    sourceInfoHash: string;
    siteId: string;
    torrentId: string;
  }>,
  status: IReseedResult["status"],
) {
  const db = await ptdIndexDb;
  const tx = db.transaction("reseed_results", "readwrite");
  for (const item of items) {
    const resultId = `${item.sourceInfoHash}_${item.siteId}_${item.torrentId}`;
    const result = await tx.store.get(resultId);
    if (result) {
      result.status = status;
      await tx.store.put(result);
    }
  }
  await tx.done;
}

onMessage(
  "batchMarkReseedResultsStatus",
  async ({ data }) => await batchMarkReseedResultsStatus(data.items, data.status),
);
