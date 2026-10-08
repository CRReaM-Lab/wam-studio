import type App from "../App";
import { basculerToucheVirtuelle, estToucheVirtuelle } from "../Utils/keys";

/**
 * La palette d'outils de l'arrangeur, à gauche des pistes (notes/wam-arrangeur.md de
 * CRReaM-dev-root, maquette « Arrangeur WAM : propositions », planche 1).
 *
 * - Les gestes de base de REAPER, au doigt comme à la souris : scinder (S), repère (M),
 *   dupliquer (⌘D), copier et coller (⌘C, ⌘V), supprimer (⌫), boucle (R).
 * - Les modes tactiles : un écran tactile n'a ni ⇧ ni ⌘. « Libre » tient un ⇧ virtuel (placer
 *   librement malgré la grille) et « Sélection multiple » un ⌘ virtuel (ajouter à la
 *   sélection) ; le reste de WAM les voit comme de vraies touches.
 * - « ? » affiche le nom et le raccourci de chaque outil à côté de son icône (au doigt, pas de
 *   survol) ; le choix est gardé dans le navigateur.
 */

type Outil = {
  nom: string;
  raccourci: string;
  icone: string;
  action?: () => void;
  /** Un mode qui reste enfoncé : la touche virtuelle qu'il tient. */
  touche?: string;
};

const CLE_AIDE = "wam-palette-aide";

const svg = (chemins: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${chemins}</svg>`;

const ICONES = {
  scinder: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>'),
  repere: svg('<path d="M6 21V4"/><path d="M6 4h11l-3 4 3 4H6"/>'),
  dupliquer: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>'),
  copier: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4V5a1 1 0 0 1 1-1h10v1"/>'),
  coller: svg('<path d="M9 4h6v3H9z"/><path d="M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>'),
  supprimer: svg('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  boucle: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
  libre: svg('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
  multiple: svg('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M13 7h4a2 2 0 0 1 2 2v2M11 17H7a2 2 0 0 1-2-2v-2"/>'),
  aide: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>'),
};

const STYLE = `
#palette-outils { flex: 0 0 auto; display: flex; flex-direction: column; gap: 4px; padding: 8px 6px;
  background: #16191d; border-right: 1px solid #262a31; overflow-y: auto; z-index: 2;
  font-family: "IBM Plex Sans", system-ui, sans-serif; color: #cfd3d8; user-select: none; }
#palette-outils .outil { display: flex; align-items: center; gap: 10px; min-width: 48px; min-height: 48px;
  padding: 0 13px; box-sizing: border-box; border: 1px solid transparent; border-radius: 9px;
  background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer;
  touch-action: manipulation; text-align: left; }
#palette-outils .outil:hover { background: #20242a; }
#palette-outils .outil:active { background: #2a2f36; }
#palette-outils .outil[aria-pressed="true"] { background: #2a2418; color: #f0b35e; border-color: #5a4523; }
#palette-outils .texte { display: none; flex-direction: column; line-height: 1.2; white-space: nowrap; }
#palette-outils.aide .texte { display: flex; }
#palette-outils .raccourci { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 11px; color: #8a929d; }
#palette-outils .separateur { height: 1px; background: #2a2e35; margin: 4px 6px; }
#palette-outils .bas { margin-top: auto; }
`;

export default class PaletteOutilsView {
  private readonly racine: HTMLElement;

  constructor(private readonly app: App) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.racine = document.createElement("nav");
    this.racine.id = "palette-outils";
    this.racine.setAttribute("aria-label", "Outils de l'arrangeur");
    let aide = false;
    try {
      aide = localStorage.getItem(CLE_AIDE) === "1";
    } catch {
      /* stockage indisponible : aide masquée */
    }
    this.racine.classList.toggle("aide", aide);

    const r = () => this.app.regionsController;
    const groupes: Outil[][] = [
      [
        { nom: "Scinder au curseur", raccourci: "S", icone: ICONES.scinder, action: () => r().splitSelectedRegion() },
        { nom: "Repère au curseur", raccourci: "M", icone: ICONES.repere, action: () => r().poserRepere() },
        { nom: "Dupliquer", raccourci: "⌘D", icone: ICONES.dupliquer, action: () => r().duplicateSelectedRegion() },
        { nom: "Copier", raccourci: "⌘C", icone: ICONES.copier, action: () => r().copySelectedRegion() },
        { nom: "Coller au curseur", raccourci: "⌘V", icone: ICONES.coller, action: () => r().pasteRegion(true) },
        { nom: "Supprimer", raccourci: "⌫", icone: ICONES.supprimer, action: () => r().deleteSelectedRegion(true) },
      ],
      [{ nom: "Boucle", raccourci: "R", icone: ICONES.boucle, action: () => this.app.hostController.loop() }],
      [
        { nom: "Libre (sans grille)", raccourci: "⇧ tenu", icone: ICONES.libre, touche: "Shift" },
        { nom: "Sélection multiple", raccourci: "⌘ tenu", icone: ICONES.multiple, touche: "Meta" },
      ],
    ];
    groupes.forEach((groupe, i) => {
      if (i > 0) this.racine.appendChild(this.separateur());
      for (const outil of groupe) this.racine.appendChild(this.bouton(outil));
    });

    const boutonAide = this.bouton({ nom: "Afficher les noms et raccourcis", raccourci: "", icone: ICONES.aide });
    boutonAide.classList.add("bas");
    boutonAide.setAttribute("aria-pressed", String(aide));
    boutonAide.addEventListener("click", () => {
      const actif = !this.racine.classList.contains("aide");
      this.racine.classList.toggle("aide", actif);
      boutonAide.setAttribute("aria-pressed", String(actif));
      try {
        localStorage.setItem(CLE_AIDE, actif ? "1" : "0");
      } catch {
        /* stockage indisponible : le choix vaut pour cette session */
      }
      window.dispatchEvent(new Event("resize"));
    });
    this.racine.appendChild(boutonAide);

    const editeur = document.getElementById("track-editor");
    editeur?.insertBefore(this.racine, editeur.firstChild);
    // L'arrangeur a mesuré sa largeur avant la palette : il se recalcule.
    window.dispatchEvent(new Event("resize"));
  }

  private separateur(): HTMLElement {
    const s = document.createElement("div");
    s.className = "separateur";
    return s;
  }

  private bouton(outil: Outil): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "outil";
    b.title = outil.raccourci ? `${outil.nom} (${outil.raccourci})` : outil.nom;
    b.setAttribute("aria-label", outil.nom);
    b.innerHTML = `${outil.icone}<span class="texte"><span>${outil.nom}</span><span class="raccourci">${outil.raccourci}</span></span>`;
    // Ne pas prendre le focus : les raccourcis clavier ne marchent que le focus sur la page.
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    if (outil.touche) {
      const touche = outil.touche;
      b.setAttribute("aria-pressed", String(estToucheVirtuelle(touche)));
      b.addEventListener("click", () => {
        const tenue = !estToucheVirtuelle(touche);
        basculerToucheVirtuelle(touche, tenue);
        b.setAttribute("aria-pressed", String(tenue));
      });
    } else if (outil.action) {
      const action = outil.action;
      b.addEventListener("click", () => action());
    }
    return b;
  }
}
