/**
 * Ce que joue chaque module dans le projet : une composition (un patch des modules pré, par son
 * nom) pour le module lui-même, sinon pour sa section, sinon celle par défaut du projet ; rien de
 * dit : celle du parc (skini). L'implantation dit où sont les modules, le projet dit ce qu'ils
 * jouent (notes/vocabulaire.md de CRReaM-dev-root).
 *
 * Gardée avec le projet (`compositions` de ProjectData) et dans le navigateur entre deux
 * chargements ; part au serveur avec chaque lecture (`affectation` de programmeLancer), qui la
 * traduit en `/composition N` pour chaque Pi.
 */

export type AffectationCompositions = {
  /** La composition des modules dont ni eux ni leur section n'ont la leur ("" : celle du parc). */
  defaut: string;
  /** Par identifiant de section de l'implantation active (`s1`…) ; un projet d'avant les
   *  retient par nom de section, encore lu en secours. */
  sections: Record<string, string>;
  /** Par numéro de module. */
  modules: Record<string, string>;
  /** L'instrument d'un module qui joue `soundfont`, par numéro de module : sa SoundFont (de la
   *  bibliothèque du serveur ; absente : celle de la fiche, General MIDI) et son programme. */
  instruments: Record<string, InstrumentSoundfont>;
  /** Le synthé d'un module qui joue `faust`, par numéro de module (`juno6v2`) ; absent : sa fiche. */
  synthes: Record<string, string>;
  /** Le master de WAM, appliqué à tous les modules (`/volume`, `/mute`) ; absent : jamais touché. */
  general?: { niveau?: number; muet?: boolean };
  /** Le limiteur de sortie de chaque module, par numéro (`/limiteur plafond|relache`) ; absent : ses valeurs par défaut. */
  limiteurs?: Record<string, ReglageLimiteur>;
  /** Les réglages du synthé de chaque module, par numéro puis par synthé puis par paramètre
   *  (`/JUNO6v2/MAIN/VCF/FREQ` → 0.6) : envoyés en `/synth tous`, et de nouveau à chaque lecture. */
  reglagesSynthes?: Record<string, Record<string, Record<string, number>>>;
};

/** Le limiteur de sortie d'un module (`plafond~`) : plafond en dB (−20…0), relâchement en s (0,01…2). */
export type ReglageLimiteur = { plafond?: number; relache?: number };

export type InstrumentSoundfont = {
  programme: number;
  banque: number;
  /** Le nom d'un instrument de la bibliothèque (`sf/<nom>` sur le module, `/soundfont <nom>`). */
  soundfont?: string;
};

/** Même règle que le serveur (Bibliotheque.fs) : le nom devient un nom de fichier sur le module. */
const NOM_SOUNDFONT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const CLE_STOCKAGE = "wam-compositions-projet";
export const EVENEMENT_COMPOSITIONS = "wam-compositions-projet";

function lireStockage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function noms(valeur: unknown): Record<string, string> {
  const resultat: Record<string, string> = {};
  if (!valeur || typeof valeur !== "object") return resultat;
  for (const [cle, nom] of Object.entries(valeur as Record<string, unknown>)) {
    if (typeof nom === "string" && nom.trim()) resultat[cle] = nom.trim();
  }
  return resultat;
}

export function affectationVide(): AffectationCompositions {
  return { defaut: "", sections: {}, modules: {}, instruments: {}, synthes: {} };
}

function instruments(valeur: unknown): Record<string, InstrumentSoundfont> {
  const resultat: Record<string, InstrumentSoundfont> = {};
  if (!valeur || typeof valeur !== "object") return resultat;
  for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
    const i = v as Partial<InstrumentSoundfont> | null;
    const programme = Number(i?.programme), banque = Number(i?.banque ?? 0);
    if (Number.isInteger(programme) && programme >= 0 && programme <= 127 && Number.isInteger(banque) && banque >= 0) {
      const soundfont = typeof i?.soundfont === "string" && NOM_SOUNDFONT.test(i.soundfont) ? i.soundfont : undefined;
      resultat[cle] = { programme, banque, ...(soundfont ? { soundfont } : {}) };
    }
  }
  return resultat;
}

