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
#${ID_OVERLAY} .osc { display: flex; flex-direction: column; height: 100%; box-sizing: border-box;
  font-family: "IBM Plex Sans", system-ui, sans-serif; color: #e6e8eb; }
#${ID_OVERLAY} .haut { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 8px; border-bottom: 1px solid #262a31; }
#${ID_OVERLAY} .liste { flex: 1; min-height: 0; overflow: auto; padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 4px; }
#${ID_OVERLAY} .liste > * { flex: 0 0 auto; }
#${ID_OVERLAY} .liste .titre { margin-top: 10px; }
#${ID_OVERLAY} .api { white-space: normal; display: grid; grid-template-columns: minmax(0, 1fr); text-align: left; gap: 2px; padding: 6px 10px; }
#${ID_OVERLAY} .api code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px; color: #f2f3f5; }
#${ID_OVERLAY} .api span { font-size: 12px; color: #9aa1ab; }

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

/**
 * L'API OSC d'un module pré : seulement les messages vérifiés en exécution (les autres, lus dans
 * les patchs, sont dans notes/skini-osc.md de CRReaM-dev-root, à vérifier avant d'entrer ici).
 * `exemple` va dans le champ.
 */
type MessageApi = { exemple: string; forme: string; doc: string };
const API: { groupe: string; messages: MessageApi[] }[] = [
  { groupe: "Module", messages: [
    { exemple: "/composition 1", forme: "/composition <n>", doc: "charge la composition n de config.json (à partir de 0) ; hors liste : rien" },
    { exemple: "/cue 1", forme: "/cue <n>", doc: "cue n, relayée à la composition (init_track : cue_param)" },
  ] },
  { groupe: "Effets (inserts, 4 emplacements)", messages: [
    { exemple: "/fx canaux 1", forme: "/fx canaux 1|2", doc: "chaîne mono ou stéréo" },
    { exemple: "/fx 1 charge greyhole", forme: "/fx <n> charge <pédale>", doc: "met la pédale dans l'emplacement n ; déjà là ou inconnue : rien ne change (on peut renvoyer tout l'état)" },
    { exemple: "/fx 1 vide", forme: "/fx <n> vide", doc: "coupe l'entrée de la pédale et la retire 8 s plus tard : la queue s'éteint" },
    { exemple: "/fx 1 bypass 1", forme: "/fx <n> bypass 0|1", doc: "coupe (1) ou rouvre (0) l'entrée de la pédale ; la queue s'éteint" },
    { exemple: "/fx 1 feedback 0.3", forme: "/fx <n> <paramètre> <valeur>", doc: "règle la pédale (la fin de son chemin Faust)" },
  ] },
  { groupe: "Skini (lecteur de sons)", messages: [
    { exemple: "/play 500 75", forme: "/play <son> <gain>", doc: "joue sonN.wav (500 et plus : sons de WAM)" },
  ] },
  { groupe: "Synthé (composition faust)", messages: [
    { exemple: "/note 60 100", forme: "/note <hauteur> <vélocité>", doc: "joue une note ; vélocité 0 : la relâche" },
    { exemple: "/synth tous ON 1", forme: "/synth tous <paramètre> <valeur>", doc: "toutes les voix (gardé pour la suite)" },
    { exemple: "/synth 1 gate 0", forme: "/synth <voix> <paramètre> <valeur>", doc: "une voix (1 à n)" },
    { exemple: "/synth note 60 gate 0", forme: "/synth note <hauteur> <paramètre> <valeur>", doc: "la voix qui joue cette note" },
  ] },
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
  const cadre = document.createElement("div");
  cadre.className = "osc";
  overlay.appendChild(cadre);
  const fenetre = document.createElement("div");
  fenetre.className = "haut";
  const liste_ = document.createElement("div");
  liste_.className = "liste";
  cadre.append(fenetre, liste_);

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

  // La liste qui défile : les derniers envois, puis l'API.
  const titreHist = document.createElement("div");
  titreHist.className = "titre";
  titreHist.textContent = "Derniers envois";
  liste_.append(titreHist, historique);
  montrerHistorique(lireHistorique());
  for (const g of API) {
    const t = document.createElement("div");
    t.className = "titre";
    t.textContent = g.groupe;
    liste_.appendChild(t);
    for (const m of g.messages) {
      const b = document.createElement("button");
      b.className = "api";
      b.title = `Mettre « ${m.exemple} » dans le champ (Entrée pour envoyer)`;
      const code = document.createElement("code");
      code.textContent = m.forme;
      const doc = document.createElement("span");
      doc.textContent = m.doc;
      b.append(code, doc);
      b.addEventListener("click", () => {
        champ.value = m.exemple;
        champ.focus();
        // Le curseur sur le dernier argument, celui qu'on change le plus souvent.
        const i = m.exemple.lastIndexOf(" ");
        if (i > 0) champ.setSelectionRange(i + 1, m.exemple.length);
      });
      liste_.appendChild(b);
    }
  }

  monterFenetre(overlay);
  champ.focus();
}
