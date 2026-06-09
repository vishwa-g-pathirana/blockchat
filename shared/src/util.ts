import type { Block } from "./types";

/* base64 <-> bytes — uses btoa/atob, which exist in browsers and Node 18+. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

/** Short, human-readable node id derived deterministically from the pubkey. */
export function shortId(author: string): string {
  if (!author || author === "genesis") return "genesis";
  try {
    const hex = bytesToHex(base64ToBytes(author));
    return `${hex.slice(0, 4)}::${hex.slice(4, 8)}`;
  } catch {
    return author.slice(0, 8);
  }
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Exact bytes a node signs when authoring a message. */
export function signedPayload(author: string, clientTs: number, data: string): string {
  return `${author}|${clientTs}|${data}`;
}

/** Canonical string hashed to produce block.hash (same on client & server). */
export function canonicalBlock(
  b: Pick<Block, "index" | "timestamp" | "author" | "data" | "prevHash" | "nonce">
): string {
  return `${b.index}|${b.timestamp}|${b.author}|${b.data}|${b.prevHash}|${b.nonce}`;
}