function limiteurs(valeur: unknown): Pick<AffectationCompositions, "limiteurs"> {
  if (!valeur || typeof valeur !== "object") return {};
  const resultat: Record<string, ReglageLimiteur> = {};
  const borne = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    return v !== undefined && v !== null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
  };
  for (const [cle, l] of Object.entries(valeur as Record<string, unknown>)) {
    if (!/^\d+$/.test(cle) || !l || typeof l !== "object") continue;
    const r = l as { plafond?: unknown; relache?: unknown };
    const plafond = borne(r.plafond, -20, 0);
    const relache = borne(r.relache, 0.01, 2);
    if (plafond !== undefined || relache !== undefined)
      resultat[cle] = { ...(plafond !== undefined ? { plafond } : {}), ...(relache !== undefined ? { relache } : {}) };
  }
  return Object.keys(resultat).length ? { limiteurs: resultat } : {};
}

function reglagesSynthes(valeur: unknown): Pick<AffectationCompositions, "reglagesSynthes"> {
  if (!valeur || typeof valeur !== "object") return {};
  const resultat: Record<string, Record<string, Record<string, number>>> = {};
  for (const [numero, parSynthe] of Object.entries(valeur as Record<string, unknown>)) {
    if (!/^\d+$/.test(numero) || !parSynthe || typeof parSynthe !== "object") continue;
    for (const [synthe, reglages] of Object.entries(parSynthe as Record<string, unknown>)) {
      if (!synthe.trim() || !reglages || typeof reglages !== "object") continue;
      for (const [parametre, v] of Object.entries(reglages as Record<string, unknown>)) {
        // Un nom de paramètre part dans un message OSC : pas d'espace.
        if (typeof v !== "number" || !Number.isFinite(v) || !parametre || /\s/.test(parametre)) continue;
        ((resultat[numero] ??= {})[synthe] ??= {})[parametre] = v;
      }
    }
  }
  return Object.keys(resultat).length ? { reglagesSynthes: resultat } : {};
}

/** Règle un paramètre du synthé d'un module (retenu avec le projet). */
export function affecterReglageSynthe(numero: number, synthe: string, parametre: string, valeur: number): void {
  const a = lireAffectationCompositions();
  const tous = (a.reglagesSynthes ??= {});
  ((tous[String(numero)] ??= {})[synthe] ??= {})[parametre] = valeur;
  ecrireAffectationCompositions(a);
}

/** Règle le limiteur d'un module (retenu avec le projet). */
export function affecterLimiteur(numero: number, changement: ReglageLimiteur): void {
  const a = lireAffectationCompositions();
  a.limiteurs = { ...a.limiteurs, [String(numero)]: { ...a.limiteurs?.[String(numero)], ...changement } };
  ecrireAffectationCompositions(a);
}

function general(valeur: unknown): Pick<AffectationCompositions, "general"> {
  if (!valeur || typeof valeur !== "object") return {};
  const g = valeur as { niveau?: unknown; muet?: unknown };
  const niveau = Number(g.niveau);
  return {
    general: {
      ...(g.niveau !== undefined && Number.isFinite(niveau) ? { niveau: Math.min(127, Math.max(0, niveau)) } : {}),
      ...(g.muet === true ? { muet: true } : {}),
    },
  };
}

/** Le master de WAM touché à la main : son niveau (Pd, 100 = 0 dB) et/ou son état coupé. */
export function reglerGeneral(changement: { niveau?: number; muet?: boolean }): void {
  const a = lireAffectationCompositions();
  a.general = { ...a.general, ...changement };
  ecrireAffectationCompositions(a);
}

