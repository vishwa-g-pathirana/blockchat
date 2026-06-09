/** A single block on the public chain. */
export interface Block {
  index: number;
  timestamp: number;   // server-assigned (authoritative ordering)
  author: string;      // base64 ed25519 public key ("" / "genesis" for block 0)
  data: string;        // the message text
  clientTs: number;    // client clock when signed (part of the signed payload)
  nonce: number;       // proof-of-work nonce
  prevHash: string;
  hash: string;        // sha256 of canonicalBlock()
  signature: string;   // base64 detached ed25519 sig over signedPayload()
}

/** Public, anonymous metadata about a node, shown on the dashboard. */
export interface NodeInfo {
  id: string;          // short id derived from the pubkey, e.g. "a3f9::e7b1"
  author: string;      // base64 pubkey
  createdAt: number;   // first time this node was seen by the bootstrap node
  lastSeen: number;
  msgCount: number;
  status: "live" | "idle" | "gone";
}

/* ---- socket event payloads ---- */
export interface HelloPayload { author: string; }
export interface NewMessagePayload {
  author: string;
  clientTs: number;
  data: string;
  signature: string;
}
export interface ChainInitPayload { chain: Block[]; }

/* ---- WebRTC signaling (relayed by the bootstrap node; it never sees DM content) ---- */
export interface RtcSignalOut { to: string; data: unknown; }   // client -> server
export interface RtcSignalIn { from: string; data: unknown; }  // server -> client

/** Socket.IO event names, shared so client & server can't drift. */
export const EV = {
  hello: "node:hello",
  chainInit: "chain:init",
  newMessage: "message:new",
  blockNew: "block:new",
  peersUpdate: "peers:update",
  rtcSignal: "rtc:signal",
  rtcUnavailable: "rtc:unavailable",
  ping: "node:ping",
} as const;
