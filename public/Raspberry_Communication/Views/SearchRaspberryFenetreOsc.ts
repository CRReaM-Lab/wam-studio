/**
 * L'onglet « OSC » du panneau Pi son : envoyer une commande OSC à un Pi, une section ou tous les
 * Pi en ligne. Remplace la fenêtre Search Raspberry, dont c'était l'usage utile ; la liste et
 * l'état des Pi sont dans la page de maintenance.
 *
 * Une commande s'écrit comme on la lit : `/play 500 75`, `/stop -1`, `/synth tous ON 1`. Les
 * boutons préparent les plus courantes ; Entrée envoie. Les derniers envois restent à portée
 * (gardés dans le navigateur), un clic les rejoue.
 */
import { monterFenetre } from "./PanneauPiSon";

const ID_OVERLAY = "raspberry-osc-overlay";
const CLE_HISTORIQUE = "wam-osc-historique";
const HISTORIQUE_MAX = 12;

export type PiOsc = { ip: string; nom: string; enLigne: boolean; section: string | null };

export type CibleOsc = { nom: string; ips: string[] };

/** Les cibles proposées : tous les Pi en ligne, chaque section, chaque Pi. */
export function cibles(pis: PiOsc[]): CibleOsc[] {
  const enLigne = pis.filter((p) => p.enLigne);
  const liste: CibleOsc[] = [{ nom: `Tous les Pi en ligne (${enLigne.length})`, ips: enLigne.map((p) => p.ip) }];
  const sections = [...new Set(enLigne.map((p) => p.section).filter((s): s is string => !!s))].sort();
  for (const s of sections) {
    const ips = enLigne.filter((p) => p.section === s).map((p) => p.ip);
    liste.push({ nom: `Section ${s} (${ips.length})`, ips });
  }
  for (const p of enLigne) liste.push({ nom: `${p.nom} (${p.ip})`, ips: [p.ip] });
  return liste;
}

/** `/play 500 75` → adresse `/play`, valeur `500 75`. */
export function lireCommande(texte: string): { adresse: string; valeur: string } | null {
  const t = texte.trim();
  if (!t) return null;
  const [premier, ...reste] = t.split(/\s+/);
  const adresse = premier.startsWith("/") ? premier : `/${premier}`;
  return adresse.length > 1 ? { adresse, valeur: reste.join(" ") } : null;
}