/** Une affectation lue d'un projet ou du navigateur ; tout ce qui n'en a pas la forme est ignoré. */
export function lireAffectationBrute(valeur: unknown): AffectationCompositions {
  if (!valeur || typeof valeur !== "object") return affectationVide();
  const item = valeur as Record<string, unknown>;
  return {
    defaut: typeof item.defaut === "string" ? item.defaut.trim() : "",
    sections: noms(item.sections),
    modules: noms(item.modules),
    instruments: instruments(item.instruments),
    synthes: noms(item.synthes),
    ...general(item.general),
    ...limiteurs(item.limiteurs),
    ...reglagesSynthes(item.reglagesSynthes),
  };
}

export function lireAffectationCompositions(): AffectationCompositions {
  try {
    const brut = lireStockage()?.getItem(CLE_STOCKAGE);
    return brut ? lireAffectationBrute(JSON.parse(brut)) : affectationVide();
  } catch {
    return affectationVide();
  }
}

export function ecrireAffectationCompositions(affectation: AffectationCompositions): void {
  try {
    lireStockage()?.setItem(CLE_STOCKAGE, JSON.stringify(lireAffectationBrute(affectation)));
  } catch {
    /* stockage indisponible : l'affectation vit jusqu'au rechargement */
  }
  window.dispatchEvent(new CustomEvent(EVENEMENT_COMPOSITIONS));
}

/** Donne (ou retire, avec "") la composition d'un module, d'une section ou celle par défaut. */
export function affecterComposition(
  cible: { type: "module"; numero: number } | { type: "section"; id: string; nom: string } | { type: "defaut" },
  composition: string,
): void {
  const a = lireAffectationCompositions();
  const nom = composition.trim();
  if (cible.type === "defaut") a.defaut = nom;
  else {
    const table = cible.type === "module" ? a.modules : a.sections;
    const cle = cible.type === "module" ? String(cible.numero) : cible.id;
    if (nom) table[cle] = nom;
    else delete table[cle];
    // L'ancienne clé par nom (projet d'avant les identifiants) ne doit plus l'emporter.
    if (cible.type === "section" && cible.nom !== cible.id) delete table[cible.nom];
  }
  ecrireAffectationCompositions(a);
}

/** Donne (ou retire, avec null) l'instrument soundfont d'un module. */
export function affecterInstrument(numero: number, instrument: InstrumentSoundfont | null): void {
  const a = lireAffectationCompositions();
  if (instrument) a.instruments[String(numero)] = instrument;
  else delete a.instruments[String(numero)];
  ecrireAffectationCompositions(a);
}

/** Donne (ou retire, avec "") le synthé Faust d'un module. */
export function affecterSynthe(numero: number, synthe: string): void {
  const a = lireAffectationCompositions();
  if (synthe.trim()) a.synthes[String(numero)] = synthe.trim();
  else delete a.synthes[String(numero)];
  ecrireAffectationCompositions(a);
}

/**
 * La composition d'un module et d'où elle vient : la sienne, celle de sa section, celle par
 * défaut du projet, ou celle du parc. Même règle que le serveur (Programme.fs).
 */
export function compositionDuModule(
  affectation: AffectationCompositions,
  numero: number,
  /** La section du module (son identifiant et son nom), ou null : réserve, sans section. */
  section: { id: string; nom: string } | null,
  defautParc: string,
): { nom: string; origine: "module" | "section" | "projet" | "parc" } {
  const propre = affectation.modules[String(numero)];
  if (propre) return { nom: propre, origine: "module" };
  // Par identifiant ; un projet d'avant les identifiants la retient par nom.
  const deSection = section ? affectation.sections[section.id] ?? affectation.sections[section.nom] : undefined;
  if (deSection) return { nom: deSection, origine: "section" };
  if (affectation.defaut) return { nom: affectation.defaut, origine: "projet" };
  return { nom: defautParc, origine: "parc" };
}
