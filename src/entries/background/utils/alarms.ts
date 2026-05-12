import { format } from "date-fns";
import { defineJobScheduler } from "@webext-core/job-scheduler";
import { EResultParseStatus, type TSiteID } from "@ptd/site/types/base.ts";

import { extStorage } from "@/storage.ts";
import { onMessage, sendMessage } from "@/messages.ts";
import { IDownloadTorrentOption } from "@/shared/types.ts";

import { setupOffscreenDocument } from "./offscreen.ts";
import { sleep } from "~/helper.ts";

export enum EJobType {
  FlushUserInfo = "flushUserInfo",
  ReDownloadTorrent = "reDownloadTorrent",
  AutoCrossSeedScan = "autoCrossSeedScan",
  AutoResumeInjectedTorrents = "autoResumeInjectedTorrents",
}

const jobs = defineJobScheduler();

function autoResumeInjectedTorrents() {
  return async () => {
    await setupOffscreenDocument();

    const configStore = (await extStorage.getItem("config"))!;
    if (!configStore?.crossSeedControl?.autoResume) return;

    sendMessage("logger", { msg: "Running Auto-Resume check for injected torrents" }).catch();

    try {
      const allResults = (await sendMessage("getAllReseedResults", undefined)) as any[];
      const injectedResults = allResults.filter(
        (r) => r.status === "injected" && r.targetClientId && r.targetTorrentHash,
      );

      for (const res of injectedResults) {
        try {
          const torrents = (await sendMessage("getDownloaderTorrents", res.targetClientId)) as any[];
          const targetTorrent = torrents.find(
            (t) => t.infoHash === res.targetTorrentHash || t.id === res.targetTorrentHash,
          );

          if (targetTorrent) {
            // 如果进度达到 100%，或者已经是完成状态，且当前不是错误状态
            if (targetTorrent.progress >= 100 && targetTorrent.state !== "error") {
              sendMessage("logger", { msg: `Auto-resuming torrent: ${res.title}` }).catch();
              await sendMessage("resumeDownloaderTorrent", {
                downloaderId: res.targetClientId,
                torrentId: targetTorrent.id,
              });

              // 更新状态为 seeding
              res.status = "seeding";
              await sendMessage("saveReseedResult", res);
            }
          }
        } catch (e) {
          sendMessage("logger", { msg: `Failed to check/resume torrent ${res.title}`, data: e }).catch();
        }
      }
    } catch (e) {
      sendMessage("logger", { msg: "Failed to process auto-resume job", data: e }).catch();
    }
  };
}

// noinspection JSIgnoredPromiseFromCall
jobs.scheduleJob({
  id: EJobType.AutoResumeInjectedTorrents,
  type: "interval",
  duration: 1000 * 60 * 5, // check every 5 minutes
  immediate: true,
  execute: autoResumeInjectedTorrents(),
});

function autoCrossSeedScan() {
  return async () => {
    await setupOffscreenDocument();

    const configStore = (await extStorage.getItem("config"))!;
    const intervalHours = configStore?.crossSeedControl?.autoScanInterval || 0;

    if (!intervalHours) return;

    const curDate = new Date();
    let metadataStore = (await extStorage.getItem("metadata"))!;
    const lastScanAt = metadataStore.lastCrossSeedScanAt || 0;

    const nextScanTime = lastScanAt + intervalHours * 60 * 60 * 1000;
    if (curDate.getTime() < nextScanTime) {
      return;
    }

    sendMessage("logger", {
      msg: `Auto-scanning downloaders for cross-seeding at ${format(curDate, "yyyy-MM-dd HH:mm:ss")}`,
    }).catch();

    const enabledDownloaders = Object.values(metadataStore.downloaders).filter((d) => d.enabled);
    let totalAdded = 0;

    for (const downloader of enabledDownloaders) {
      try {
        const torrents = (await sendMessage("getDownloaderTorrents", downloader.id)) as any[];
        const finishedTorrents = torrents.filter((t) => t.isCompleted);
        await sendMessage("addTorrentsToReseedQueue", finishedTorrents);
        totalAdded += finishedTorrents.length;
      } catch (e) {
        sendMessage("logger", { msg: `Auto-scan failed for downloader ${downloader.id}`, data: e }).catch();
      }
    }

    sendMessage("logger", {
      msg: `Auto-scan finished. Added ${totalAdded} completed torrents to queue.`,
    }).catch();

    metadataStore = (await extStorage.getItem("metadata"))!;
    metadataStore.lastCrossSeedScanAt = curDate.getTime();
    await extStorage.setItem("metadata", metadataStore);
  };
}

// noinspection JSIgnoredPromiseFromCall
jobs.scheduleJob({
  id: EJobType.AutoCrossSeedScan,
  type: "interval",
  duration: 1000 * 60 * 30, // check every 30 minutes
  immediate: true,
  execute: autoCrossSeedScan(),
});

