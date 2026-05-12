/**
 * 存放一些不需要持久化（丢失没有关系的）的结构性数据，包括：
 * 1. 种子列表页面的多媒体数据
 * 2. 种子下载记录
 * 3. 辅种自动分析任务队列
 */

import type { DBSchema } from "idb";
import type { ISocialInformation } from "@ptd/social";
import type { TSiteID as TSiteKey } from "@ptd/site";
import type { CTorrentFile } from "@ptd/downloader";

import type { ITorrentDownloadMetadata, TTorrentDownloadKey } from "../common/download.ts";

export interface ITorrentMetadata {
  infoHash: string;
  name: string;
  totalSize: number;
  files: CTorrentFile[];
  trackers?: string[];
  originSite?: string; // TSiteID
  dateAdded?: number;
  clientId: string;
  savePath: string;
  imdbId?: string;
  doubanId?: string;
}

export type TReseedTaskStatus = "waiting" | "searching" | "matched" | "no_match" | "error" | "completed";

export interface IReseedTask {
  infoHash: string; // Source torrent infoHash (Primary Key)
  name: string;
  clientId: string;
  savePath: string;
  status: TReseedTaskStatus;
  addedAt: number;
  updatedAt: number;
  error?: string;
  progress?: number; // 0-100
}

export interface IReseedResult {
  id: string; // unique result id
  sourceInfoHash: string; // linked to IReseedTask
  siteId: string;
  torrentId: string;
  title: string;
  subTitle?: string;
  size: number;
  status: "pending" | "injected" | "ignored";
  data: any; // raw torrent data from search
}

export interface IPtdDBSchemaV1 extends DBSchema {
  social_information: {
    key: string;
    value: ISocialInformation;
  };
}

export interface IPtdDBSchemaV2 extends IPtdDBSchemaV1 {
  download_history: {
    key: TTorrentDownloadKey;
    value: ITorrentDownloadMetadata;
  };
}

export interface IPtdDBSchemaV3 extends IPtdDBSchemaV2 {
  favicon: {
    key: TSiteKey;
    value: string;
  };
}

export interface IPtdDBSchemaV4 extends IPtdDBSchemaV3 {
  torrent_metadata: {
    key: string; // infoHash
    value: ITorrentMetadata;
  };
}

export interface IPtdDBSchemaV5 extends IPtdDBSchemaV4 {
  reseed_queue: {
    key: string; // infoHash
    value: IReseedTask;
  };
  reseed_results: {
    key: string; // id
    value: IReseedResult;
    indexes: { "by-source": string };
  };
}

export interface IPtdDBSchema extends IPtdDBSchemaV5 {}
