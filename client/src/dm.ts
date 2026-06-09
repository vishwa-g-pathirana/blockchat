import nacl from "tweetnacl";
import ed2curve from "ed2curve";
import { base64ToBytes, bytesToBase64, utf8 } from "@blockchat/shared";
import type { Identity } from "./identity";
import type { DMMessage } from "./db";

export type DMStatus = "connecting" | "connected" | "offline" | "closed";

interface Conn {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  sharedKey: Uint8Array;
  remoteSet: boolean;
  pending: RTCIceCandidateInit[];
}

interface Deps {
  identity: Identity;
  sendSignal: (to: string, data: unknown) => void;
  onStatus: (peer: string, status: DMStatus) => void;
  onMessage: (msg: DMMessage) => void;
  onOpen: (peer: string) => void;
}

const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const log = (...a: unknown[]) => console.log("[dm]", ...a);

let deps: Deps | null = null;
let curveSecret: Uint8Array | null = null;
const conns = new Map<string, Conn>();

export function configure(d: Deps) {
  deps = d;
  curveSecret = ed2curve.convertSecretKey(d.identity.secretKey);
}

/** Deterministic single initiator: the node with the smaller author sends the offer. */
function amInitiator(peer: string): boolean {
  return deps!.identity.author < peer;
}

/** Authenticated shared key — derived purely from the two nodes' identity keys. */
function sharedKeyFor(peer: string): Uint8Array {
  const theirCurve = ed2curve.convertPublicKey(base64ToBytes(peer));
  if (!theirCurve) throw new Error("invalid peer public key");
  return nacl.box.before(theirCurve, curveSecret!);
}

function decrypt(raw: string, key: Uint8Array): string | null {
  try {
    const { n, c } = JSON.parse(raw);
    const pt = nacl.box.open.after(base64ToBytes(c), base64ToBytes(n), key);
    return pt ? new TextDecoder().decode(pt) : null;
  } catch {
    return null;
  }
}

function wire(conn: Conn, peer: string, ch: RTCDataChannel) {
  conn.channel = ch;
  const opened = () => {
    deps!.onStatus(peer, "connected");
    deps!.onOpen(peer);
    log("channel open", peer.slice(0, 6));
  };
  ch.onopen = opened;
  if (ch.readyState === "open") opened(); // responder's channel may already be open
  ch.onclose = () => deps!.onStatus(peer, "closed");
  ch.onmessage = (ev) => {
    const text = decrypt(ev.data, conn.sharedKey);
    if (text != null) deps!.onMessage({ peer, dir: "in", text, ts: Date.now() });
  };
}

function ensureConn(peer: string): Conn {
  const existing = conns.get(peer);
  if (existing) return existing;

  const pc = new RTCPeerConnection({ iceServers: ICE });
  const conn: Conn = { pc, channel: null, sharedKey: sharedKeyFor(peer), remoteSet: false, pending: [] };
  conns.set(peer, conn);

  pc.onicecandidate = (e) => {
    if (e.candidate) deps!.sendSignal(peer, { candidate: e.candidate });
  };
  pc.oniceconnectionstatechange = () => log("ice", peer.slice(0, 6), pc.iceConnectionState);
  pc.onconnectionstatechange = () => {
    log("conn", peer.slice(0, 6), pc.connectionState);
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") deps!.onStatus(peer, "offline");
    else if (pc.connectionState === "closed") deps!.onStatus(peer, "closed");
  };
  // only the responder waits for an inbound data channel; the initiator creates it
  if (!amInitiator(peer)) pc.ondatachannel = (e) => wire(conn, peer, e.channel);

  return conn;
}

async function startOffer(peer: string) {
  const conn = ensureConn(peer);
  if (conn.channel) return; // offer already created
  wire(conn, peer, conn.pc.createDataChannel("chat"));
  const offer = await conn.pc.createOffer();
  await conn.pc.setLocalDescription(offer);
  log("-> offer", peer.slice(0, 6));
  deps!.sendSignal(peer, { sdp: conn.pc.localDescription });
}

