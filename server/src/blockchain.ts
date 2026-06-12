import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import {
  canonicalBlock,
  signedPayload,
  base64ToBytes,
  utf8,
  type Block,
} from "@blockchat/shared";

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

  /** Does this block's hash satisfy the proof-of-work difficulty? */
  private hasProofOfWork(b: Block): boolean {
    return b.hash.startsWith("0".repeat(this.difficulty));
  }

  /**
   * Verify an entire chain offered by a client: correct genesis, contiguous
   * indices, intact prevHash links, recomputed hashes, valid proof-of-work, and
   * (for non-genesis blocks) a valid ed25519 signature by the stated author.
   */
  validateChain(c: Block[]): boolean {
    if (!Array.isArray(c) || c.length === 0) return false;
    const g = c[0];
    if (g.index !== 0) return false;
    if (g.hash !== sha256(canonicalBlock(g)) || !this.hasProofOfWork(g)) return false;
    for (let i = 1; i < c.length; i++) {
      const b = c[i];
      const prev = c[i - 1];
      if (b.index !== i) return false;
      if (b.prevHash !== prev.hash) return false;
      if (b.hash !== sha256(canonicalBlock(b)) || !this.hasProofOfWork(b)) return false;
      try {
        const ok = nacl.sign.detached.verify(
          utf8(signedPayload(b.author, b.clientTs, b.data)),
          base64ToBytes(b.signature),
          base64ToBytes(b.author)
        );
        if (!ok) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Adopt a client-offered chain if it is strictly longer than ours and fully
   * valid. Lets the network heal the server's chain after an ephemeral-disk
   * reset, "longest valid chain wins" style. Returns true if adopted.
   */
  replaceChain(c: Block[]): boolean {
    if (c.length <= this.chain.length) return false;
    if (!this.validateChain(c)) return false;
    const rewrite = this.db.transaction((blocks: Block[]) => {
      this.db.exec("DELETE FROM blocks");
      for (const b of blocks) this.insertStmt.run(b);
    });
    rewrite(c);
    this.chain = [...c];
    return true;
  }
}
