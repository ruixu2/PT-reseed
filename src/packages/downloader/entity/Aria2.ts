/**
 * @see https://aria2.github.io/manual/en/html/aria2c.html#json-rpc-interface
 */
import {
  AbstractBittorrentClient,
  CAddTorrentOptions,
  CustomPathDescription,
  CTorrent,
  TorrentClientConfig,
  TorrentClientMetaData,
  CTorrentFilterRules,
  CTorrentState,
  CAddTorrentResult,
} from "../types";
import urlJoin from "url-join";
import axios from "axios";
import { getRemoteTorrentFile } from "../utils";
import { nanoid } from "nanoid";

export const clientConfig: TorrentClientConfig = {
  type: "Aria2",
  name: "Aria2",
  address: "http://localhost:6800/jsonrpc",
  username: "",
  password: "",
  timeout: 60 * 1e3,
};

// noinspection JSUnusedGlobalSymbols
export const clientMetaData: TorrentClientMetaData = {
  description: "aria2 是一个轻量级、多协议和多源的命令行下载实用程序。",
  warning: ["Aria2 不支持删除种子时同时删除数据"],
  feature: {
    CustomPath: {
      allowed: true,
      description: CustomPathDescription,
    },
    DefaultAutoStart: {
      allowed: true,
    },
  },
};

interface rawTask {
  gid: string;
  status: "active" | "waiting" | "paused" | "error" | "complete" | "removed";
  totalLength: number;
  completedLength: number;
  uploadLength: number;
  bitfield: string;
  downloadSpeed: number;
  uploadSpeed: number;
  infoHash?: string;
  numSeeders?: number;
  seeder?: "true" | "false";
  connections: number;
  errorCode?: string;
  errorMessage?: string;
  followedBy?: string[];
  following?: string;
  belongsTo?: string;
  dir: string;
  files: Array<{
    index: string;
    path: string;
    length: number;
    completedLength: number;
    selected: "true" | "false";
    uris: Array<{ uri: string; status: "used" | "waiting" }>;
  }>;
  bittorrent?: {
    announceList: string[][];
    comment: string;
    creationDate: number;
    mode: "single" | "multi";
    info: {
      name: string;
    };
  };
}

// noinspection JSUnusedGlobalSymbols
export default class Aria2 extends AbstractBittorrentClient<TorrentClientConfig> {
  readonly version = "v0.1.0";

  constructor(options: Partial<TorrentClientConfig> = {}) {
    super({ ...clientConfig, ...options });
  }

  async ping(): Promise<boolean> {
    try {
      const {
        data: { result: version },
      } = await this.methodSend<{ version: string }>("aria2.getVersion");
      return !!version;
    } catch (e) {
      return false;
    }
  }

  protected async getClientVersionFromRemote(): Promise<string> {
    const {
      data: { result: version },
    } = await this.methodSend<{ version: string; enabledFeatures: string[] }>("aria2.getVersion");
    return `${version.version} (${version.enabledFeatures.join(", ")})`;
  }

  override async getClientFreeSpace(): Promise<number | "N/A"> {
    return "N/A";
  }

  private async methodSend<T>(method: string, params: any[] = []): Promise<{ result: T }> {
    return (
      await axios.post(
        this.config.address,
        {
          jsonrpc: "2.0",
          method: method,
          params: [`token:${this.config.password}`, ...params],
          id: nanoid(),
        },
        {
          timeout: this.config.timeout,
        },
      )
    ).data;
  }

