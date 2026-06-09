import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { canonicalBlock, type Block } from "@blockchat/shared";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * The canonical public chain, held by the bootstrap node and persisted to
 * SQLite. The server assigns each block's index/timestamp/prevHash and mines
 * a small proof-of-work nonce, so there are never forks to resolve.
 */
export class Blockchain {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  chain: Block[] = [];
  readonly difficulty: number;

  constructor(path = "blockchat.db", difficulty = 2) {
    this.difficulty = difficulty;
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocks (
        idx INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        author TEXT NOT NULL,
        data TEXT NOT NULL,
        clientTs INTEGER NOT NULL,
        nonce INTEGER NOT NULL,
        prevHash TEXT NOT NULL,
        hash TEXT NOT NULL,
        signature TEXT NOT NULL
      );
    `);
    this.insertStmt = this.db.prepare(
      `INSERT INTO blocks (idx, timestamp, author, data, clientTs, nonce, prevHash, hash, signature)
       VALUES (@index, @timestamp, @author, @data, @clientTs, @nonce, @prevHash, @hash, @signature)`
    );
    this.load();
    if (this.chain.length === 0) this.createGenesis();
  }

  private load() {
    const rows = this.db.prepare("SELECT * FROM blocks ORDER BY idx ASC").all() as any[];
    this.chain = rows.map((r) => ({
      index: r.idx,
      timestamp: r.timestamp,
      author: r.author,
      data: r.data,
      clientTs: r.clientTs,
      nonce: r.nonce,
      prevHash: r.prevHash,
      hash: r.hash,
      signature: r.signature,
    }));
  }

  /** Find a nonce whose block hash has `difficulty` leading hex zeros. */
  private mine(base: Omit<Block, "nonce" | "hash" | "signature">): { nonce: number; hash: string } {
    const target = "0".repeat(this.difficulty);
    let nonce = 0;
    while (true) {
      const hash = sha256(canonicalBlock({ ...base, nonce }));
      if (hash.startsWith(target)) return { nonce, hash };
      nonce++;
    }
  }

  private persist(b: Block) {
    this.insertStmt.run(b);
    this.chain.push(b);
  }

  private createGenesis() {
    const base = {
      index: 0,
      timestamp: Date.now(),
      author: "genesis",
      data: "BlockChat genesis — the chain starts here",
      clientTs: Date.now(),
      prevHash: "0".repeat(64),
    };
    const { nonce, hash } = this.mine(base);
    this.persist({ ...base, nonce, hash, signature: "genesis" });
  }

  get head(): Block {
    return this.chain[this.chain.length - 1];
  }

  /** Build, mine and append a message block authored by `author`. */
  addMessageBlock(input: { author: string; data: string; clientTs: number; signature: string }): Block {
    const prev = this.head;
    const base = {
      index: prev.index + 1,
      timestamp: Date.now(),
      author: input.author,
      data: input.data,
      clientTs: input.clientTs,
      prevHash: prev.hash,
    };
    const { nonce, hash } = this.mine(base);
    const block: Block = { ...base, nonce, hash, signature: input.signature };
    this.persist(block);
    return block;
  }

  msgCountByAuthor(author: string): number {
    let n = 0;
    for (const b of this.chain) if (b.author === author) n++;
    return n;
  }
}
