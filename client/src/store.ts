import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { EV, chainLinksValid, type Block, type NodeInfo, type ChainInitPayload, type RtcSignalIn } from "@blockchat/shared";
import { loadOrCreateIdentity, signMessage, type Identity } from "./identity";
import { saveChain, saveBlock, saveDM, loadDMs, loadChain, type DMMessage } from "./db";
import * as dm from "./dm";

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3001";

export type ViewId = "public" | "private" | "network" | "mynode";
export type Status = "idle" | "connecting" | "ready";

/** A locally-authored message shown with a mining animation until its block lands. */
export interface Pending {
  clientTs: number;
  data: string;
  status: "mining" | "mined";
  addedAt: number;
}

interface State {
  identity: Identity | null;
  status: Status;
  initialized: boolean;
  view: ViewId;
  chain: Block[];
  peers: NodeInfo[];
  pending: Pending[];
  connectedSince: number | null;
  dms: Record<string, DMMessage[]>;
  dmStatus: Record<string, dm.DMStatus>;
  activePeer: string | null;

  ensureIdentity: () => void;
  initialize: () => void;
  setView: (v: ViewId) => void;
  send: (data: string) => void;
  openDM: (author: string) => void;
  sendDM: (text: string) => void;
}

let socket: Socket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

export const useStore = create<State>((set, get) => ({
  identity: null,
  status: "idle",
  initialized: false,
  view: "public",
  chain: [],
  peers: [],
  pending: [],
  connectedSince: null,
  dms: {},
  dmStatus: {},
  activePeer: null,

  ensureIdentity: () => {
    if (!get().identity) set({ identity: loadOrCreateIdentity() });
  },

  initialize: () => {
    if (socket) return;
    get().ensureIdentity();
    const id = get().identity!;
    set({ status: "connecting" });

    socket = io(SERVER_URL, { transports: ["websocket", "polling"] });

    dm.configure({
      identity: id,
      sendSignal: (to, data) => socket!.emit(EV.rtcSignal, { to, data }),
      onStatus: (peer, status) => set((s) => ({ dmStatus: { ...s.dmStatus, [peer]: status } })),
      onMessage: (msg) => {
        saveDM(msg);
        set((s) => ({ dms: { ...s.dms, [msg.peer]: [...(s.dms[msg.peer] || []), msg] } }));
      },
      onOpen: (peer) =>
        set((s) => ({ activePeer: s.activePeer ?? peer, dms: { ...s.dms, [peer]: s.dms[peer] || [] } })),
    });

    socket.on("connect", () => {
      socket!.emit(EV.hello, { author: id.author });
      set({ status: "ready", initialized: true, connectedSince: Date.now() });
    });
    socket.on(EV.chainInit, async ({ chain: serverChain }: ChainInitPayload) => {
      // Reconcile, "longest valid chain wins" — but only trust a local replica
      // that is structurally intact. A broken/Frankenstein replica (left over
      // from the earlier resetting era) is discarded so we adopt the server's
      // chain and heal. Ties go to the server, so every device converges.
      const local = await loadChain();
      const mine = chainLinksValid(local) ? local : [];
      if (serverChain.length >= mine.length) {
        set({ chain: serverChain });
        saveChain(serverChain); // clears + rewrites the replica to match
      } else {
        // Our valid replica is longer — the server was likely wiped. Keep ours
        // and offer it back so the server (and everyone) can recover.
        set({ chain: mine });
        saveChain(mine);
        socket?.emit(EV.chainOffer, { chain: mine });
      }
    });
    socket.on(EV.blockNew, (b: Block) => {
      set((s) => (s.chain.some((x) => x.index === b.index) ? s : { chain: [...s.chain, b] }));
      saveBlock(b);
      // resolve the mining animation for our own just-confirmed message
      const me = get().identity?.author;
      const p = b.author === me ? get().pending.find((x) => x.clientTs === b.clientTs) : undefined;
      if (p) {
        const delay = Math.max(0, 700 - (Date.now() - p.addedAt)); // keep the spinner visible
        setTimeout(() => {
          set((s) => ({ pending: s.pending.map((x) => (x.clientTs === b.clientTs ? { ...x, status: "mined" } : x)) }));
          setTimeout(() => set((s) => ({ pending: s.pending.filter((x) => x.clientTs !== b.clientTs) })), 850);
        }, delay);
      }
    });
    socket.on(EV.peersUpdate, (peers: NodeInfo[]) => set({ peers }));
    socket.on(EV.rtcSignal, ({ from, data }: RtcSignalIn) => dm.handleSignal(from, data));
    socket.on(EV.rtcUnavailable, ({ to }: { to: string }) =>
      set((s) => ({ dmStatus: { ...s.dmStatus, [to]: "offline" } }))
    );
    socket.on("disconnect", () => set({ status: "connecting" }));

    // heartbeat so the bootstrap node keeps us "live" rather than decaying to "idle"
    if (!heartbeat) {
      heartbeat = setInterval(() => {
        if (socket?.connected) socket.emit(EV.ping);
      }, 25_000);
    }
  },

  setView: (view) => set({ view }),

  send: (data) => {
    const id = get().identity;
    if (!socket || !id || !data.trim()) return;
    const clientTs = Date.now();
    const signature = signMessage(id, clientTs, data);
    socket.emit(EV.newMessage, { author: id.author, clientTs, data, signature });
    set((s) => ({ pending: [...s.pending, { clientTs, data, status: "mining", addedAt: Date.now() }] }));
  },

  openDM: (author) => {
    if (!author || author === get().identity?.author) return;
    set({ activePeer: author, view: "private" });
    if (!get().dms[author]) {
      loadDMs(author).then((history) => set((s) => ({ dms: { ...s.dms, [author]: history } })));
    }
    dm.connect(author);
  },

  sendDM: (text) => {
    const peer = get().activePeer;
    if (!peer || !text.trim()) return;
    const msg = dm.send(peer, text);
    if (msg) {
      saveDM(msg);
      set((s) => ({ dms: { ...s.dms, [peer]: [...(s.dms[peer] || []), msg] } }));
    }
  },
}));