/** Open (or re-surface) a connection to a peer. Roles are deterministic, so no glare. */
export function connect(peer: string) {
  const existing = conns.get(peer);
  if (existing?.channel?.readyState === "open") {
    deps!.onStatus(peer, "connected");
    return;
  }
  ensureConn(peer);
  deps!.onStatus(peer, "connecting");
  if (amInitiator(peer)) {
    log("role=initiator", peer.slice(0, 6));
    void startOffer(peer);
  } else {
    log("role=responder, requesting", peer.slice(0, 6));
    deps!.sendSignal(peer, { request: true }); // ask the initiator to start
  }
}

/** Handle an inbound signal relayed from `from`. */
export async function handleSignal(from: string, data: any) {
  const conn = ensureConn(from);
  if (!conn.remoteSet && !conn.channel) deps!.onOpen(from); // surface incoming conversation

  try {
    if (data?.request) {
      if (amInitiator(from)) {
        log("<- request", from.slice(0, 6));
        void startOffer(from);
      }
      return;
    }
    if (data?.sdp) {
      log("<- sdp", data.sdp.type, from.slice(0, 6));
      await conn.pc.setRemoteDescription(data.sdp);
      conn.remoteSet = true;
      for (const c of conn.pending) await conn.pc.addIceCandidate(c).catch(() => {});
      conn.pending = [];
      if (data.sdp.type === "offer") {
        const answer = await conn.pc.createAnswer();
        await conn.pc.setLocalDescription(answer);
        log("-> answer", from.slice(0, 6));
        deps!.sendSignal(from, { sdp: conn.pc.localDescription });
      }
    } else if (data?.candidate) {
      if (conn.remoteSet) await conn.pc.addIceCandidate(data.candidate).catch(() => {});
      else conn.pending.push(data.candidate);
    }
  } catch (e) {
    log("signal error", from.slice(0, 6), String(e));
  }
}

/** Encrypt + send a message; returns the local echo or null if not connected. */
export function send(peer: string, text: string): DMMessage | null {
  const conn = conns.get(peer);
  if (!conn || !conn.channel || conn.channel.readyState !== "open") return null;
  const nonce = nacl.randomBytes(24);
  const ct = nacl.box.after(utf8(text), nonce, conn.sharedKey);
  conn.channel.send(JSON.stringify({ n: bytesToBase64(nonce), c: bytesToBase64(ct) }));
  return { peer, dir: "out", text, ts: Date.now() };
}

/**
 * Dev-only smoke test: two RTCPeerConnections in this page exchange an
 * ed2curve + nacl.box encrypted message over a real RTCDataChannel.
 */
export async function selfTest(): Promise<string> {
  const a = nacl.sign.keyPair();
  const b = nacl.sign.keyPair();
  const aShared = nacl.box.before(ed2curve.convertPublicKey(b.publicKey)!, ed2curve.convertSecretKey(a.secretKey));
  const bShared = nacl.box.before(ed2curve.convertPublicKey(a.publicKey)!, ed2curve.convertSecretKey(b.secretKey));

  const pcA = new RTCPeerConnection({ iceServers: ICE });
  const pcB = new RTCPeerConnection({ iceServers: ICE });
  pcA.onicecandidate = (e) => e.candidate && pcB.addIceCandidate(e.candidate);
  pcB.onicecandidate = (e) => e.candidate && pcA.addIceCandidate(e.candidate);

  const got = new Promise<string>((resolve) => {
    pcB.ondatachannel = (e) => {
      e.channel.onmessage = (m) => {
        const { n, c } = JSON.parse(m.data);
        const pt = nacl.box.open.after(base64ToBytes(c), base64ToBytes(n), bShared);
        resolve(pt ? new TextDecoder().decode(pt) : "DECRYPT_FAIL");
      };
    };
  });

  const chA = pcA.createDataChannel("t");
  const offer = await pcA.createOffer();
  await pcA.setLocalDescription(offer);
  await pcB.setRemoteDescription(offer);
  const answer = await pcB.createAnswer();
  await pcB.setLocalDescription(answer);
  await pcA.setRemoteDescription(answer);
  await new Promise<void>((res) => (chA.onopen = () => res()));

  const nonce = nacl.randomBytes(24);
  const ct = nacl.box.after(utf8("e2e over webrtc ✓"), nonce, aShared);
  chA.send(JSON.stringify({ n: bytesToBase64(nonce), c: bytesToBase64(ct) }));
  return got;
}

if ((import.meta as any).env?.DEV) (window as any).__dmSelfTest = selfTest;
