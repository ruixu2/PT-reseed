import { openDB, type IDBPDatabase } from "idb";
import { IPtdDBSchemaV1, IPtdDBSchema, IPtdDBSchemaV2 } from "@/shared/types.ts";

export const ptdIndexDb = openDB<IPtdDBSchema>("ptd", 5, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      const dbV1 = db as unknown as IDBPDatabase<IPtdDBSchemaV1>;
      dbV1.createObjectStore("social_information");
    }
    if (oldVersion < 2) {
      const dbV2 = db as unknown as IDBPDatabase<IPtdDBSchemaV2>;
      dbV2.createObjectStore("download_history", { keyPath: "id", autoIncrement: true });
    }
    if (oldVersion < 3) {
      db.createObjectStore("favicon");
    }
    if (oldVersion < 4) {
      db.createObjectStore("torrent_metadata", { keyPath: "infoHash" });
    }
    if (oldVersion < 5) {
      db.createObjectStore("reseed_queue", { keyPath: "infoHash" });
      const resultStore = db.createObjectStore("reseed_results", { keyPath: "id" });
      resultStore.createIndex("by-source", "sourceInfoHash");
    }
  },
});
