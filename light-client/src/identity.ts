import nacl from "tweetnacl";
import { bytesToBase64, base64ToBytes, signedPayload, utf8 } from "@blockchat/shared";

export interface Identity {
  author: string; // base64 ed25519 public key
  secret: Uint8Array;
}

const KEY = "blockchat-light-id";

/** Load this device's keypair from localStorage, or generate one (no signup). */
export function loadOrCreateIdentity(): Identity {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    const kp = nacl.sign.keyPair.fromSecretKey(base64ToBytes(saved));
    return { author: bytesToBase64(kp.publicKey), secret: kp.secretKey };
  }
  const kp = nacl.sign.keyPair();
  localStorage.setItem(KEY, bytesToBase64(kp.secretKey));
  return { author: bytesToBase64(kp.publicKey), secret: kp.secretKey };
}

/** Sign a message exactly as a full node will verify it: over author|clientTs|data. */
export function signMessage(id: Identity, clientTs: number, data: string): string {
  return bytesToBase64(nacl.sign.detached(utf8(signedPayload(id.author, clientTs, data)), id.secret));
}
