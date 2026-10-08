import {
  logTransfertErreur,
  logTransfertInfo,
  logTransfertAvertissement,
} from "../../utils/agent-transfert/AgentTransfertLogger";
import {
  construireCommandeStartTransfer,
  construireEntetesUploadNommage,
  MOT_DE_PASSE_SSH_PI,
  type TransfertFormulaire,
  validerFormulaireTransfert,
} from "../../utils/agent-transfert/AgentTransfertHelpers";
import { creerSocketAgent, type SocketAgent } from "./AgentTransfertConnexion";
import type { Inventaire, ResultatInventaire } from "../../Views/SearchRaspberryFenetreInventaire";
import type { AnalyseSon, ResultatAnalyse } from "../../Views/SearchRaspberryApercuSon";

export type ConfigPersisteeAgent = {
  sshHost?: string;
  sshPort?: number;
  sshLogin?: string;
  privateKeyPath?: string;
};

export type EvenementTransfertUi = {
  transferId: string;
  type: string;
  state?: string;
  phase?: string;
  percent?: number;
  current?: number;
  total?: number;
  speed?: number;
  remainingSeconds?: number;
  message?: string;
};

export type CallbacksTransfertUi = {
  onConnexionChange: (connecte: boolean) => void;
  onEvenement: (event: EvenementTransfertUi) => void;
  onErreur: (message: string) => void;
  onJournal?: (message: string) => void;
};

/** Une ligne du plan d'un lot (`POST <agent>/lot/plan`, Lot.fs du serveur). */
export type LignePlanLot = {
  fichier: string;
  son: number | null;
  pi: number | null;
  ip: string;
  destination: string;
  gravite: "ok" | "attention" | "erreur";
  messages: string[];
};

export type ResultatPlanLot =
  | { ok: true; prets: number; lignes: LignePlanLot[] }
  | { ok: false; error: string };

export default class AgentTransfertClient {
  private socket: SocketAgent | null = null;
  private transferIdCourant: string | null = null;
  private envoiEnCours = false;
  private surEvenementCourant: ((event: EvenementTransfertUi) => void) | null = null;
  private erreurSocketDejaTraitee = false;
  private ecouteursDejaBranches = false;
  private attentes: Array<{
    predicat: (event: EvenementTransfertUi) => boolean;
    resolve: (event: EvenementTransfertUi) => void;
    reject: (erreur: Error) => void;
    timer: number;
  }> = [];

  constructor(
    private readonly agentBaseUrl: string,
    private readonly callbacks: CallbacksTransfertUi
  ) {}

  public lireTransferIdCourant(): string | null {
    return this.transferIdCourant;
  }

  public estEnvoiEnCours(): boolean {
    return this.envoiEnCours;
  }

  public async verifierSante(): Promise<{ ok: boolean; configPersistee?: ConfigPersisteeAgent; error?: string }> {
    try {
      logTransfertInfo("Verification sante agent", this.agentBaseUrl);
      const response = await fetch(`${this.agentBaseUrl}/health`);
      if (!response.ok) {
        const erreur = `Agent indisponible (HTTP ${response.status}).`;
        logTransfertErreur(erreur);
        return { ok: false, error: erreur };
      }
      const payload = (await response.json()) as {
        ok?: boolean;
        configPersistee?: ConfigPersisteeAgent;
      };
      const ok = payload.ok === true;
      logTransfertInfo(ok ? "Agent disponible" : "Agent repond mais ok=false", payload);
      return { ok, configPersistee: payload.configPersistee };
    } catch (error) {
      const erreur = `Agent de transfert introuvable sur ${this.agentBaseUrl} (serveur de modulePre arrêté ?)`;
      logTransfertErreur(erreur, error);
      return { ok: false, error: erreur };
    }
  }

