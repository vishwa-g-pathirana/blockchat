import { base64ToBytes } from "@blockchat/shared";

const PALETTE = ["#EB7400", "#00534E", "#FFBE29", "#8D153A"];

/** A tiny deterministic identicon derived from the node's public key. */
export default function Blockie({ author }: { author: string }) {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(author);
  } catch {
    bytes = new Uint8Array(16);
  }
  const cells = Array.from({ length: 16 }, (_, i) => PALETTE[(bytes[i % bytes.length] + i) % PALETTE.length]);
  return (
    <div className="blockie">
      {cells.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </div>
  );
}
