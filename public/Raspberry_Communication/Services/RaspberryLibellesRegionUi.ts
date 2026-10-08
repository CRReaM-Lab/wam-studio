import type { IWamPistesPont } from "../Interfaces/IWamPistesPont";
import { couleurSection, etatEnvoi, type EtatEnvoi } from "./RaspberryEtatEnvoiRegions";
import { raspberryTrackBindingStore } from "./RaspberryTrackBindingStore";

const ID_CONTENEUR = "raspberry-region-labels";
const ATTR_LIBELLE = "data-raspberry-region-label";

let pontCourant: IWamPistesPont | null = null;
let timerRafraichissement: number | null = null;

function lireConteneur(): HTMLDivElement {
  let conteneur = document.getElementById(ID_CONTENEUR) as HTMLDivElement | null;
  if (conteneur) {
    return conteneur;
  }

  const parent = document.getElementById("editor-canvas");
  conteneur = document.createElement("div");
  conteneur.id = ID_CONTENEUR;
  conteneur.style.position = "absolute";
  conteneur.style.left = "0";
  conteneur.style.top = "0";
  conteneur.style.width = "100%";
  conteneur.style.height = "100%";
  conteneur.style.pointerEvents = "none";
  conteneur.style.overflow = "hidden";
  conteneur.style.zIndex = "5";

  if (parent) {
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    parent.appendChild(conteneur);
  } else {
    document.body.appendChild(conteneur);
  }

  return conteneur;
}

function cleLibelle(trackId: number, regionId: number): string {
  return `${trackId}-${regionId}`;
}

function creerLibelle(texte: string): HTMLDivElement {
  const libelle = document.createElement("div");
  libelle.setAttribute(ATTR_LIBELLE, "1");
  libelle.textContent = texte;
  libelle.style.position = "absolute";
  libelle.style.top = "4px";
  libelle.style.left = "4px";
  libelle.style.padding = "1px 6px";
  libelle.style.fontSize = "11px";
  libelle.style.fontWeight = "600";
  libelle.style.color = "#ffffff";
  libelle.style.background = "rgba(0, 0, 0, 0.55)";
  libelle.style.borderRadius = "3px";
  libelle.style.whiteSpace = "nowrap";
  libelle.style.maxWidth = "220px";
  libelle.style.overflow = "hidden";
  libelle.style.textOverflow = "ellipsis";
  return libelle;
}

/** La marque et le style d'une étiquette selon l'état d'envoi (la forme dit l'état). */
const MARQUES: Record<EtatEnvoi, { marque: string; fond: string; texte: string }> = {
  "sur-pi": { marque: "✓", fond: "rgba(0, 0, 0, 0.55)", texte: "#ffffff" },
  "a-envoyer": { marque: "à envoyer", fond: "rgba(0, 0, 0, 0.55)", texte: "#cfd3d8" },
  modifiee: { marque: "! modifiée", fond: "#f0b35e", texte: "#2a1a05" },
  absente: { marque: "✗ absente", fond: "#ef6b5d", texte: "#2a0905" },
  importee: { marque: "↓", fond: "rgba(0, 0, 0, 0.55)", texte: "#c3b6f5" },
  inconnu: { marque: "?", fond: "rgba(0, 0, 0, 0.55)", texte: "#9aa3ad" },
};

/** Le cadre posé sur la région : pointillé (à envoyer), hachures rouges (absente), rien sinon. */
function styleCadre(etat: EtatEnvoi): string {
  if (etat === "a-envoyer") return "2px dashed rgba(207, 211, 216, 0.75)";
  if (etat === "absente") return "1px solid #ef6b5d";
  return "";
}

export function rafraichirLibellesRegionUi(pont: IWamPistesPont): void {
  pontCourant = pont;
  const conteneur = lireConteneur();
  const positions = pont.listerPositionsLibellesRegions();
  const utilises = new Set<string>();
  const pistesColorees = new Set<number>();

  for (const item of positions) {
    const cle = cleLibelle(item.trackId, item.regionId);
    utilises.add(cle);
    const ip = raspberryTrackBindingStore.trouverParTrackId(item.trackId)?.raspberryIp;

    // La couleur de la piste : celle de la section de son Pi (une fois par piste).
    if (ip && !pistesColorees.has(item.trackId)) {
      pistesColorees.add(item.trackId);
      const couleur = couleurSection(ip);
      if (couleur) pont.colorerPiste(item.trackId, couleur);
    }

    const etat = etatEnvoi(ip, item);
    const m = MARQUES[etat];
    const nom = item.nomAffiche && item.nomAffiche !== "son ?" ? item.nomAffiche : "";
    const texte = etat === "sur-pi" || etat === "importee" || etat === "inconnu" ? `${m.marque} ${nom}`.trim() : `${m.marque}${nom ? " · " + nom : ""}`;

    let libelle = conteneur.querySelector<HTMLDivElement>(`[${ATTR_LIBELLE}="${cle}"]`);
    if (!libelle) {
      libelle = creerLibelle(texte);
      libelle.setAttribute(ATTR_LIBELLE, cle);
      conteneur.appendChild(libelle);
    } else if (libelle.textContent !== texte) {
      libelle.textContent = texte;
    }
    libelle.style.background = m.fond;
    libelle.style.color = m.texte;
    libelle.title = `État d'envoi : ${etat.replace("-", " ")}`;
    libelle.style.display = item.visible ? "block" : "none";
    libelle.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px)`;

    // Le cadre sur toute la région (pointillé ou hachures), sous l'étiquette.
    const cleCadre = `${cle}-cadre`;
    utilises.add(cleCadre);
    let cadre = conteneur.querySelector<HTMLDivElement>(`[${ATTR_LIBELLE}="${cleCadre}"]`);
    const bord = styleCadre(etat);
    if (!bord) {
      cadre?.remove();
      continue;
    }
    if (!cadre) {
      cadre = document.createElement("div");
      cadre.setAttribute(ATTR_LIBELLE, cleCadre);
      cadre.style.position = "absolute";
      cadre.style.left = "0";
      cadre.style.top = "0";
      cadre.style.boxSizing = "border-box";
      cadre.style.borderRadius = "4px";
      cadre.style.pointerEvents = "none";
      conteneur.insertBefore(cadre, conteneur.firstChild);
    }
    cadre.style.border = bord;
    cadre.style.background =
      etat === "absente" ? "repeating-linear-gradient(135deg, rgba(239,107,93,.22) 0 8px, rgba(239,107,93,.06) 8px 16px)" : "transparent";
    cadre.style.width = `${Math.max(4, Math.round(item.largeur))}px`;
    cadre.style.height = `${Math.round(item.hauteur - 1)}px`;
    cadre.style.display = item.visible ? "block" : "none";
    cadre.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px)`;
  }

  conteneur.querySelectorAll<HTMLDivElement>(`[${ATTR_LIBELLE}]`).forEach((element) => {
    const cle = element.getAttribute(ATTR_LIBELLE);
    if (cle && !utilises.has(cle)) {
      element.remove();
    }
  });

  demarrerRafraichissementPeriodique();
}

function demarrerRafraichissementPeriodique(): void {
  if (timerRafraichissement !== null) {
    return;
  }
  timerRafraichissement = window.setInterval(() => {
    if (!pontCourant) {
      return;
    }
    rafraichirLibellesRegionUi(pontCourant);
  }, 400);
}