  async addTorrent(url: string, options: Partial<CAddTorrentOptions> = {}): Promise<CAddTorrentResult> {
    const addResult = { success: false } as CAddTorrentResult;

    const addTorrentOptions: any = {
      paused: options.addAtPaused ? "true" : "false",
    };

    if (options.savePath) {
      addTorrentOptions.dir = options.savePath;
    }

    // Aria2 似乎并不直接在推送时支持标签（Category）
    // 不过可以通过其通用配置项进行设置

    if (options.uploadSpeedLimit && options.uploadSpeedLimit > 0) {
      addTorrentOptions["max-upload-limit"] = `${options.uploadSpeedLimit}M`;
    }

    try {
      let aria2Gid: string;
      if (url.startsWith("magnet:") || !options.localDownload) {
        const { result: gid } = await this.methodSend<string>("aria2.addUri", [[url], addTorrentOptions]);
        aria2Gid = gid;
      } else {
        const torrent = await getRemoteTorrentFile({
          url,
          ...(options.localDownloadOption || {}),
        });

        const { result: gid } = await this.methodSend<string>("aria2.addTorrent", [
          torrent.metadata.base64(),
          [],
          addTorrentOptions,
        ]);
        aria2Gid = gid;
      }

      addResult.success = !!aria2Gid;
      addResult.id = aria2Gid;
    } catch (e) {
      addResult.message = e;
    }

    return addResult;
  }

  async getAllTorrents(): Promise<CTorrent[]> {
    const methods: Array<[string, any[]]> = [
      ["aria2.tellActive", []],
      ["aria2.tellWaiting", [0, 1000]],
      ["aria2.tellStopped", [0, 1000]],
    ];

    const torrents: CTorrent[] = [];
    const results = await Promise.all(methods.map(([method, params]) => this.methodSend<rawTask[]>(method, params)));

    results.forEach((res) => {
      res.result.forEach((task) => {
        if (task.bittorrent) {
          torrents.push(this.parseRawTorrent(task));
        }
      });
    });

    return torrents;
  }

  override async getTorrent(id: string): Promise<CTorrent<rawTask>> {
    const { result: task } = await this.methodSend<rawTask>("aria2.tellStatus", [id]);
    return this.parseRawTorrent(task);
  }

  async pauseTorrent(id: string): Promise<boolean> {
    await this.methodSend<string>("aria2.pause", [id]);
    return true;
  }

  async removeTorrent(id: string, removeData?: boolean): Promise<boolean> {
    await this.methodSend<string>("aria2.remove", [id]);
    await this.methodSend<"OK">("aria2.removeDownloadResult", [id]);
    return true;
  }

  public async getTorrentFiles(id: string): Promise<any[]> {
    const { result: task } = await this.methodSend<rawTask>("aria2.tellStatus", [id]);
    if (!task || !task.files) {
      return [];
    }

    return task.files.map((file) => ({
      name: file.path,
      path: file.path,
      length: file.length,
    }));
  }

  async resumeTorrent(id: any): Promise<boolean> {
    await this.methodSend<string>("aria2.unpause", [id]);
    return true;
  }

  private parseRawTorrent(rawTask: rawTask): CTorrent<rawTask> {
    const progress = rawTask.completedLength / rawTask.totalLength || 0;
    let state = CTorrentState.unknown;
    switch (rawTask.status) {
      case "active":
        state = progress >= 100 ? CTorrentState.seeding : CTorrentState.downloading;
        break;

      case "error":
      case "removed":
        state = CTorrentState.error;
        break;

      case "complete":
      case "paused":
        state = CTorrentState.paused;
        break;

      case "waiting":
        state = CTorrentState.queued;
        break;
    }

    return {
      id: rawTask.gid,
      infoHash: rawTask.infoHash!,
      name: rawTask.bittorrent!.info.name,
      progress,
      isCompleted: progress >= 100,
      ratio: rawTask.uploadLength / rawTask.totalLength || 0,
      dateAdded: 0, // Aria2 不返回添加时间
      savePath: rawTask.dir,
      state,
      totalSize: Number(rawTask.totalLength),
      totalUploaded: Number(rawTask.uploadLength),
      totalDownloaded: Number(rawTask.completedLength),
      uploadSpeed: Number(rawTask.uploadSpeed),
      downloadSpeed: Number(rawTask.downloadSpeed),
      raw: rawTask,
      clientId: this.config.id,
    } as CTorrent<rawTask>;
  }
}