function lireHistorique(): string[] {
  try {
    const h = JSON.parse(localStorage.getItem(CLE_HISTORIQUE) ?? "[]");
    return Array.isArray(h) ? h.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function noterHistorique(commande: string): string[] {
  const h = [commande, ...lireHistorique().filter((x) => x !== commande)].slice(0, HISTORIQUE_MAX);
  try {
    localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(h));
  } catch {
    /* stockage indisponible : l'historique vaut pour cette page */
  }
  return h;
}

const STYLE = `
#${ID_OVERLAY} .osc { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; height: 100%; box-sizing: border-box;
  font-family: "IBM Plex Sans", system-ui, sans-serif; color: #e6e8eb; }
#${ID_OVERLAY} select, #${ID_OVERLAY} input { font: inherit; font-size: 14px; background: #111316; color: #e6e8eb;
  border: 1px solid #262a31; border-radius: 6px; padding: 8px; min-height: 40px; box-sizing: border-box; }
#${ID_OVERLAY} input.commande { font-family: "IBM Plex Mono", ui-monospace, monospace; flex: 1; min-width: 0; }
#${ID_OVERLAY} .ligne { display: flex; gap: 6px; }
#${ID_OVERLAY} button { font: inherit; font-size: 13px; background: #1b1f25; color: #e6e8eb; border: 1px solid #262a31;
  border-radius: 6px; padding: 6px 10px; min-height: 36px; cursor: pointer; touch-action: manipulation; }
#${ID_OVERLAY} button:hover { background: #22262c; }
#${ID_OVERLAY} button.envoyer { background: #e2a24b; border-color: #e2a24b; color: #1a1206; font-weight: 600; min-width: 84px; }
#${ID_OVERLAY} .titre { font-size: 12px; color: #8a929d; text-transform: uppercase; letter-spacing: .06em; margin-top: 4px; }
#${ID_OVERLAY} .boutons { display: flex; flex-wrap: wrap; gap: 6px; }
#${ID_OVERLAY} .boutons button { font-family: "IBM Plex Mono", ui-monospace, monospace; }
#${ID_OVERLAY} .statut { font-size: 13px; color: #9fb3cf; min-height: 18px; white-space: pre-wrap; }
#${ID_OVERLAY} .historique { display: flex; flex-direction: column; gap: 4px; overflow: auto; min-height: 0; }
#${ID_OVERLAY} .historique button { text-align: left; font-family: "IBM Plex Mono", ui-monospace, monospace; }
`;

/** Les commandes préparées : le texte mis dans le champ (on complète ou on envoie). */
const PREPAREES: { groupe: string; commandes: string[] }[] = [
  { groupe: "Sons", commandes: ["/play 500 75", "/stop -1", "/level 75"] },
  { groupe: "Pièce", commandes: ["/cue 1", "/composition 1", "/volume 100", "/mute 0"] },
  { groupe: "Effets (inserts)", commandes: ["/fx canaux 1", "/fx 1 charge greyhole", "/fx 1 vide", "/fx 1 bypass 1"] },
  { groupe: "Synthé (composition faust)", commandes: ["/note 60 100", "/note 60 0", "/synth tous ON 1", "/synth 1 gate 0", "/synth note 60 gate 0"] },
];

export function ouvrirOngletOsc(params: {
  lirePis: () => PiOsc[];
  envoyer: (ip: string, adresse: string, valeur: string) => boolean;
}): void {
  document.getElementById(ID_OVERLAY)?.remove();
  if (!document.getElementById(`${ID_OVERLAY}-style`)) {
    const style = document.createElement("style");
    style.id = `${ID_OVERLAY}-style`;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const overlay = document.createElement("div");
  overlay.id = ID_OVERLAY;
  const fenetre = document.createElement("div");
  fenetre.className = "osc";
  overlay.appendChild(fenetre);

  const choix = document.createElement("select");
  choix.setAttribute("aria-label", "À qui envoyer");
  let liste = cibles(params.lirePis());
  const remplir = () => {
    const garde = choix.value;
    liste = cibles(params.lirePis());
    choix.innerHTML = "";
    liste.forEach((c, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = c.nom;
      choix.appendChild(o);
    });
    if (garde && Number(garde) < liste.length) choix.value = garde;
  };
  remplir();
  const titreCible = document.createElement("div");
  titreCible.className = "titre";
  titreCible.textContent = "À qui";
  fenetre.append(titreCible, choix);

  const ligne = document.createElement("div");
  ligne.className = "ligne";
  const champ = document.createElement("input");
  champ.className = "commande";
  champ.placeholder = "/play 500 75";
  champ.setAttribute("aria-label", "Commande OSC");
  const envoyer = document.createElement("button");
  envoyer.className = "envoyer";
  envoyer.textContent = "Envoyer";
  ligne.append(champ, envoyer);
  fenetre.appendChild(ligne);

  const statut = document.createElement("div");
  statut.className = "statut";
  fenetre.appendChild(statut);

  const historique = document.createElement("div");
  historique.className = "historique";
  const montrerHistorique = (h: string[]) => {
    historique.innerHTML = "";
    for (const c of h) {
      const b = document.createElement("button");
      b.textContent = c;
      b.title = "Rejouer";
      b.addEventListener("click", () => {
        champ.value = c;
        partir();
      });
      historique.appendChild(b);
    }
  };

  const partir = () => {
    const commande = lireCommande(champ.value);
    if (!commande) {
      statut.textContent = "Écrire une commande : /adresse arguments";
      return;
    }
    remplir();
    const cible = liste[Number(choix.value) || 0];
    if (!cible || cible.ips.length === 0) {
      statut.textContent = "Aucun Pi en ligne dans cette cible.";
      return;
    }
    const echecs = cible.ips.filter((ip) => !params.envoyer(ip, commande.adresse, commande.valeur));
    const texte = `${commande.adresse}${commande.valeur ? " " + commande.valeur : ""}`;
    statut.textContent = echecs.length
      ? `Serveur non connecté : ${texte} non envoyé à ${echecs.length} Pi.`
      : `${texte} → ${cible.ips.length} Pi (${cible.nom.replace(/ \(\d+\)$/, "")})`;
    if (!echecs.length) montrerHistorique(noterHistorique(texte));
  };
  envoyer.addEventListener("click", partir);
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      partir();
    }
  });

  for (const g of PREPAREES) {
    const t = document.createElement("div");
    t.className = "titre";
    t.textContent = g.groupe;
    const zone = document.createElement("div");
    zone.className = "boutons";
    for (const c of g.commandes) {
      const b = document.createElement("button");
      b.textContent = c;
      b.title = "Mettre dans le champ (Entrée pour envoyer)";
      b.addEventListener("click", () => {
        champ.value = c;
        champ.focus();
        // Le curseur sur le dernier argument, celui qu'on change le plus souvent.
        const i = c.lastIndexOf(" ");
        if (i > 0) champ.setSelectionRange(i + 1, c.length);
      });
      zone.appendChild(b);
    }
    fenetre.append(t, zone);
  }
  const titreHist = document.createElement("div");
  titreHist.className = "titre";
  titreHist.textContent = "Derniers envois";
  fenetre.append(titreHist, historique);
  montrerHistorique(lireHistorique());

  monterFenetre(overlay);
  champ.focus();
}
