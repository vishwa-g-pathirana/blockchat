import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Block } from "./types";

/**
 * Tiny on-disk persistence for a node's active chain (a JSON file). On boot the
 * node reloads it and re-validates every block through addBlock, so a restart
 * doesn't drop history. Throwaway-simple on purpose — swap for LevelDB/SQLite
 * if the chain ever grows large.
 */
export function saveChain(path: string, blocks: Block[]) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(blocks));
  } catch {
    /* best-effort */
  }
}

export function loadChain(path: string): Block[] {
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? (parsed as Block[]) : [];
  } catch {
    return [];
  }
}
