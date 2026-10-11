/**
 * L'inspecteur, dans la zone du bas : les réglages de la piste choisie et de son module, en
 * onglets, dans l'ordre du signal. Instrument (ce que joue le module : synthé Faust, SoundFont et
 * programme), une pédale par onglet (tous ses paramètres, ceux du pedalboard de la piste : la
 * synchro des effets les envoie au module), Sortie (niveau, limiteur), MIDI (à venir).
 *
 * Il prend la place des grands boutons du pedalboard de WAM (ajouter, montrer, cacher, retirer),
 * rangés dans une colonne étroite à droite ; la piste maître reste à gauche en attendant sa ligne
 * dans l'arrangeur.
 */
import type { IWamPistesPont, ParametreEffet, ReglagesEffet } from "../Interfaces/IWamPistesPont";
import { raspberryTrackBindingStore } from "../Services/RaspberryTrackBindingStore";
import {
  affecterInstrument,
  affecterLimiteur,
  affecterReglageSynthe,
  affecterSynthe,
  ecrireAffectationCompositions,
  compositionDuModule,
  EVENEMENT_COMPOSITIONS,
  lireAffectationCompositions,
} from "../Services/RaspberryCompositionsStore";
import { lireBibliotheque, type ListeBibliotheque } from "../Services/RaspberryBibliotheque";
import { FAMILLES_GM } from "../Services/GeneralMidi";
import { ouvrirOngletPlan } from "./SearchRaspberryFenetrePlan";

const ID = "raspberry-inspecteur";
const ID_ACTIONS = "raspberry-inspecteur-actions";

const STYLE = `
#${ID} { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; background: #16191d; color: #e6e8eb;
  font: 13px "IBM Plex Sans", system-ui, sans-serif; border-left: 1px solid #262a31; overflow: hidden; }
#${ID} .tete { display: flex; align-items: baseline; gap: 10px; padding: 8px 14px 4px; flex-wrap: wrap; }
#${ID} .titre { font-weight: 600; font-size: 14px; }
#${ID} .resume { color: #9fb3cf; }
#${ID} .point { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; background: #555b64; }
#${ID} .point.en-ligne { background: #5fd38a; }
#${ID} nav { display: flex; flex-wrap: wrap; gap: 2px; padding: 0 8px; border-bottom: 1px solid #262a31; }
#${ID} nav button { font: inherit; color: #9aa1ab; background: transparent; border: 0; border-bottom: 2px solid transparent;
  padding: 8px 8px; min-height: 36px; cursor: pointer; }
#${ID} nav button[aria-selected="true"] { color: #f2f3f5; border-bottom-color: #6fb6ff; }
#${ID} nav button .sans { color: #f0b45a; }
#${ID} .corps { flex: 1; min-height: 0; overflow: auto; padding: 10px 14px 14px; }
#${ID} .vide, #${ID} .aide { color: #8a929d; }
#${ID} .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px 18px; margin-top: 8px; }
#${ID} .reglage { display: grid; grid-template-columns: minmax(70px, 40%) 1fr 52px; align-items: center; gap: 8px; min-height: 32px; }
#${ID} .reglage label { color: #c9ced6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${ID} .reglage output { color: #9fb3cf; font: 12px "IBM Plex Mono", ui-monospace, monospace; text-align: right; }
#${ID} input[type=range] { width: 100%; accent-color: #6fb6ff; }
#${ID} select, #${ID} input[type=number], #${ID} button.action { font: inherit; color: #e6e8eb; background: #1f242b;
  border: 1px solid #333a43; border-radius: 6px; min-height: 32px; padding: 0 8px; }
#${ID} button.action { cursor: pointer; }
#${ID} .ligne { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
#${ID} .alerte { color: #f0b45a; }
#${ID} .corps > .titre { display: block; margin-top: 12px; color: #c9ced6; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
#${ID_ACTIONS} { flex: 0 0 170px; display: flex; flex-direction: column; gap: 2px; padding: 4px; overflow: auto;
  border-left: 1px solid #262a31; background: #16191d; }
#${ID_ACTIONS} .new-track { width: auto; min-height: 0; margin: 0; padding: 6px 8px; flex-direction: row-reverse;
  justify-content: flex-end; gap: 6px; border-radius: 6px; }
#${ID_ACTIONS} .new-track-text { padding: 0; font-size: 12px; font-weight: 500; }
#${ID_ACTIONS} .new-track .icon i { width: 16px !important; height: 16px; }
`;

