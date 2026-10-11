/**
 * Les effets d'une piste sur son module, réglés là où on les choisit : une barre en tête de la
 * fenêtre des effets (« PedalBoard »), pour la piste qu'elle montre. Si cette piste est liée à un
 * module : « Jouer ces effets sur rasp N » (le suivi en direct, `fxDirect` de la liaison, que
 * RaspberrySynchroEffets envoie en `/fx`), et ce qui part ou pas : les pédales sans équivalent
 * sur le module sont nommées (leur emplacement reste vide).
 */
import type { IWamPistesPont } from "../Interfaces/IWamPistesPont";
import { raspberryTrackBindingStore } from "./RaspberryTrackBindingStore";

const ID_BARRE = "raspberry-effets-module";

/** Par piste suivie : ses pédales sans équivalent sur le module (RaspberrySynchroEffets, à chaque tour). */
const sansEquivalent = new Map<number, string[]>();

export function noterEffetsSansEquivalent(trackId: number, noms: string[]): void {
  if (noms.length) sansEquivalent.set(trackId, noms);
  else sansEquivalent.delete(trackId);
}

/** Ce que dit la barre pour une piste : pure, pour les tests. */
export function texteBarre(etat: { liee: boolean; raspberryId?: number; actif: boolean; sansEquivalent: string[] }): {
  visible: boolean;
  libelle: string;
  detail: string;
  alerte: boolean;
} {
  if (!etat.liee) return { visible: false, libelle: "", detail: "", alerte: false };
  const libelle = `Jouer ces effets sur rasp ${etat.raspberryId}`;
  if (!etat.actif) return { visible: true, libelle, detail: "Coupé : le module joue sans ces effets.", alerte: false };
  if (etat.sansEquivalent.length)
    return {
      visible: true,
      libelle,
      detail: `Sans équivalent sur le module, emplacement laissé vide : ${etat.sansEquivalent.join(", ")}. Les pédales des modules sont dans la bibliothèque « CRReaM — pédales des modules ».`,
      alerte: true,
    };
  return { visible: true, libelle, detail: "Suivi en direct : chaque réglage part au module.", alerte: false };
}

function barre(): HTMLElement | null {
  const tete = document.getElementById("plugin-header");
  if (!tete) return null;
  let b = document.getElementById(ID_BARRE);
  if (!b) {
    b = document.createElement("div");
    b.id = ID_BARRE;
    Object.assign(b.style, {
      display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "4px 10px",
      font: "13px system-ui, sans-serif", color: "#e6e8eb", background: "#1a1e24", borderBottom: "1px solid #333a43",
    });
    const etiquette = document.createElement("label");
    Object.assign(etiquette.style, { display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", minHeight: "32px" });
    const coche = document.createElement("input");
    coche.type = "checkbox";
    Object.assign(coche.style, { width: "18px", height: "18px", cursor: "pointer" });
    const libelle = document.createElement("span");
    etiquette.append(coche, libelle);
    const detail = document.createElement("span");
    detail.style.fontSize = "12px";
    b.append(etiquette, detail);
    // Juste sous la barre de titre de la fenêtre.
    tete.insertAdjacentElement("afterend", b);
  }
  return b;
}

/** Tient la barre à jour (4 fois par seconde), et bascule le suivi quand on la coche. */
export function demarrerBarreEffets(pont: IWamPistesPont): void {
  let trackIdAffiche: number | null = null;
  const rendre = () => {
    const fenetre = document.getElementById("plugin-window");
    const b = barre();
    if (!fenetre || !b || fenetre.hidden) return;
    const trackId = pont.lirePisteChoisie();
    const binding = trackId === null ? undefined : raspberryTrackBindingStore.trouverParTrackId(trackId);
    const t = texteBarre({
      liee: !!binding && binding.liee !== false,
      raspberryId: binding?.raspberryId,
      actif: binding?.fxDirect === true,
      sansEquivalent: (trackId !== null && sansEquivalent.get(trackId)) || [],
    });
    trackIdAffiche = trackId;
    b.style.display = t.visible ? "flex" : "none";
    const coche = b.querySelector("input") as HTMLInputElement;
    const [libelle, detail] = [b.querySelector("label span") as HTMLElement, b.lastElementChild as HTMLElement];
    if (document.activeElement !== coche) coche.checked = binding?.fxDirect === true;
    libelle.textContent = t.libelle;
    detail.textContent = t.detail;
    detail.style.color = t.alerte ? "#f0b45a" : "#9aa1ab";
    if (!coche.onchange) {
      coche.onchange = () => {
        const actuel = trackIdAffiche === null ? undefined : raspberryTrackBindingStore.trouverParTrackId(trackIdAffiche);
        if (!actuel) return;
        actuel.fxDirect = coche.checked;
        raspberryTrackBindingStore.enregistrer(actuel);
        rendre();
      };
    }
  };
  window.setInterval(rendre, 250);
}