  public async listerFichiersSonSurPi(
    sshHost: string
  ): Promise<
    | { ok: true; fichiers: string[]; remoteDirectory: string }
    | { ok: false; error: string }
  > {
    try {
      const sante = await this.verifierSante();
      if (!sante.ok) {
        return { ok: false, error: sante.error || "Agent de transfert indisponible." };
      }

      const response = await fetch(`${this.agentBaseUrl}/remote/files/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sshHost,
          sshPort: 22,
          sshUsername: "pi",
          sshPassword: MOT_DE_PASSE_SSH_PI,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        fichiers?: string[];
        remoteDirectory?: string;
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !Array.isArray(payload.fichiers)) {
        return {
          ok: false,
          error: payload.error || `Liste fichiers impossible (HTTP ${response.status}).`,
        };
      }

      return {
        ok: true,
        fichiers: payload.fichiers,
        remoteDirectory: payload.remoteDirectory || "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur reseau.";
      return { ok: false, error: message };
    }
  }

  public async supprimerFichiersSonSurPi(
    sshHost: string,
    fichiers: string[]
  ): Promise<
    | { ok: true; supprimes: string[]; ignores: string[] }
    | { ok: false; error: string }
  > {
    try {
      const sante = await this.verifierSante();
      if (!sante.ok) {
        return { ok: false, error: sante.error || "Agent de transfert indisponible." };
      }

      const response = await fetch(`${this.agentBaseUrl}/remote/files/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sshHost,
          sshPort: 22,
          sshUsername: "pi",
          sshPassword: MOT_DE_PASSE_SSH_PI,
          fichiers,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        supprimes?: string[];
        ignores?: string[];
        error?: string;
      };

      if (!response.ok || payload.ok !== true || !Array.isArray(payload.supprimes)) {
        return {
          ok: false,
          error: payload.error || `Suppression impossible (HTTP ${response.status}).`,
        };
      }

      return {
        ok: true,
        supprimes: payload.supprimes,
        ignores: Array.isArray(payload.ignores) ? payload.ignores : [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur reseau.";
      return { ok: false, error: message };
    }
  }

  public async telechargerFichierSonSurPi(
    sshHost: string,
    nomFichier: string
  ): Promise<
    | { ok: true; blob: Blob; nomFichier: string }
    | { ok: false; error: string }
  > {
    try {
      const sante = await this.verifierSante();
      if (!sante.ok) {
        return { ok: false, error: sante.error || "Agent de transfert indisponible." };
      }

      const response = await fetch(`${this.agentBaseUrl}/remote/files/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sshHost,
          sshPort: 22,
          sshUsername: "pi",
          sshPassword: MOT_DE_PASSE_SSH_PI,
          fichier: nomFichier,
        }),
      });

      if (!response.ok) {
        let message = `Telechargement impossible (HTTP ${response.status}).`;
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) {
            message = payload.error;
          }
        } catch {
          // reponse non JSON
        }
        return { ok: false, error: message };
      }

      const nom =
        response.headers.get("X-Fichier-Nom")?.trim() || nomFichier;
      const octets = await response.arrayBuffer();
      if (octets.byteLength === 0) {
        return { ok: false, error: "Fichier vide ou telechargement echoue." };
      }
      const typeMime = typeMimeDepuisNomFichier(nom);
      const blob = new Blob([octets], { type: typeMime });
      return { ok: true, blob, nomFichier: nom };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur reseau.";
      return { ok: false, error: message };
    }
  }

  /** L'analyse d'un son du Pi (spectre, coupure du module, découpages), gardée par le serveur. */
  public async analyserSon(sshHost: string, fichier: string): Promise<ResultatAnalyse> {
    try {
      const response = await fetch(`${this.agentBaseUrl}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sshHost, fichier }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        return { ok: false, error: payload.error || `HTTP ${response.status}` };
      }
      return { ok: true, analyse: payload as AnalyseSon };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Erreur reseau." };
    }
  }

  /** L'inventaire des sons des Pi, tel que le serveur l'a lu. */
  public async lireInventaire(): Promise<ResultatInventaire> {
    try {
      const response = await fetch(`${this.agentBaseUrl}/inventaire`);
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
      return { ok: true, inventaire: (await response.json()) as Inventaire };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Erreur reseau." };
    }
  }

  /** Fait relire l'inventaire d'un Pi (ou de tous) par le serveur, puis le rend. */
  public async relireInventaire(sshHost?: string): Promise<ResultatInventaire> {
    try {
      const response = await fetch(`${this.agentBaseUrl}/inventaire/rafraichir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sshHost ? { sshHost } : {}),
      });
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
      return { ok: true, inventaire: (await response.json()) as Inventaire };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Erreur reseau." };
    }
  }

  public async connecter(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }
    if (this.socket) {
      await this.attendreSocketConnecte(this.socket);
      return;
    }
    const socket = creerSocketAgent(this.agentBaseUrl);
    this.socket = socket;
    this.brancherEcouteursSocket(socket);
    await this.attendreSocketConnecte(socket);
  }

  private brancherEcouteursSocket(socket: SocketAgent): void {
    if (this.ecouteursDejaBranches) {
      return;
    }
    this.ecouteursDejaBranches = true;
    socket.on("connect", () => {
      this.callbacks.onConnexionChange(true);
      this.journal(`WebSocket agent connecte (${socket.id || "?"})`);
      this.sAbonner();
    });
    socket.on("disconnect", () => {
      this.callbacks.onConnexionChange(false);
      this.journal("WebSocket agent deconnecte — reconnexion automatique...");
    });
    socket.on("transfer:event", (raw) => this.relayEvenement(raw));
    socket.on("transfer:snapshot", (raw) => this.relaySnapshot(raw));
    socket.on("agent:event", (raw) => {
      const event = raw as { type?: string; message?: string };
      if (event.type === "log" && event.message) this.journal(event.message);
      if (event.type === "error" && event.message) this.callbacks.onErreur(event.message);
    });
    socket.on("command:ack", (raw) => {
      const ack = raw as { ok?: boolean; error?: string };
      logTransfertInfo("ACK commande agent", ack);
      if (!ack.ok && ack.error) this.callbacks.onErreur(ack.error);
    });
  }

  private attendreSocketConnecte(socket: SocketAgent, timeoutMs = 15000): Promise<void> {
    if (socket.connected) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        socket.off("connect", onConnect);
        reject(new Error("Connexion WebSocket a l'agent trop longue."));
      }, timeoutMs);
      const onConnect = () => {
        window.clearTimeout(timer);
        socket.off("connect", onConnect);
        resolve();
      };
      socket.on("connect", onConnect);
    });
  }

  public deconnecter(): void {
    this.viderAttentes();
    this.socket?.disconnect();
    this.socket = null;
    this.ecouteursDejaBranches = false;
    this.callbacks.onConnexionChange(false);
  }

  public async envoyerFichierComplet(
    fichier: File,
    formulaire: TransfertFormulaire
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const validation = validerFormulaireTransfert(formulaire, fichier);
    if (!validation.ok) {
      this.callbacks.onErreur(validation.error);
      return { ok: false, error: validation.error };
    }
    return this.executerEnvoi(
      fichier,
      (transferId) => construireEntetesUploadNommage(formulaire, transferId),
      (transferId) => construireCommandeStartTransfer(formulaire, transferId)
    );
  }

  /** Le plan d'un lot `son<son>-<Pi>.wav` : où irait chaque fichier, sans rien envoyer. */
  public async planifierLot(noms: string[]): Promise<ResultatPlanLot> {
    try {
      const response = await fetch(`${this.agentBaseUrl}/lot/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fichiers: noms }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) {
        return { ok: false, error: payload.error || `HTTP ${response.status}` };
      }
      return { ok: true, prets: payload.prets, lignes: payload.lignes as LignePlanLot[] };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Erreur reseau." };
    }
  }