type ModuleParc = { numero: number; ip: string; enLigne: boolean };
/** Un paramètre d'un instrument des modules (`instruments-parametres.json`, relevé par michel). */
export type ParametreInstrument = {
  nom: string;
  libelle: string;
  groupe: string;
  genre: "curseur" | "interrupteur" | "bouton";
  min: number;
  max: number;
  init: number;
  pas: number;
  choix: string[];
  unite?: string;
  cc?: number;
};
type ParametresInstruments = { instruments: Record<string, ParametreInstrument[]>; fiches: Record<string, string> };
type Section = { id: string; nom: string };
type Contexte = {
  modules: ModuleParc[];
  sections: Section[];
  sectionDe: Record<string, string | undefined>;
  compositionParc: string;
  instrumentsFaust: string[];
  bibliotheque: ListeBibliotheque;
  parametres: ParametresInstruments;
};

/**
 * Les paramètres d'un instrument rangés par groupe, dans l'ordre : le groupe Faust (`MAIN/VCF` →
 * `VCF`), ou pour Cmajor (sans groupe) le premier mot du libellé (`Filter Cutoff` → `Filter`). Pur.
 */
export function groupesParametres(parametres: ParametreInstrument[]): { groupe: string; parametres: ParametreInstrument[] }[] {
  const groupes: { groupe: string; parametres: ParametreInstrument[] }[] = [];
  for (const p of parametres) {
    const groupe = p.groupe ? p.groupe.split("/").filter((g) => g !== "MAIN").join(" · ") || p.groupe : p.libelle.split(" ")[0];
    let g = groupes.find((x) => x.groupe === groupe);
    if (!g) groupes.push((g = { groupe, parametres: [] }));
    g.parametres.push(p);
  }
  return groupes;
}

/** Les onglets d'une piste : l'instrument, une pédale par onglet, la sortie, le MIDI. Pur, pour les tests. */
export function ongletsInspecteur(effets: { nom: string; objetPd: string | null }[]): { cle: string; libelle: string; sansEquivalent: boolean }[] {
  return [
    { cle: "instrument", libelle: "Instrument", sansEquivalent: false },
    ...effets.map((e, i) => ({ cle: `effet-${i}`, libelle: `${i + 1} · ${e.nom}`, sansEquivalent: !e.objetPd })),
    { cle: "sortie", libelle: "Sortie", sansEquivalent: false },
    { cle: "midi", libelle: "MIDI", sansEquivalent: false },
  ];
}

/**
 * Des noms courts pour les paramètres d'une pédale, dont le pedalboard donne le chemin Faust
 * (`/greyhole/Greyhole/size`, `/compressor/3-gain/Makeup_Gain`) : le plus court suffixe qui reste
 * unique dans la pédale (`size`, `Makeup_Gain`). Un libellé sans `/` reste tel quel. Pur.
 */
export function nomsCourts(chemins: string[]): string[] {
  const segments = chemins.map((c) => c.split("/").filter(Boolean));
  return chemins.map((c, i) => {
    if (!c.startsWith("/") || !segments[i].length) return c;
    for (let n = 1; n <= segments[i].length; n++) {
      const suffixe = segments[i].slice(-n).join("/");
      if (segments.every((s, k) => k === i || s.slice(-n).join("/") !== suffixe)) return suffixe;
    }
    return segments[i].join("/");
  });
}

/** Le pas d'un curseur : 1 pour un paramètre discret, sinon 1/200 de la plage. Pur. */
export function pasParametre(p: Pick<ParametreEffet, "min" | "max" | "discret">): number {
  if (p.discret) return 1;
  const plage = p.max - p.min;
  return plage > 0 ? plage / 200 : 0.01;
}

/** La valeur affichée : 3 chiffres significatifs au plus. Pur. */
export function texteValeur(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, texte = "", classe = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (texte) e.textContent = texte;
  if (classe) e.className = classe;
  return e;
}

