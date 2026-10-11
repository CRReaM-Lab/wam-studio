/**
 * L'interface d'origine d'un instrument des modules (le GUI de son plugin WAM : JUNO6v2, Pro54),
 * dans une fenêtre à part, pour le régler comme dans WAM : chaque geste part au module
 * (`/synth tous <paramètre> <valeur>`). Le plugin n'est pas branché à la sortie de WAM : on
 * n'entend que le module. À l'ouverture, il prend les valeurs que le module a (réglages du
 * projet, sinon ceux de la fiche).
 */
import type { InterfaceWamOuverte, IWamPistesPont } from "../Interfaces/IWamPistesPont";

const ID = "raspberry-interface-instrument";

const STYLE = `
#${ID} { position: fixed; z-index: 50; top: 80px; left: 120px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
  display: flex; flex-direction: column; background: #16191d; color: #e6e8eb; border: 1px solid #333a43; border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.5); font: 13px "IBM Plex Sans", system-ui, sans-serif; overflow: hidden; }
#${ID} .tete { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 14px; cursor: move; user-select: none;
  border-bottom: 1px solid #262a31; }
#${ID} .titre { font-weight: 600; }
#${ID} .etat { color: #9fb3cf; font-size: 12px; }
#${ID} .fermer { margin-left: auto; width: 36px; height: 36px; border: 0; border-radius: 8px; background: transparent;
  color: #cfd3d8; cursor: pointer; font-size: 16px; }
#${ID} .fermer:hover { background: #22262c; }
#${ID} .corps { overflow: auto; min-height: 0; }
#${ID} .vide { padding: 24px; color: #8a929d; }
`;

let ouverte: { fermer: () => void } | null = null;

/** Ferme l'interface ouverte, s'il y en a une. */
export function fermerInterfaceInstrument(): void {
  ouverte?.fermer();
}

export async function ouvrirInterfaceInstrument(params: {
  pont: IWamPistesPont;
  url: string;
  synthe: string;
  numero: number;
  /** Les valeurs du module à donner à l'interface en ouvrant (nom → valeur). */
  valeurs: Record<string, number>;
  /** Les paramètres que l'objet du module connaît : les autres gestes restent dans l'interface. */
  noms: Set<string>;
  /** Un réglage fait dans l'interface. */
  surReglage: (nom: string, valeur: number) => void;
}): Promise<void> {
  fermerInterfaceInstrument();
  if (!document.getElementById(`${ID}-style`)) {
    const style = document.createElement("style");
    style.id = `${ID}-style`;
    style.textContent = STYLE;
    document.head.append(style);
  }
  const fenetre = document.createElement("section");
  fenetre.id = ID;
  fenetre.setAttribute("aria-label", `Interface de ${params.synthe}`);
  const tete = document.createElement("div");
  tete.className = "tete";
  const titre = document.createElement("span");
  titre.className = "titre";
  titre.textContent = `${params.synthe} · rasp ${params.numero}`;
  const etat = document.createElement("span");
  etat.className = "etat";
  etat.textContent = "Ouverture de l'interface…";
  const fermer = document.createElement("button");
  fermer.className = "fermer";
  fermer.type = "button";
  fermer.textContent = "✕";
  fermer.setAttribute("aria-label", "Fermer");
  tete.append(titre, etat, fermer);
  const corps = document.createElement("div");
  corps.className = "corps";
  fenetre.append(tete, corps);
  document.body.append(fenetre);

  // Déplacer la fenêtre par sa tête.
  tete.onpointerdown = (e) => {
    if ((e.target as Element).closest("button")) return;
    const depart = { x: e.clientX, y: e.clientY, gauche: fenetre.offsetLeft, haut: fenetre.offsetTop };
    tete.setPointerCapture(e.pointerId);
    tete.onpointermove = (m) => {
      fenetre.style.left = `${Math.max(0, depart.gauche + m.clientX - depart.x)}px`;
      fenetre.style.top = `${Math.max(0, depart.haut + m.clientY - depart.y)}px`;
    };
    tete.onpointerup = () => (tete.onpointermove = null);
  };

  let interfaceWam: InterfaceWamOuverte | null = null;
  let fermee = false;
  const toutFermer = () => {
    fermee = true;
    interfaceWam?.fermer();
    fenetre.remove();
    if (ouverte === poignee) ouverte = null;
  };
  const poignee = { fermer: toutFermer };
  ouverte = poignee;
  fermer.onclick = toutFermer;

  // Un envoi par paramètre au plus toutes les 60 ms, le dernier geste gagne.
  const enAttente = new Map<string, number>();
  let minuterie: number | undefined;
  const relayer = (nom: string, valeur: number) => {
    if (!params.noms.has(nom)) return;
    enAttente.set(nom, valeur);
    if (minuterie !== undefined) return;
    minuterie = window.setTimeout(() => {
      minuterie = undefined;
      for (const [n, v] of enAttente) params.surReglage(n, v);
      enAttente.clear();
    }, 60);
  };

  interfaceWam = await params.pont.ouvrirInterfaceWam(params.url, relayer);
  if (fermee) {
    interfaceWam?.fermer();
    return;
  }
  if (!interfaceWam) {
    etat.textContent = "";
    const vide = document.createElement("div");
    vide.className = "vide";
    vide.textContent = `L'interface de ${params.synthe} ne s'ouvre pas (${params.url}).`;
    corps.append(vide);
    return;
  }
  for (const [nom, valeur] of Object.entries(params.valeurs)) {
    if (interfaceWam.parametres.includes(nom)) interfaceWam.regler(nom, valeur);
  }
  corps.append(interfaceWam.gui);
  etat.textContent = "les réglages partent au module";
}
