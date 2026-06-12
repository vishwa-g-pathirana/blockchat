import Dexie, { type Table } from "dexie";
import type { Block } from "@blockchat/shared";

export interface DMMessage {
  peer: string; // the other node's author (pubkey)
  dir: "in" | "out";
  text: string;
  ts: number;
}

/** Local, device-only stores: the public chain replica + private DM history. */
class BlockchatDB extends Dexie {
  blocks!: Table<Block, number>;
  dms!: Table<DMMessage & { id?: number }, number>;
  constructor() {
    super("blockchat");
    this.version(1).stores({ blocks: "index,author" });
    this.version(2).stores({ blocks: "index,author", dms: "++id, peer, ts" });
  }
}

export const db = new BlockchatDB();

/** Replace the entire local replica so it exactly mirrors the adopted chain
 *  (clearing first prevents stale higher-index blocks lingering after a reset). */
export const saveChain = (chain: Block[]) =>
  db
    .transaction("rw", db.blocks, async () => {
      await db.blocks.clear();
      await db.blocks.bulkPut(chain);
    })
    .catch(() => {});
export const saveBlock = (b: Block) => db.blocks.put(b).catch(() => {});

/** The full local replica, ordered by index — used to re-seed the server after a reset. */
export const loadChain = (): Promise<Block[]> =>
  db.blocks.orderBy("index").toArray().catch(() => []);

export const saveDM = (m: DMMessage) => db.dms.add({ ...m }).catch(() => {});
export const loadDMs = (peer: string): Promise<DMMessage[]> =>
  db.dms.where("peer").equals(peer).sortBy("ts").catch(() => []);

export async function storageKB(): Promise<number> {
  try {
    const [blocks, dms] = await Promise.all([db.blocks.toArray(), db.dms.toArray()]);
    return Math.round((JSON.stringify(blocks).length + JSON.stringify(dms).length) / 1024);
  } catch {
    return 0;
  }
}
