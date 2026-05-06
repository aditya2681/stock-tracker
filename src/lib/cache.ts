import Dexie, { type Table } from "dexie";
import type { AppSnapshot } from "../types";

interface CacheRecord {
  key: string;
  snapshot: AppSnapshot;
  updatedAt: number;
}

class StockTrackCache extends Dexie {
  snapshots!: Table<CacheRecord, string>;

  constructor() {
    super("stocktrack-cache");
    this.version(1).stores({
      snapshots: "key, updatedAt"
    });
  }
}

const db = new StockTrackCache();

export async function loadSnapshot(): Promise<AppSnapshot | null> {
  const cached = await db.snapshots.get("app");
  return cached?.snapshot ?? null;
}

export async function saveSnapshot(snapshot: AppSnapshot): Promise<void> {
  await db.snapshots.put({
    key: "app",
    snapshot,
    updatedAt: Date.now()
  });
}
