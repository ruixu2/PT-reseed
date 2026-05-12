import { onMessage, sendMessage } from "@/messages.ts";
import { ptdIndexDb } from "../adapter/indexdb.ts";
import type { IReseedTask, IReseedResult, TReseedTaskStatus, ITorrentMetadata } from "@/shared/types.ts";
import { logger } from "./logger.ts";
import { sleep } from "~/helper.ts";
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

export async function getReseedResults(infoHash: string) {
  return await (await ptdIndexDb).getAllFromIndex("reseed_results", "by-source", infoHash);
}

onMessage("getReseedResults", async ({ data: infoHash }) => await getReseedResults(infoHash));

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

    if (results && results.length > 0) {
      for (const res of results) {
        // 执行 L3 深度校验
        let l3Status: IReseedResult["status"] = "pending";
        try {
          const isMatch = await performL3Check(task.infoHash, res);
          if (!isMatch) {
            l3Status = "ignored"; // 匹配失败，忽略
          }
        } catch (e) {
          logger({ msg: `L3 Check failed for ${res.site}`, data: e });
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
async function performL3Check(localInfoHash: string, remoteTorrent: any): Promise<boolean> {
  logger({ msg: `Performing L3 Deep Check for ${remoteTorrent.site}: ${remoteTorrent.title}` });

  const localMeta = (await (await ptdIndexDb).get("torrent_metadata", localInfoHash)) as ITorrentMetadata;
  if (!localMeta) return false;

  try {
    // 获取下载种子的配置（处理 Cookie 等）
    const downloadConfig = (await sendMessage("getSiteTorrentDownloadRequestConfig", {
      siteId: remoteTorrent.site,
      torrent: remoteTorrent,
    })) as any;

    const remoteFile = await getRemoteTorrentFile(downloadConfig);

    // 严格的文件列表比对
    return isStrictSameFileList(localMeta, remoteFile.info);
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
    .sort((x, y) => x.path.localeCompare(y.path));

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
