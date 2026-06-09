export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const minsAgo = (ts: number) => Math.max(0, Math.round((Date.now() - ts) / 60000));
