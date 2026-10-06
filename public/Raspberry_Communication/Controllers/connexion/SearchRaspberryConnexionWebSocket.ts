/** Connexion WebSocket vers le serveur Raspberry (port 8383). */

export type HoteConnexionWebSocket = {
  searchWindow: HTMLDivElement;
  wsServerIp: string;
  wsServerPort: number;
  reconnectDelayMs: number;
  doitReconnecter: () => boolean;
  lireSocket: () => WebSocket | null;
  ecrireSocket: (socket: WebSocket | null) => void;
  afficherStatut: (text: string) => void;
  traiterMessageServeur: (rawData: unknown) => Promise<void>;
  onApresConnexionServeur?: () => void;
};

/**
 * URL du WebSocket du serveur Raspberry.
 *
 * Par défaut : `ws(s)://<hôte de la page>:8383`. Si `RASPBERRY_WS_URL` est défini au build
 * (.env), il est utilisé à la place ; une valeur relative (ex. `/ws`) se résout sur l'origine de
 * la page, en `wss` quand la page est en HTTPS. Utile quand le serveur qui sert la page porte
 * aussi le WebSocket (une page HTTPS ne peut pas ouvrir `ws://` ni un `wss://` sur un port en clair).
 */
const RASPBERRY_WS_URL = process.env.RASPBERRY_WS_URL || "";

export function construireUrlWebSocketServeur(wsServerIp: string, wsServerPort: number): string {
  if (RASPBERRY_WS_URL) {
    const url = new URL(RASPBERRY_WS_URL, window.location.href);
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    return url.toString();
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${wsServerIp}:${wsServerPort}`;
}

export function envoyerMessageWebSocket(
  hote: Pick<HoteConnexionWebSocket, "lireSocket">,
  message: Record<string, unknown> & { type: string }
): boolean {
  const socket = hote.lireSocket();
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

export function demarrerConnexionWebSocket(hote: HoteConnexionWebSocket): void {
  const socketActuel = hote.lireSocket();
  if (socketActuel && (socketActuel.readyState === WebSocket.OPEN || socketActuel.readyState === WebSocket.CONNECTING)) {
    return;
  }

  hote.afficherStatut("Connexion au serveur Raspberry...");
  const socket = new WebSocket(construireUrlWebSocketServeur(hote.wsServerIp, hote.wsServerPort));
  hote.ecrireSocket(socket);

  socket.addEventListener("open", () => {
    hote.afficherStatut("Connecte.");
    envoyerMessageWebSocket(hote, { type: "startControleur" });
    envoyerMessageWebSocket(hote, { type: "getRaspConfig" });
    envoyerMessageWebSocket(hote, { type: "requestRaspList" });
    envoyerMessageWebSocket(hote, { type: "getRaspNetworkStatus" });
    envoyerMessageWebSocket(hote, { type: "getRaspberryParcState" });
    hote.onApresConnexionServeur?.();
  });

  socket.addEventListener("message", async (event) => {
    await hote.traiterMessageServeur(event.data);
  });

  socket.addEventListener("close", () => {
    hote.ecrireSocket(null);
    hote.afficherStatut("Connexion fermee.");
    if (hote.doitReconnecter()) {
      hote.afficherStatut("Reconnexion...");
      window.setTimeout(() => {
        if (hote.doitReconnecter()) {
          demarrerConnexionWebSocket(hote);
        }
      }, hote.reconnectDelayMs);
    }
  });

  socket.addEventListener("error", () => {
    hote.afficherStatut("Erreur de connexion WS.");
  });
}

export function arreterConnexionWebSocket(hote: Pick<HoteConnexionWebSocket, "lireSocket" | "ecrireSocket">): void {
  const socket = hote.lireSocket();
  if (socket) {
    socket.close();
    hote.ecrireSocket(null);
  }
}
