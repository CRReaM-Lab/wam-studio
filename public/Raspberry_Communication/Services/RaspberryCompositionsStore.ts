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
  /** Par nom de section de l'implantation active. */
  sections: Record<string, string>;
  /** Par numéro de module. */
  modules: Record<string, string>;
};

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
  return { defaut: "", sections: {}, modules: {} };
}

/** Une affectation lue d'un projet ou du navigateur ; tout ce qui n'en a pas la forme est ignoré. */
export function lireAffectationBrute(valeur: unknown): AffectationCompositions {
  if (!valeur || typeof valeur !== "object") return affectationVide();
  const item = valeur as Record<string, unknown>;
  return {
    defaut: typeof item.defaut === "string" ? item.defaut.trim() : "",
    sections: noms(item.sections),
    modules: noms(item.modules),
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
  cible: { type: "module"; numero: number } | { type: "section"; nom: string } | { type: "defaut" },
  composition: string,
): void {
  const a = lireAffectationCompositions();
  const nom = composition.trim();
  if (cible.type === "defaut") a.defaut = nom;
  else {
    const table = cible.type === "module" ? a.modules : a.sections;
    const cle = cible.type === "module" ? String(cible.numero) : cible.nom;
    if (nom) table[cle] = nom;
    else delete table[cle];
  }
  ecrireAffectationCompositions(a);
}

/**
 * La composition d'un module et d'où elle vient : la sienne, celle de sa section, celle par
 * défaut du projet, ou celle du parc. Même règle que le serveur (Programme.fs).
 */
export function compositionDuModule(
  affectation: AffectationCompositions,
  numero: number,
  section: string,
  defautParc: string,
): { nom: string; origine: "module" | "section" | "projet" | "parc" } {
  const propre = affectation.modules[String(numero)];
  if (propre) return { nom: propre, origine: "module" };
  const deSection = section ? affectation.sections[section] : undefined;
  if (deSection) return { nom: deSection, origine: "section" };
  if (affectation.defaut) return { nom: affectation.defaut, origine: "projet" };
  return { nom: defautParc, origine: "parc" };
}