  /**
   * Un fichier de lot : le serveur relit son nom (`son12-98.wav`) et choisit lui-même le Pi et
   * le nom sur le Pi. `surEvenement` reçoit les évènements de ce transfert (avertissements…).
   */
  public envoyerFichierLot(
    fichier: File,
    surEvenement?: (event: EvenementTransfertUi) => void
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.executerEnvoi(
      fichier,
      (transferId) => ({ "X-Transfer-Id": transferId }),
      (transferId) => ({ type: "startTransfer", transferId, lot: true }),
      surEvenement
    );
  }

  private async executerEnvoi(
    fichier: File,
    entetes: (transferId: string) => Record<string, string>,
    commandeDe: (transferId: string) => Record<string, unknown>,
    surEvenement?: (event: EvenementTransfertUi) => void
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    await this.connecter();
    if (!this.socket) {
      const erreur = "Connexion WebSocket à l'agent impossible.";
      this.callbacks.onErreur(erreur);
      return { ok: false, error: erreur };
    }

    if (this.envoiEnCours) {
      const erreur = "Un transfert est deja en cours.";
      logTransfertAvertissement("Transfert deja en cours, ignore.");
      return { ok: false, error: erreur };
    }

    this.envoiEnCours = true;
    this.surEvenementCourant = surEvenement ?? null;
    this.erreurSocketDejaTraitee = false;
    this.transferIdCourant = crypto.randomUUID();
    const transferId = this.transferIdCourant;
    this.journal("Demarrage du flux complet (upload + SCP).");
    this.sAbonner();

    try {
      this.presenterEvenement({ transferId, type: "state", state: "RECEIVING" });
      this.journal("Upload HTTP en cours...");
      await this.uploadFichier(fichier, entetes(transferId));
      this.presenterEvenement({
        transferId,
        type: "state",
        state: "READY",
      });

      const commande = commandeDe(transferId);
      logTransfertInfo("Envoi startTransfer", commande);
      const finPromise = this.attendreEvenement(
        (event) =>
          (event.type === "state" &&
            (event.state === "COMPLETED" || event.state === "FAILED" || event.state === "CANCELLED")) ||
          event.type === "completed" ||
          event.type === "error",
        600000
      );
      this.socket.emit("command", commande);
      this.journal("Commande startTransfer envoyee — connexion SSH au Raspberry...");
      this.presenterEvenement({ transferId, type: "state", state: "SENDING" });

      const fin = await finPromise;

      if (fin.type === "completed" || fin.state === "COMPLETED") {
        this.journal("Transfert SCP termine avec succes.");
        return { ok: true };
      }
      if (fin.type === "error") {
        throw new Error(fin.message || "Erreur SCP.");
      }
      if (fin.state === "CANCELLED") {
        throw new Error("Transfert annule.");
      }
      throw new Error("Transfert echoue.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue.";
      logTransfertErreur("Echec flux transfert", error);
      if (!this.erreurSocketDejaTraitee) {
        this.callbacks.onEvenement({
          transferId: this.transferIdCourant || "",
          type: "error",
          state: "FAILED",
          message,
        });
        this.callbacks.onErreur(message);
      }
      this.journal(`Erreur: ${message}`);
      return { ok: false, error: message };
    } finally {
      this.envoiEnCours = false;
      this.surEvenementCourant = null;
      this.transferIdCourant = null;
      logTransfertInfo("Flux transfert libere (pret pour un nouvel envoi)");
    }
  }

  public annulerTransfertCourant(): void {
    if (!this.transferIdCourant || !this.socket) return;
    this.socket.emit("command", { type: "cancelTransfer", transferId: this.transferIdCourant });
    this.journal("Annulation demandee.");
  }

  private journal(message: string): void {
    logTransfertInfo(message);
    this.callbacks.onJournal?.(message);
  }

  private sAbonner(): void {
    if (!this.socket || !this.transferIdCourant) return;
    this.socket.emit("subscribe", { transferId: this.transferIdCourant });
  }

  private async uploadFichier(fichier: File, entetes: Record<string, string>): Promise<void> {
    const form = new FormData();
    form.append("file", fichier);
    logTransfertInfo("Upload HTTP", { entetes, fichier: fichier.name });
    const response = await fetch(`${this.agentBaseUrl}/upload`, {
      method: "POST",
      headers: entetes,
      body: form,
    });
    let payload: {
      error?: string;
      filename?: string;
      storedFilename?: string;
      size?: number;
    } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      logTransfertErreur("Reponse upload non JSON", { status: response.status, error });
      throw new Error(`Upload HTTP: reponse invalide (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      logTransfertErreur("Upload HTTP refuse", payload);
      throw new Error(payload.error || `Upload HTTP echoue (HTTP ${response.status}).`);
    }
    const nomStocke = payload.storedFilename || payload.filename || fichier.name;
    this.journal(`Upload recu: ${nomStocke} (${payload.size ?? fichier.size} octets).`);
  }

  private relayEvenement(raw: unknown): void {
    const event = raw as EvenementTransfertUi;
    if (this.transferIdCourant && event.transferId !== this.transferIdCourant) return;
    if (event.type === "error") {
      this.erreurSocketDejaTraitee = true;
    }
    if (event.type !== "progress") {
      logTransfertInfo("Evenement agent", event);
    }
    this.presenterEvenement(event);
  }

  private relaySnapshot(raw: unknown): void {
    const snapshot = raw as {
      transferId?: string;
      state?: string;
      derniereProgression?: {
        phase?: string;
        current?: number;
        total?: number;
        percent?: number;
      };
    };
    if (this.transferIdCourant && snapshot.transferId !== this.transferIdCourant) return;
    if (snapshot.state) {
      this.presenterEvenement({
        transferId: snapshot.transferId || this.transferIdCourant || "",
        type: "state",
        state: snapshot.state,
      });
    }
    if (snapshot.derniereProgression) {
      this.presenterEvenement({
        transferId: snapshot.transferId || this.transferIdCourant || "",
        type: "progress",
        phase: snapshot.derniereProgression.phase,
        current: snapshot.derniereProgression.current,
        total: snapshot.derniereProgression.total,
        percent: snapshot.derniereProgression.percent,
      });
    }
  }

  private presenterEvenement(event: EvenementTransfertUi): void {
    this.callbacks.onEvenement(event);
    this.surEvenementCourant?.(event);
    const restantes: typeof this.attentes = [];
    for (const attente of this.attentes) {
      if (this.transferIdCourant && event.transferId && event.transferId !== this.transferIdCourant) {
        restantes.push(attente);
        continue;
      }
      if (!attente.predicat(event)) {
        restantes.push(attente);
        continue;
      }
      window.clearTimeout(attente.timer);
      attente.resolve(event);
    }
    this.attentes = restantes;
  }

  private viderAttentes(erreur?: Error): void {
    const enCours = this.attentes.splice(0);
    for (const attente of enCours) {
      window.clearTimeout(attente.timer);
      attente.reject(erreur ?? new Error("Transfert interrompu."));
    }
  }

  private attendreEvenement(
    predicat: (event: EvenementTransfertUi) => boolean,
    timeoutMs: number
  ): Promise<EvenementTransfertUi> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.attentes = this.attentes.filter((item) => item.timer !== timer);
        const message = "Delai depasse en attente du transfert.";
        logTransfertErreur(message);
        reject(new Error(message));
      }, timeoutMs);
      this.attentes.push({ predicat, resolve, reject, timer });
    });
  }
}

function typeMimeDepuisNomFichier(nomFichier: string): string {
  const extension = nomFichier.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "flac") return "audio/flac";
  if (extension === "aiff" || extension === "aif") return "audio/aiff";
  return "audio/wav";
}
