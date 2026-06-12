/**
 * A throwaway "light client": generates an identity, signs a message, and POSTs
 * it to a node's /tx endpoint. Usage:  npm run send -- "your message"
 * Target a specific node with URL, e.g.  URL=http://localhost:7002 npm run send -- "hi"
 */
import nacl from "tweetnacl";
import { bytesToBase64, signedPayload, utf8 } from "@blockchat/shared";

const url = process.env.URL || "http://localhost:7001";
const data = process.argv.slice(2).join(" ") || "gm from a light client";

const kp = nacl.sign.keyPair();
const author = bytesToBase64(kp.publicKey);
const clientTs = Date.now();
const signature = bytesToBase64(nacl.sign.detached(utf8(signedPayload(author, clientTs, data)), kp.secretKey));

const res = await fetch(url + "/tx", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ author, clientTs, data, signature }),
});
console.log(`${url} ←`, JSON.stringify(await res.json()), `"${data}"`);
