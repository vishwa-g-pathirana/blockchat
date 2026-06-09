import nacl from "tweetnacl";
import { bytesToBase64, base64ToBytes, shortId, signedPayload, utf8 } from "@blockchat/shared";

const STORAGE_KEY = "blockchat:identity:v1";

export interface Identity {
  author: string; // base64 ed25519 public key
  shortId: string;
  createdAt: number;
  secretKey: Uint8Array; // kept only in memory; persisted as base64
}

/** Load this device's node identity, or generate a fresh ed25519 keypair. */
export function loadOrCreateIdentity(): Identity {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const o = JSON.parse(raw) as { author: string; createdAt: number; secretKey: string };
      return { author: o.author, shortId: shortId(o.author), createdAt: o.createdAt, secretKey: base64ToBytes(o.secretKey) };
    } catch {
      /* fall through and regenerate */
    }
  }
  const kp = nacl.sign.keyPair();
  const author = bytesToBase64(kp.publicKey);
  const identity: Identity = { author, shortId: shortId(author), createdAt: Date.now(), secretKey: kp.secretKey };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ author, createdAt: identity.createdAt, secretKey: bytesToBase64(kp.secretKey) })
  );
  return identity;
}

/** Detached ed25519 signature over the canonical signed payload. */
export function signMessage(id: Identity, clientTs: number, data: string): string {
  const sig = nacl.sign.detached(utf8(signedPayload(id.author, clientTs, data)), id.secretKey);
  return bytesToBase64(sig);
}
