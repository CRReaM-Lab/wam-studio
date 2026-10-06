/**
 * Connexion temps réel à l'agent de transfert : un WebSocket simple sur `<agent>/ws`, servi par
 * le serveur de modulePre (l'agent Node et son Socket.IO ne sont plus utilisés).
 *
 * Messages dans les deux sens : `{ event, data }`, avec les mêmes noms d'événements que Socket.IO
 * (`command`, `subscribe` → ; `transfer:event`, `transfer:snapshot`, `agent:event`,
 * `command:ack` ←). L'objet rendu imite la petite partie de l'API Socket.IO dont se sert
 * `AgentTransfertClient` (on/off/emit, `connect`/`disconnect`, reconnexion automatique).
 */
type Ecouteur = (...args: unknown[]) => void;

type SocketAgent = {
  id?: string;
  connected: boolean;
  on: (event: string, handler: Ecouteur) => void;
  off: (event: string, handler: Ecouteur) => void;
  emit: (event: string, payload?: unknown) => void;
  disconnect: () => void;
};

/** `https://hote/agent` ou `/agent` → `wss://hote/agent/ws`. */
function urlWebSocket(agentBaseUrl: string): string {
  const url = new URL(agentBaseUrl, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/ws`;
  return url.toString();
}

export function creerSocketAgent(agentBaseUrl: string): SocketAgent {
  const adresse = urlWebSocket(agentBaseUrl);
  const ecouteurs = new Map<string, Set<Ecouteur>>();
  let ws: WebSocket | null = null;
  let arrete = false;
  let delaiReconnexionMs = 1000;
  let numero = 0;

  const declencher = (event: string, payload?: unknown) => {
    for (const handler of [...(ecouteurs.get(event) ?? [])]) handler(payload);
  };

  const socket: SocketAgent = {
    connected: false,
    on: (event, handler) => {
      if (!ecouteurs.has(event)) ecouteurs.set(event, new Set());
      ecouteurs.get(event)!.add(handler);
    },
    off: (event, handler) => {
      ecouteurs.get(event)?.delete(handler);
    },
    emit: (event, payload) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, data: payload ?? {} }));
      }
    },
    disconnect: () => {
      arrete = true;
      ws?.close();
    },
  };

  const ouvrir = () => {
    ws = new WebSocket(adresse);
    ws.onopen = () => {
      delaiReconnexionMs = 1000;
      numero += 1;
      socket.id = `ws-${numero}`;
      socket.connected = true;
      declencher("connect");
    };
    ws.onmessage = (message) => {
      try {
        const { event, data } = JSON.parse(String(message.data)) as { event?: string; data?: unknown };
        if (event) declencher(event, data);
      } catch {
        // message illisible : ignoré
      }
    };
    ws.onclose = () => {
      const etaitConnecte = socket.connected;
      socket.connected = false;
      if (etaitConnecte) declencher("disconnect");
      if (!arrete) {
        window.setTimeout(ouvrir, delaiReconnexionMs);
        delaiReconnexionMs = Math.min(delaiReconnexionMs * 2, 10000);
      }
    };
  };
  ouvrir();
  return socket;
}

export type { SocketAgent };
