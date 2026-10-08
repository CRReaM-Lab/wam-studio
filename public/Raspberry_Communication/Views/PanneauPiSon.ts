/**
 * Le panneau « Pi son », à droite de l'arrangeur (maquette « Arrangeur WAM : propositions »,
 * planche 4 ; notes/wam-arrangeur.md de CRReaM-dev-root) : les fenêtres Raspberry (envoyer,
 * importer, supprimer, lot, inventaire) y deviennent des onglets, et l'arrangeur reste visible.
 *
 * Les fenêtres ne changent pas : chacune construit son voile (`overlay`) et sa fenêtre, puis
 * appelle `monterFenetre(overlay)` au lieu de `document.body.appendChild(overlay)` ; le voile est
 * logé dans le panneau, sans fond ni position fixe. Les fermer (retirer le voile) vide l'onglet.
 */

export type Onglet = {
  nom: string;
  /** L'`id` du voile de la fenêtre qu'il ouvre (pour le marquer actif) ; absent : lien. */
  idFenetre?: string;
  ouvrir: () => void;
};

const ID_PANNEAU = "panneau-pi-son";
const ID_BOUTON = "bouton-pi-son";
const CLE_OUVERT = "wam-panneau-pi-son";

const STYLE = `
/* L'arrangeur doit pouvoir rétrécir sous la largeur de son canevas pour faire place au panneau. */
#track-editor > #editor { min-width: 0; overflow: hidden; }
#${ID_PANNEAU} { flex: 0 0 440px; flex-shrink: 0; max-width: 46vw; display: none; flex-direction: column;
  background: #16191d; border-left: 1px solid #262a31; color: #e6e8eb; min-height: 0;
  font-family: "IBM Plex Sans", system-ui, sans-serif; z-index: 3; }
#${ID_PANNEAU}.ouvert { display: flex; }
#${ID_PANNEAU} .tete { display: flex; align-items: center; gap: 10px; padding: 10px 12px 6px 16px; }
#${ID_PANNEAU} .titre { font-weight: 600; font-size: 15px; }
#${ID_PANNEAU} .resume { color: #9fb3cf; font-size: 13px; }
#${ID_PANNEAU} .fermer { margin-left: auto; width: 44px; height: 44px; border: 0; border-radius: 8px;
  background: transparent; color: #cfd3d8; cursor: pointer; font-size: 18px; }
#${ID_PANNEAU} .fermer:hover { background: #22262c; }
#${ID_PANNEAU} nav { display: flex; flex-wrap: wrap; gap: 2px; padding: 0 8px; border-bottom: 1px solid #262a31; }
#${ID_PANNEAU} nav button { font: inherit; font-size: 13px; color: #9aa1ab; background: transparent; border: 0;
  border-bottom: 2px solid transparent; padding: 10px 7px; min-height: 44px; cursor: pointer; touch-action: manipulation; }
#${ID_PANNEAU} nav button[aria-selected="true"] { color: #f2f3f5; border-bottom-color: #6fb6ff; }
#${ID_PANNEAU} .corps { flex: 1; min-height: 0; overflow: auto; }
/* Dans le panneau, l'onglet dit déjà quelle fenêtre est ouverte : pas de grand titre. */
#${ID_PANNEAU} .corps h3, #${ID_PANNEAU} .corps .fermer-fenetre { display: none; }
#${ID_PANNEAU} .vide { color: #8a929d; padding: 24px 16px; font-size: 14px; }
#${ID_BOUTON}:not(.outil) { display: flex; align-items: center; gap: 8px; height: 36px; margin: 0 8px; padding: 0 12px;
  border-radius: 8px; border: 1px solid #33496b; background: #1f2a3a; color: #e6e8eb; cursor: pointer;
  font: 14px "IBM Plex Sans", system-ui, sans-serif; white-space: nowrap; touch-action: manipulation; }
#${ID_BOUTON} .point { width: 8px; height: 8px; border-radius: 50%; background: #5fb3ff; }
#${ID_BOUTON} .compte { color: #9fb3cf; }
`;

let onglets: Onglet[] = [];

function panneau(): HTMLElement | null {
  return document.getElementById(ID_PANNEAU);
}

function memoriser(ouvert: boolean): void {
  try {
    localStorage.setItem(CLE_OUVERT, ouvert ? "1" : "0");
  } catch {
    /* stockage indisponible */
  }
}

function marquer(idFenetre: string | null): void {
  panneau()
    ?.querySelectorAll<HTMLButtonElement>("nav button")
    .forEach((b) => b.setAttribute("aria-selected", String(!!idFenetre && b.dataset.fenetre === idFenetre)));
}

function videSiRien(): void {
  const corps = panneau()?.querySelector(".corps");
  if (corps && !corps.firstElementChild) {
    corps.innerHTML = '<div class="vide">Choisir un onglet.</div>';
    marquer(null);
  }
}

/** La zone du bas (piste maître, plugins) repliée par le panneau, à rouvrir à sa fermeture. */
let basReplie = false;

/** La zone du bas est-elle dépliée ? Sa hauteur le dit (l'icône de la flèche ment au démarrage). */
function zoneDuBasOuverte(): boolean {
  return (document.getElementById("plugin-editor")?.getBoundingClientRect().height ?? 0) > 60;
}

/** Replie ou rouvre la zone du bas avec sa propre flèche (`#min-max-btn`). */
function zoneDuBas(ouverte: boolean): void {
  if (zoneDuBasOuverte() !== ouverte) document.getElementById("min-max-btn")?.click();
}

