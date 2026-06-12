# Deploying BlockChat (free, on Render)

Two pieces ship: the **bootstrap node** (a long-running Node + WebSocket service) and the
**React frontend** (static files). Both run free on Render via the [`render.yaml`](render.yaml)
blueprint. You need a free **GitHub** account and a free **Render** account.

---

## 1 · Push the code to GitHub

The repo is already committed locally. Create an **empty** repo on github.com (no README/.gitignore),
then from the project root:

```bash
git remote add origin https://github.com/<your-username>/blockchat.git
git push -u origin main
```

> Over HTTPS, GitHub asks for a password — use a **Personal Access Token**, not your account
> password (GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) →
> generate one with `repo` scope). Or set up SSH and use the `git@github.com:...` URL.

## 2 · Deploy both services on Render

1. Go to **render.com → New + → Blueprint**.
2. **Connect your GitHub** and pick the `blockchat` repo. Render reads `render.yaml` and proposes
   two services: **`blockchat-node`** (backend) and **`blockchat-web`** (frontend). Click **Apply**.
3. Wait for **`blockchat-node`** to finish (first build compiles `better-sqlite3`, ~2–4 min).
   Open its URL — you should see `BlockChat bootstrap node · height N`. **Copy that URL**
   (e.g. `https://blockchat-node-xxxx.onrender.com`).

## 3 · Point the frontend at the backend

The frontend needs to know the backend's address **at build time**:

1. Render → **`blockchat-web`** → **Environment** → add:
   `VITE_SERVER_URL = https://blockchat-node-xxxx.onrender.com`  *(your node URL from step 2)*
2. Save → Render rebuilds the static site automatically.
3. Open the **`blockchat-web`** URL → **INITIALIZE NODE**. You're live. Share the URL — open it in
   two devices to see blocks propagate and to use private chat.

---

## Good to know (free-tier behavior)

- **The backend sleeps after ~15 min idle.** The first visit after a sleep takes ~50s to cold-start;
  you'll see the **"⟳ reconnecting…"** pill until it's up, then it connects automatically.
- **Keeping the public chain (two layers of persistence).** By default the bootstrap node writes the
  chain to `blockchat.db`. On a host with an **ephemeral disk** (Render free, Glitch) that file is
  wiped on restart, which would reset the chain. Two mechanisms guard against this:
  1. **Durable storage —** set the `DB_PATH` env var to a folder that survives restarts. On **Glitch**
     that's the special persistent `.data/` directory: set `DB_PATH=.data/blockchat.db`. The server
     auto-creates the folder on boot. (On Render free there is no persistent disk — use a paid disk or
     a hosted DB like Turso/libSQL; locally/dev you can leave `DB_PATH` unset.)
  2. **Peer recovery + merge —** even if the server's storage is ever wiped, every browser keeps a full
     replica of the chain in IndexedDB. When a client reconnects, it offers its replica back if it's
     longer or carries any message the server is missing. The server **reconciles** the two (a
     blockchain "reorg"): it validates the offered chain (hashes, proof-of-work, signatures), takes the
     **longer valid chain as the backbone**, and **replays any messages the other branch had on top** —
     so even if a short chain comes online first and gets extended before the real long chain reappears,
     no messages are lost. This works because a signature covers only `author|clientTs|data`, never the
     block's position, so a message can be re-mined at a new index and still verify. As long as one
     client with the chain reconnects, the network heals itself. (Note: with the demo proof-of-work
     difficulty the "longest valid chain wins" tiebreak is only weakly secured — fine for a learning
     project.)
  Your node **identity** always persists regardless (it lives in the browser's localStorage).
- **Private (WebRTC) chat** connects directly peer-to-peer using a public STUN server. It works across
  most home networks; very restrictive/symmetric NATs may need a **TURN** server — add one to the
  `ICE` list in [`client/src/dm.ts`](client/src/dm.ts) (Cloudflare and Metered offer free TURN).

## Local development (unchanged)

```bash
npm install
npm run dev      # bootstrap node :3001 + client :5173
```