function autoFlushUserInfo(retryIndex: number = 0) {
  return async () => {
    await setupOffscreenDocument();

    const configStore = (await extStorage.getItem("config"))!;

    // 获取自动刷新参数
    const {
      enabled = false,
      interval = 1,
      afterTime = "00:00",
      retry: { max: retryMax = 0, interval: retryInterval = 5 } = {},
    } = configStore?.userInfo?.autoReflush ?? {};

    // 如果未启用自动刷新，则直接返回
    if (!enabled) {
      return;
    }

    const curDate = new Date();
    const curDateFormat = format(curDate, "yyyy-MM-dd");
    let metadataStore = (await extStorage.getItem("metadata"))!;

    // 如果不是重试，则要检查是否满足刷新条件
    if (retryIndex === 0) {
      // 检查当前时间是否在允许的刷新时间之后
      const [afterHour, afterMinute] = afterTime.split(":").map((v) => parseInt(v));
      if (curDate.getHours() < afterHour || (curDate.getHours() === afterHour && curDate.getMinutes() < afterMinute)) {
        sendMessage("logger", {
          msg: `Auto-refreshing user information paused since current time is before the allowed refresh time.`,
        }).catch();
        return;
      }

      metadataStore = (await extStorage.getItem("metadata"))!;
      const lastFlushDateFormat = format(metadataStore.lastUserInfoAutoFlushAt, "yyyy-MM-dd");

      // 如果不是同一天，则不检查距离上次刷新时间是否超过了设定的间隔，这样能保证至少每天刷新一次（即启动浏览器后第一次检查）
      if (curDateFormat === lastFlushDateFormat) {
        const nextFlushTime = metadataStore.lastUserInfoAutoFlushAt + interval * 60 * 60 * 1000; // interval in hours
        // 确保距离上次刷新时间已经超过了设定的间隔
        if (curDate.getTime() < nextFlushTime) {
          sendMessage("logger", {
            msg: `Auto-refreshing user information paused since refresh interval not reached.`,
          }).catch();
          return;
        }
      }
    }

    sendMessage("logger", {
      msg: `Auto-refreshing user information at ${curDateFormat}${retryIndex > 0 ? `(Retry #${retryIndex})` : ""}`,
    }).catch();

    let processedSiteCount = 0;
    const failFlushSites: TSiteID[] = [];

    /**
     * 由于是后台任务，所以我们不使用 promise 来并行处理，以确保 flushQueue 中永远只有一个任务在运行，
     * 防止用户设置的并发数过大而被浏览器block
     */
    metadataStore = (await extStorage.getItem("metadata"))!; // 遍历 metadataStore 中添加的站点
    for (const [siteId, siteConfig] of Object.entries(metadataStore.sites)) {
      if (!siteConfig.isOffline && siteConfig.allowQueryUserInfo) {
        try {
          // 检查当天的记录是否存在
          const thisSiteUserInfo = (await sendMessage("getSiteUserInfo", siteId)) ?? {};
          if (typeof thisSiteUserInfo[curDateFormat] === "undefined") {
            const userInfoResult = await sendMessage("getSiteUserInfoResult", siteId);
            if (userInfoResult.status !== EResultParseStatus.success) {
              failFlushSites.push(siteId);
            }
            processedSiteCount += 1;
          }
        } catch (e) {
          failFlushSites.push(siteId);
        }
      }
    }

    sendMessage("logger", {
      msg: `Auto-refreshing user information finished, ${processedSiteCount} sites processed, ${failFlushSites.length} failed.`,
      data: { failFlushSites },
    }).catch();

    // 将刷新时间存入 metadataStore
    metadataStore = (await extStorage.getItem("metadata"))!;
    metadataStore.lastUserInfoAutoFlushAt = new Date().getTime(); // 刷新时间应该是实际完成时间
    await extStorage.setItem("metadata", metadataStore);

    // 如果本次有失败的刷新操作，则设置重试
    if (failFlushSites.length > 0 && retryIndex < retryMax) {
      sendMessage("logger", {
        msg: `Retrying auto-refresh for ${failFlushSites.length} failed sites in ${retryInterval} minutes (Retry #${retryIndex + 1})`,
      }).catch();
      await jobs.scheduleJob({
        id: EJobType.FlushUserInfo + "-Retry-" + retryIndex,
        type: "once",
        date: +curDate + retryInterval * 60 * 1000, // retryInterval in minutes
        execute: autoFlushUserInfo(retryIndex + 1),
      });
    }
  };
}

// noinspection JSIgnoredPromiseFromCall
jobs.scheduleJob({
  id: EJobType.FlushUserInfo,
  type: "interval",
  duration: 1000 * 60 * 10, // check every 10 minutes
  immediate: true,
  execute: autoFlushUserInfo(),
});

function doReDownloadTorrent(downloadOption: IDownloadTorrentOption) {
  return async () => {
    await setupOffscreenDocument();
    // 按照相同的方式重新下载种子到下载器
    await sendMessage("downloadTorrent", downloadOption);
  };
}

onMessage("reDownloadTorrent", async ({ data }) => {
  // 如果需要等待的时间小于 30s，那么直接在 service worker 中等待
  if (data.leftInterval < 30 * 1000) {
    await sleep(data.leftInterval);
    doReDownloadTorrent(data)().catch(() => {
      sendMessage("setDownloadHistoryStatus", { downloadId: data.downloadId, status: "failed" }).catch();
    });
  } else {
    jobs
      .scheduleJob({
        id: EJobType.ReDownloadTorrent + "-" + data.downloadId,
        type: "once",
        date: Date.now() + 1000 * 30, // 0.5 minute later
        execute: doReDownloadTorrent(data),
      })
      .catch(() => {
        sendMessage("setDownloadHistoryStatus", { downloadId: data.downloadId, status: "failed" }).catch();
      });
  }
});
