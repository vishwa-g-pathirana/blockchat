import { defineConfig } from "vite";

// The light client is a tiny static app that talks to a full node over HTTP/SSE.
export default defineConfig({
  server: { port: 5175 },
});
