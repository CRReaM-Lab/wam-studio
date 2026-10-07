/**
 * Menu du clic droit sur une région de l'arrangeur : envoyer cette région au Pi de sa piste
 * (« rasp N »). Le numéro proposé est le premier libre sur le Pi à partir du départ de la piste ;
 * on peut le changer (un numéro déjà présent sur le Pi est signalé : il sera remplacé).
 */
const ID_MENU = "raspberry-menu-region";

export type MenuRegion =
  | { type: "indisponible"; titre: string; raison: string }
  | {
      type: "envoi";
      titre: string;
      /** Le premier numéro libre et les numéros déjà présents sur le Pi (null : liste illisible). */
      proposer: () => Promise<{ numero: number; pris: Set<number> | null; remarque?: string }>;
      /** Lance l'envoi ; `lireStatut` est relu pendant l'envoi pour l'afficher. */
      envoyer: (numero: number) => Promise<{ ok: boolean; message: string }>;
      lireStatut: () => string | undefined;
    };

/** Les écouteurs du menu ouvert, retirés à sa fermeture (sinon ils agissent sur le suivant). */
let retirerEcouteurs: (() => void) | null = null;

export function fermerMenuRegion(): void {
  retirerEcouteurs?.();
  retirerEcouteurs = null;
  document.getElementById(ID_MENU)?.remove();
}

export function ouvrirMenuRegion(x: number, y: number, menu: MenuRegion): void {
  fermerMenuRegion();
  const boite = document.createElement("div");
  boite.id = ID_MENU;
  Object.assign(boite.style, {
    position: "fixed",
    // Décalé du curseur : aucun bouton ne s'ouvre sous la souris.
    left: `${x + 12}px`,
    top: `${y + 12}px`,
    zIndex: "10000",
    background: "#1f252b",
    color: "#f1f1f1",
    border: "1px solid #3b4046",
    borderRadius: "6px",
    padding: "10px 12px",
    minWidth: "240px",
    maxWidth: "360px",
    fontSize: "13px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  } satisfies Partial<CSSStyleDeclaration>);

  const titre = document.createElement("div");
  titre.style.fontWeight = "bold";
  titre.style.marginBottom = "8px";
  titre.innerText = menu.titre;
  boite.appendChild(titre);

  let envoiEnCours = false;
  const ouvertLe = performance.now();
  const fermer = () => {
    if (envoiEnCours) return;
    fermerMenuRegion();
  };
  const clicAilleurs = (e: Event) => {
    if (!boite.contains(e.target as Node)) fermer();
  };
  const touche = (e: KeyboardEvent) => {
    if (e.key === "Escape") fermer();
  };

  if (menu.type === "indisponible") {
    const raison = document.createElement("div");
    raison.style.opacity = "0.8";
    raison.innerText = menu.raison;
    boite.appendChild(raison);
  } else {
    const ligne = document.createElement("label");
    ligne.style.display = "flex";
    ligne.style.alignItems = "center";
    ligne.style.gap = "6px";
    ligne.innerText = "Son n°";
    const champ = document.createElement("input");
    champ.type = "number";
    champ.min = "500";
    champ.disabled = true;
    champ.style.width = "72px";
    ligne.appendChild(champ);
    boite.appendChild(ligne);

    const note = document.createElement("div");
    note.style.margin = "6px 0 2px";
    note.style.fontSize = "12px";
    note.innerText = "Recherche du premier numéro libre…";
    boite.appendChild(note);

    const statut = document.createElement("div");
    statut.style.marginTop = "8px";
    statut.style.whiteSpace = "pre-wrap";
    boite.appendChild(statut);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "6px";
    actions.style.marginTop = "10px";
    const annuler = document.createElement("button");
    annuler.className = "btn btn-sm btn-secondary";
    annuler.innerText = "Fermer";
    annuler.onclick = fermer;
    const envoyer = document.createElement("button");
    envoyer.className = "btn btn-sm btn-primary";
    envoyer.innerText = "Envoyer";
    envoyer.disabled = true;
    actions.append(annuler, envoyer);
    boite.appendChild(actions);

    let pris: Set<number> | null = null;
    let remarque = "";
    const lireNumero = () => {
      const n = Number.parseInt(champ.value, 10);
      return Number.isFinite(n) && n >= 500 ? n : null;
    };
    const decrire = () => {
      const n = lireNumero();
      envoyer.disabled = n === null;
      note.style.color = "";
      if (n === null) {
        note.innerText = "500 au minimum (1-499 : sons skini).";
      } else if (pris?.has(n)) {
        note.style.color = "#ffc46b";
        note.innerText = `son${n}.wav est déjà sur le Pi : il sera remplacé.`;
      } else {
        note.innerText = `→ son${n}.wav${remarque ? ` (${remarque})` : ""}`;
      }
    };
    champ.addEventListener("input", () => {
      remarque = "";
      decrire();
    });

    let pretLe = Number.POSITIVE_INFINITY;
    envoyer.onclick = async (e: MouseEvent) => {
      const numero = lireNumero();
      // Pour comprendre un envoi « sans validation » : d'où vient ce clic.
      console.info("[menu région] Envoyer", {
        numero,
        isTrusted: e.isTrusted,
        clavier: e.detail === 0,
        msDepuisOuverture: Math.round(performance.now() - ouvertLe),
        msDepuisProposition: Math.round(performance.now() - pretLe),
      });
      // Un clic dans la demi-seconde qui suit la proposition n'est pas une validation.
      if (numero === null || performance.now() - pretLe < 500) return;
      envoiEnCours = true;
      envoyer.disabled = true;
      annuler.disabled = true;
      champ.disabled = true;
      const suivi = window.setInterval(() => {
        statut.innerText = menu.lireStatut() ?? "Envoi…";
      }, 200);
      const resultat = await menu.envoyer(numero);
      window.clearInterval(suivi);
      envoiEnCours = false;
      annuler.disabled = false;
      statut.style.color = resultat.ok ? "#9be29b" : "#ff9b9b";
      statut.innerText = resultat.message;
    };

    void menu.proposer().then((proposition) => {
      pris = proposition.pris;
      remarque = proposition.remarque ?? "";
      champ.value = String(proposition.numero);
      champ.disabled = false;
      pretLe = performance.now();
      decrire();
      champ.focus();
      champ.select();
    });
  }

  document.body.appendChild(boite);
  // La boîte reste dans la fenêtre.
  const cadre = boite.getBoundingClientRect();
  if (cadre.right > window.innerWidth) boite.style.left = `${Math.max(0, window.innerWidth - cadre.width - 8)}px`;
  if (cadre.bottom > window.innerHeight) boite.style.top = `${Math.max(0, window.innerHeight - cadre.height - 8)}px`;
  // Après le clic droit en cours, pour qu'il ne referme pas aussitôt le menu.
  const minuterie = window.setTimeout(() => {
    document.addEventListener("pointerdown", clicAilleurs, true);
    document.addEventListener("keydown", touche, true);
  }, 0);
  retirerEcouteurs = () => {
    window.clearTimeout(minuterie);
    document.removeEventListener("pointerdown", clicAilleurs, true);
    document.removeEventListener("keydown", touche, true);
  };
}