export function ouvrirPanneau(): void {
  const p = panneau();
  if (!p || p.classList.contains("ouvert")) return;
  p.classList.add("ouvert");
  memoriser(true);
  // Le panneau a besoin de hauteur : la zone du bas se replie le temps qu'il est ouvert.
  basReplie = zoneDuBasOuverte();
  if (basReplie) zoneDuBas(false);
  // L'arrangeur a perdu de la largeur : il se recalcule.
  window.dispatchEvent(new Event("resize"));
}

export function fermerPanneau(): void {
  const p = panneau();
  if (!p || !p.classList.contains("ouvert")) return;
  p.classList.remove("ouvert");
  memoriser(false);
  if (basReplie) zoneDuBas(true);
  basReplie = false;
  window.dispatchEvent(new Event("resize"));
}

/**
 * Loge une fenêtre Raspberry (son voile et sa fenêtre) dans le panneau, ouvert au besoin. Sans
 * panneau (pas encore installé), elle s'ouvre par-dessus la page comme avant.
 */
export function monterFenetre(overlay: HTMLElement): void {
  const corps = panneau()?.querySelector<HTMLElement>(".corps");
  if (!corps) {
    document.body.appendChild(overlay);
    return;
  }
  // Le voile devient un simple conteneur ; la fenêtre prend la place du panneau.
  Object.assign(overlay.style, {
    position: "static", inset: "auto", background: "transparent", display: "block",
    zIndex: "auto", height: "100%",
  });
  const fenetre = overlay.firstElementChild as HTMLElement | null;
  if (fenetre) {
    Object.assign(fenetre.style, {
      width: "auto", maxWidth: "none", maxHeight: "none", height: "100%", boxSizing: "border-box",
      border: "0", borderRadius: "0", boxShadow: "none", background: "transparent",
    });
  }
  corps.replaceChildren(overlay);
  marquer(overlay.id);
  ouvrirPanneau();
  // La fenêtre se ferme en retirant son voile : l'onglet redevient vide.
  new MutationObserver((_, obs) => {
    if (!overlay.isConnected) {
      obs.disconnect();
      videSiRien();
    }
  }).observe(corps, { childList: true });
}

/** Installe le panneau à droite de l'arrangeur, et le bouton « Pi son » dans la barre du haut. */
export function installerPanneauPiSon(params: { onglets: Onglet[]; resume: () => string }): void {
  if (panneau()) return;
  onglets = params.onglets;
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);

  const p = document.createElement("aside");
  p.id = ID_PANNEAU;
  p.setAttribute("aria-label", "Pi son");
  p.innerHTML = `<div class="tete"><span class="titre">Pi son</span><span class="resume"></span>
    <button type="button" class="fermer" aria-label="Fermer le panneau">✕</button></div>
    <nav aria-label="Outils Pi son"></nav><div class="corps"></div>`;
  const nav = p.querySelector("nav")!;
  for (const o of onglets) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = o.nom;
    if (o.idFenetre) b.dataset.fenetre = o.idFenetre;
    b.setAttribute("aria-selected", "false");
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => o.ouvrir());
    nav.appendChild(b);
  }
  p.querySelector(".fermer")!.addEventListener("click", fermerPanneau);
  document.getElementById("track-editor")?.appendChild(p);
  videSiRien();

  // Le bouton : dans la palette d'outils de l'arrangeur (au-dessus de « ? ») ; la barre du haut est
  // pleine tant qu'elle n'est pas regroupée. Sans palette : à gauche du zoom.
  const bouton = document.createElement("button");
  bouton.id = ID_BOUTON;
  bouton.type = "button";
  bouton.title = "Pi son : envoyer, importer, lot, inventaire, maintenance";
  bouton.setAttribute("aria-label", "Pi son");
  bouton.addEventListener("pointerdown", (e) => e.preventDefault());
  bouton.addEventListener("click", () => (panneau()?.classList.contains("ouvert") ? fermerPanneau() : ouvrirPanneau()));
  const palette = document.getElementById("palette-outils");
  if (palette) {
    bouton.className = "outil";
    bouton.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><circle cx="12" cy="13" r="1"/><path d="M9 6.5h6"/></svg><span class="texte"><span>Pi son</span><span class="raccourci compte"></span></span>`;
    palette.insertBefore(bouton, palette.querySelector(".bas"));
  } else {
    bouton.innerHTML = '<span class="point"></span>Pi son <span class="compte"></span>';
    // La zone de droite est en `row-reverse` : ajouté en dernier, le bouton s'affiche à gauche du zoom.
    document.getElementById("right-controls")?.appendChild(bouton);
  }
  const marquerBouton = () => bouton.setAttribute("aria-pressed", String(!!panneau()?.classList.contains("ouvert")));
  new MutationObserver(marquerBouton).observe(p, { attributes: true, attributeFilter: ["class"] });
  marquerBouton();

  const rafraichir = () => {
    const texte = params.resume();
    bouton.querySelector(".compte")!.textContent = texte;
    p.querySelector(".resume")!.textContent = texte;
  };
  rafraichir();
  window.setInterval(rafraichir, 2000);

  let ouvert = false;
  try {
    ouvert = localStorage.getItem(CLE_OUVERT) === "1";
  } catch {
    /* stockage indisponible */
  }
  // Rouvert au chargement : attendre que la zone du bas ait sa taille, pour savoir la replier.
  if (ouvert) window.setTimeout(ouvrirPanneau, 800);
}