/** Envoie un message OSC à un module par le serveur (retenu par le handshake) ; rend l'erreur ou "". */
async function osc(ip: string, adresse: string, valeur: string): Promise<string> {
  try {
    const r = await fetch("/api/maintenance/osc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip, adresse, valeur }) });
    const j = (await r.json()) as { ok: boolean; error?: string };
    return j.ok ? "" : j.error || "refusé";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Un réglage curseur : libellé, curseur, valeur ; `surChange` à chaque mouvement. */
function curseur(nom: string, min: number, max: number, pas: number, valeur: number, surChange: (v: number) => void, unite = ""): HTMLElement {
  const ligne = el("div", "", "reglage");
  const libelle = el("label", nom);
  libelle.title = nom;
  const entree = el("input");
  Object.assign(entree, { type: "range", min: String(min), max: String(max), step: String(pas), value: String(valeur) });
  entree.setAttribute("aria-label", nom);
  const sortie = el("output", texteValeur(valeur) + unite);
  entree.oninput = () => {
    sortie.textContent = texteValeur(entree.valueAsNumber) + unite;
    surChange(entree.valueAsNumber);
  };
  ligne.append(libelle, entree, sortie);
  return ligne;
}

/** Retarde un envoi tant que le curseur bouge (au plus un envoi toutes les `ms`). */
function regulier<T>(ms: number, f: (v: T) => void): (v: T) => void {
  let minuterie: number | undefined;
  let dernier: T;
  return (v: T) => {
    dernier = v;
    if (minuterie !== undefined) return;
    minuterie = window.setTimeout(() => {
      minuterie = undefined;
      f(dernier);
    }, ms);
  };
}

export function demarrerInspecteur(pont: IWamPistesPont): void {
  const plugins = document.getElementById("plugins");
  const piste = document.getElementById("main-track");
  if (!plugins || !piste || document.getElementById(ID)) return;
  const style = el("style");
  style.textContent = STYLE;
  document.head.append(style);

  // Les boutons du pedalboard de WAM, rangés dans une colonne étroite (WAM y ajoute les siens après
  // `#add-plugins`, qui y passe aussi).
  const actions = el("div");
  actions.id = ID_ACTIONS;
  for (const enfant of [...plugins.children]) if (enfant !== piste) actions.append(enfant);
  const racine = el("section");
  racine.id = ID;
  racine.setAttribute("aria-label", "Inspecteur de la piste");
  plugins.append(racine, actions);

  const tete = el("div", "", "tete");
  const nav = el("nav");
  nav.setAttribute("role", "tablist");
  const corps = el("div", "", "corps");
  racine.append(tete, nav, corps);

  let contexte: Contexte = {
    modules: [], sections: [], sectionDe: {}, compositionParc: "skini", instrumentsFaust: [],
    bibliotheque: { instruments: [], surLesPi: {} }, parametres: { instruments: {}, fiches: {} },
  };
  let onglet = "instrument";
  let cleRendue = "";
  let effets: { nom: string; objetPd: string | null }[] = [];
  let reglages: ReglagesEffet[] = [];

  const chargerContexte = async () => {
    try {
      const [m, i, c] = await Promise.all([
        fetch("/api/maintenance").then((r) => r.json()) as Promise<{ modules: ModuleParc[] }>,
        fetch("/api/implantations/active").then((r) => r.json()) as Promise<{ sections?: Section[]; modules?: Record<string, { section?: string }> }>,
        fetch("/api/compositions").then((r) => r.json()) as Promise<{ defaut?: string; instrumentsFaust?: string[] }>,
      ]);
      contexte = {
        ...contexte,
        modules: m.modules ?? [],
        sections: i.sections ?? [],
        sectionDe: Object.fromEntries(Object.entries(i.modules ?? {}).map(([n, v]) => [n, v.section])),
        compositionParc: c.defaut || "skini",
        instrumentsFaust: c.instrumentsFaust ?? [],
      };
      contexte.bibliotheque = await lireBibliotheque().catch(() => contexte.bibliotheque);
      contexte.parametres = await fetch("/api/instruments/parametres")
        .then((r) => (r.ok ? r.json() : contexte.parametres))
        .catch(() => contexte.parametres);
      // Pas de redessin sous la main de qui tient un réglage.
      if (!corps.contains(document.activeElement)) cleRendue = "";
    } catch {
      /* serveur injoignable : on garde le dernier contexte */
    }
  };

  const lier = () => {
    const trackId = pont.lirePisteChoisie();
    const binding = trackId === null ? undefined : raspberryTrackBindingStore.trouverParTrackId(trackId);
    return { trackId, binding: binding && binding.liee !== false ? binding : undefined };
  };

  /** L'onglet Instrument : ce que joue le module, d'après sa composition. */
  const rendreInstrument = (numero: number, ip: string | undefined, enLigne: boolean) => {
    const affectation = lireAffectationCompositions();
    const idSection = contexte.sectionDe[String(numero)];
    const section = contexte.sections.find((s) => s.id === idSection) ?? null;
    const composition = compositionDuModule(affectation, numero, section, contexte.compositionParc);
    corps.append(el("div", `Composition ${composition.nom} (${{ module: "propre au module", section: "de la section", projet: "du projet", parc: "du parc" }[composition.origine]})`, "aide"));
    const etat = el("div", "", "aide");
    const envoyer = async (adresse: string, valeur: string) => {
      if (!ip || !enLigne) {
        etat.textContent = "Retenu ; part au module à la prochaine lecture (hors ligne).";
        return;
      }
      const erreur = await osc(ip, adresse, valeur);
      etat.textContent = erreur ? `Échec : ${erreur}` : `Envoyé au module ${numero}.`;
    };
    if (composition.nom === "faust") {
      const ligne = el("div", "", "ligne");
      ligne.append(el("span", "Synthé"));
      const select = el("select");
      select.append(new Option("Celui de la fiche du module", ""));
      const choisi = affectation.synthes[String(numero)] ?? "";
      for (const nom of contexte.instrumentsFaust) select.append(new Option(nom, nom));
      if (choisi && !contexte.instrumentsFaust.includes(choisi)) select.append(new Option(`${choisi} (absent des modules)`, choisi));
      select.value = choisi;
      select.onchange = () => {
        affecterSynthe(numero, select.value);
        if (select.value) void envoyer("/instrument", select.value);
      };
      ligne.append(select);
      corps.append(ligne);
      rendreReglagesSynthe(numero, choisi || contexte.parametres.fiches[String(numero)] || "", ip, enLigne, etat);
    } else if (composition.nom === "soundfont") {
      const choisi = affectation.instruments[String(numero)];
      const sf = choisi?.soundfont ?? "";
      const ligne = el("div", "", "ligne");
      ligne.append(el("span", "SoundFont"));
      const selectSf = el("select");
      selectSf.append(new Option("Celle de la fiche (General MIDI)", ""));
      for (const i of contexte.bibliotheque.instruments) selectSf.append(new Option(`${i.nom} (${i.genre === "kit" ? "kit" : i.extension})`, i.nom));
      if (sf && !contexte.bibliotheque.instruments.some((i) => i.nom === sf)) selectSf.append(new Option(`${sf} (absente)`, sf));
      selectSf.value = sf;
      selectSf.onchange = () => {
        const nom = selectSf.value;
        affecterInstrument(numero, nom ? { programme: 0, banque: 0, soundfont: nom } : { programme: 0, banque: 0 });
        const present = !nom || (ip && (contexte.bibliotheque.surLesPi[nom] ?? []).includes(ip));
        if (!present) {
          etat.textContent = `« ${nom} » n'est pas sur le module : l'envoyer depuis le Plan.`;
          return;
        }
        if (nom) void envoyer("/soundfont", nom).then(() => envoyer("/pgm", "0"));
        else void envoyer("/pgm", "0");
      };
      ligne.append(selectSf);
      const programme = el("select");
      if (!sf) {
        FAMILLES_GM.forEach((f, i) => {
          const groupe = document.createElement("optgroup");
          groupe.label = f.famille;
          f.instruments.forEach((nom, j) => groupe.append(new Option(`${i * 8 + j} · ${nom}`, String(i * 8 + j))));
          programme.append(groupe);
        });
      } else {
        for (let p = 0; p < 128; p++) programme.append(new Option(`Programme ${p}`, String(p)));
      }
      programme.value = String(choisi?.programme ?? 0);
      programme.onchange = () => {
        affecterInstrument(numero, { programme: Number(programme.value), banque: choisi?.banque ?? 0, ...(sf ? { soundfont: sf } : {}) });
        void envoyer("/pgm", programme.value);
      };
      ligne.append(programme);
      corps.append(ligne);
    } else {
      corps.append(el("div", `Le module joue les sons de la composition « ${composition.nom} » : pas de réglage d'instrument.`, "aide"));
    }
    const plan = el("button", "Composition, imports, envoi : ouvrir le Plan", "action");
    plan.type = "button";
    plan.onclick = () => ouvrirOngletPlan();
    const bas = el("div", "", "ligne");
    bas.append(plan);
    corps.append(etat, bas);
  };

  /** Les réglages du synthé que joue le module (`/synth tous <paramètre> <valeur>`), par groupe. */
  const rendreReglagesSynthe = (numero: number, synthe: string, ip: string | undefined, enLigne: boolean, etat: HTMLElement) => {
    if (!synthe) {
      corps.append(el("div", "Choisir un synthé pour régler ses paramètres.", "aide"));
      return;
    }
    const parametres = contexte.parametres.instruments[synthe] ?? [];
    if (!parametres.length) {
      corps.append(el("div", `Paramètres de ${synthe} inconnus du serveur (michel module publier les relève).`, "aide"));
      return;
    }
    const retenus = () => lireAffectationCompositions().reglagesSynthes?.[String(numero)]?.[synthe] ?? {};
    const envoyer = async (p: ParametreInstrument, v: number) => {
      // Régler un paramètre fixe le synthé du module : la lecture le renverra avec ses réglages.
      if (!lireAffectationCompositions().synthes[String(numero)]) affecterSynthe(numero, synthe);
      affecterReglageSynthe(numero, synthe, p.nom, v);
      if (!ip || !enLigne) {
        etat.textContent = "Retenu ; part au module à la prochaine lecture (hors ligne).";
        return;
      }
      const erreur = await osc(ip, "/synth", `tous ${p.nom} ${v}`);
      etat.textContent = erreur ? `Échec : ${erreur}` : "";
    };
    const valeurs = retenus();
    for (const g of groupesParametres(parametres)) {
      corps.append(el("div", g.groupe, "titre"));
      const grille = el("div", "", "grille");
      for (const p of g.parametres) {
        const valeur = valeurs[p.nom] ?? p.init;
        const titre = `${p.libelle}${p.unite ? ` (${p.unite})` : ""}`;
        if (p.choix.length) {
          const l = el("div", "", "reglage");
          const select = el("select");
          p.choix.forEach((c, i) => select.append(new Option(c, String(p.min + i))));
          select.value = String(Math.round(valeur));
          select.onchange = () => void envoyer(p, Number(select.value));
          l.append(el("label", titre), select);
          grille.append(l);
        } else if (p.genre === "interrupteur") {
          const l = el("div", "", "reglage");
          const coche = el("input");
          coche.type = "checkbox";
          coche.checked = valeur >= 0.5;
          coche.onchange = () => void envoyer(p, coche.checked ? 1 : 0);
          l.append(el("label", titre), coche);
          grille.append(l);
        } else if (p.genre === "bouton") {
          const l = el("div", "", "reglage");
          const b = el("button", "●", "action");
          b.type = "button";
          b.onpointerdown = () => void envoyer(p, 1);
          b.onpointerup = b.onpointerleave = () => void envoyer(p, 0);
          l.append(el("label", titre), b);
          grille.append(l);
        } else {
          grille.append(curseur(titre, p.min, p.max, p.pas > 0 ? p.pas : pasParametre({ ...p, discret: false }), valeur, regulier<number>(80, (v) => void envoyer(p, v))));
        }
      }
      corps.append(grille);
    }
    const ligne = el("div", "", "ligne");
    const fiche = el("button", "Revenir aux valeurs de la fiche", "action");
    fiche.type = "button";
    fiche.disabled = !Object.keys(valeurs).length;
    fiche.onclick = async () => {
      const a = lireAffectationCompositions();
      const touches = Object.keys(a.reglagesSynthes?.[String(numero)]?.[synthe] ?? {});
      if (a.reglagesSynthes?.[String(numero)]) delete a.reglagesSynthes[String(numero)][synthe];
      ecrireAffectationCompositions(a);
      if (ip && enLigne)
        for (const nom of touches) {
          const p = parametres.find((x) => x.nom === nom);
          if (p) await osc(ip, "/synth", `tous ${p.nom} ${p.init}`);
        }
      cleRendue = "";
      rendre();
    };
    ligne.append(fiche);
    corps.append(ligne);
  };

  /** Un onglet de pédale : tous ses paramètres (pedalboard de la piste), et ce qui part au module. */
  const rendreEffet = (trackId: number, position: number, raspberryId: number) => {
    const r = reglages.find((x) => x.position === position);
    const e = effets[position];
    const binding = raspberryTrackBindingStore.trouverParTrackId(trackId);
    const ligne = el("div", "", "ligne");
    const coche = el("input");
    coche.type = "checkbox";
    coche.checked = binding?.fxDirect === true;
    coche.onchange = () => {
      const b = raspberryTrackBindingStore.trouverParTrackId(trackId);
      if (!b) return;
      b.fxDirect = coche.checked;
      raspberryTrackBindingStore.enregistrer(b);
    };
    const etiquette = el("label");
    etiquette.append(coche, document.createTextNode(` Jouer ces effets sur rasp ${raspberryId}`));
    ligne.append(etiquette);
    ligne.append(
      e?.objetPd
        ? el("span", `→ [${e.objetPd}~] sur le module`, "aide")
        : el("span", "Sans équivalent sur le module : l'emplacement reste vide.", "alerte")
    );
    corps.append(ligne);
    if (!r?.parametres.length) {
      corps.append(el("div", "Cette pédale n'a pas de paramètre réglable.", "aide"));
      return;
    }
    const grille = el("div", "", "grille");
    const noms = nomsCourts(r.parametres.map((p) => p.nom));
    for (const [k, p0] of r.parametres.entries()) {
      const p = { ...p0, nom: noms[k] };
      const envoyer = regulier<number>(60, (v) => void pont.reglerEffet(trackId, p.id, v));
      if (p.choix.length) {
        const l = el("div", "", "reglage");
        const select = el("select");
        p.choix.forEach((c, i) => select.append(new Option(c, String(i))));
        select.value = String(Math.round(p.valeur));
        select.dataset.parametre = p.id;
        select.onchange = () => void pont.reglerEffet(trackId, p.id, Number(select.value));
        l.append(el("label", p.nom), select);
        grille.append(l);
      } else {
        const c = curseur(p.nom, p.min, p.max, pasParametre(p), p.valeur, envoyer);
        c.querySelector("input")!.dataset.parametre = p.id;
        grille.append(c);
      }
    }
    corps.append(grille);
  };

  /** L'onglet Sortie : le niveau du module (fader de la piste) et son limiteur. */
  const rendreSortie = (numero: number, ip: string | undefined, enLigne: boolean, niveau: number | undefined) => {
    corps.append(el("div", `Niveau du module : ${niveau === undefined ? "le sien (fader de la piste jamais touché)" : `${niveau} (fader de la piste, 100 = 0 dB)`}`, "aide"));
    const limiteur = lireAffectationCompositions().limiteurs?.[String(numero)] ?? {};
    const etat = el("div", "", "aide");
    const regler = (cle: "plafond" | "relache") =>
      regulier<number>(150, async (v) => {
        affecterLimiteur(numero, { [cle]: v });
        if (!ip || !enLigne) {
          etat.textContent = "Retenu avec le projet (module hors ligne).";
          return;
        }
        const erreur = await osc(ip, "/limiteur", `${cle} ${v}`);
        etat.textContent = erreur ? `Échec : ${erreur}` : "";
      });
    corps.append(el("div", "Limiteur de sortie (après les effets, avant la carte son)", "titre"));
    const grille = el("div", "", "grille");
    grille.append(
      curseur("Plafond", -20, 0, 0.5, limiteur.plafond ?? -1, regler("plafond"), " dB"),
      curseur("Relâchement", 0.01, 2, 0.01, limiteur.relache ?? 0.2, regler("relache"), " s")
    );
    corps.append(grille, etat);
  };

  const rendre = () => {
    const { trackId, binding } = lier();
    const module = binding ? contexte.modules.find((m) => m.numero === binding.raspberryId) : undefined;
    const onglets = ongletsInspecteur(effets);
    if (!onglets.some((o) => o.cle === onglet)) onglet = "instrument";
    const cle = JSON.stringify([trackId, binding?.raspberryId, binding?.fxDirect, binding?.niveau, module?.enLigne, onglets.map((o) => o.libelle + o.sansEquivalent), onglet,
      reglages.map((r) => r.parametres.map((p) => p.id))]);
    if (cle === cleRendue) {
      // Même structure : seulement les valeurs (le pedalboard a pu bouger), sauf le réglage qu'on tient.
      for (const r of reglages)
        for (const p of r.parametres) {
          const entree = corps.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-parametre="${CSS.escape(p.id)}"]`);
          if (!entree || entree === document.activeElement) continue;
          entree.value = String(entree instanceof HTMLSelectElement ? Math.round(p.valeur) : p.valeur);
          const sortie = entree.parentElement?.querySelector("output");
          if (sortie) sortie.textContent = texteValeur(p.valeur);
        }
      return;
    }
    cleRendue = cle;
    tete.replaceChildren();
    nav.replaceChildren();
    corps.replaceChildren();
    if (trackId === null || !binding) {
      tete.append(el("span", "Inspecteur", "titre"));
      corps.append(el("div", trackId === null ? "Choisir une piste pour voir ses réglages." : "Cette piste n'est pas liée à un module (rasp N) : ses réglages sont ceux de WAM.", "vide"));
      return;
    }
    const point = el("span", "", `point${module?.enLigne ? " en-ligne" : ""}`);
    const resume = el("span", "", "resume");
    resume.append(point, document.createTextNode(module?.enLigne ? "en ligne" : "hors ligne"));
    const nomPiste = pont.lireNomPiste(trackId) ?? "";
    const titre = `rasp ${binding.raspberryId}`;
    tete.append(el("span", nomPiste && nomPiste !== titre ? `${titre} · ${nomPiste}` : titre, "titre"), resume);
    for (const o of onglets) {
      const b = el("button", o.libelle);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(o.cle === onglet));
      if (o.sansEquivalent) b.append(el("span", " ⚠", "sans"));
      b.onclick = () => {
        onglet = o.cle;
        rendre();
      };
      nav.append(b);
    }
    if (onglet === "instrument") rendreInstrument(binding.raspberryId, module?.ip ?? binding.raspberryIp, module?.enLigne === true);
    else if (onglet.startsWith("effet-")) rendreEffet(trackId, Number(onglet.slice(6)), binding.raspberryId);
    else if (onglet === "sortie") rendreSortie(binding.raspberryId, module?.ip ?? binding.raspberryIp, module?.enLigne === true, binding.niveau);
    else corps.append(el("div", "MIDI : l'entrée, le canal, et les correspondances (MIDI learn) viendront ici.", "vide"));
  };

  // Les effets de la piste : relus chaque seconde (le pedalboard ne signale pas ses changements).
  const lireEffets = async () => {
    const { trackId, binding } = lier();
    if (trackId === null || !binding) {
      effets = [];
      reglages = [];
      return;
    }
    try {
      const [d, r] = await Promise.all([pont.decrireEffetsPiste(trackId), pont.lireReglagesEffets(trackId)]);
      effets = d.map((e) => ({ nom: e.nom, objetPd: e.objetPd }));
      reglages = r;
    } catch {
      /* piste en cours de chargement */
    }
  };

  window.addEventListener(EVENEMENT_COMPOSITIONS, () => {
    // Un réglage qu'on tient (le limiteur s'enregistre en bougeant) : ne pas redessiner sous la main.
    if (corps.contains(document.activeElement)) return;
    cleRendue = "";
    rendre();
  });
  void chargerContexte().then(rendre);
  window.setInterval(() => void chargerContexte(), 15000);
  window.setInterval(() => void lireEffets().then(rendre), 1000);
  window.setInterval(rendre, 300);
}
