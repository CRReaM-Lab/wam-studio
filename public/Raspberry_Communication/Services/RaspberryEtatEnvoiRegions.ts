/**
 * Où en est le son de chaque région d'une piste rasp (maquette « Arrangeur WAM : propositions »,
 * planche 2 ; notes/wam-arrangeur.md de CRReaM-dev-root). La couleur dit la section ; ici, la
 * forme dit l'état :
 *
 * - `a-envoyer` : aucun son lié (jamais envoyée, ou née d'un découpage) ;
 * - `sur-pi`    : le son lié est dans l'inventaire du Pi ;
 * - `modifiee`  : la région n'a plus la durée qu'elle avait à l'envoi (rognée, scindée…) :
 *                 le Pi a l'ancienne version (approximation : pas d'empreinte du contenu) ;
 * - `absente`   : le son lié n'est plus sur le Pi ;
 * - `importee`  : un son de skini (numéro sous 500), venu du Pi ;
 * - `inconnu`   : le Pi n'est pas inventorié (hors ligne, injoignable).
 *
 * L'inventaire vient du serveur (`GET <agent>/inventaire`), relu toutes les 10 s ; les sections
 * et leurs couleurs de `GET /api/maintenance` (l'implantation active, dessinée sur le plan de salle).
 */
import type { Inventaire } from "../Views/SearchRaspberryFenetreInventaire";

export type EtatEnvoi = "a-envoyer" | "sur-pi" | "modifiee" | "absente" | "importee" | "inconnu";

/** Le premier numéro de son de WAM ; en dessous, les sons de skini. */
const PREMIER_SON_WAM = 500;
/** Écart de durée au-delà duquel une région est tenue pour modifiée depuis l'envoi. */
const TOLERANCE_DUREE_MS = 60;

/** Les couleurs des sections, dans l'ordre de leurs noms (le parc n'en donne pas encore). */
const PALETTE_SECTIONS = ["#5aa9f5", "#a18cf2", "#e8a24f", "#5fc4a8", "#e586b4", "#c9c46b"];

let sonsParIp = new Map<string, Set<string> | null>();
/** Les effets appliqués à chaque son (d'après sa fiche), par Pi puis par fichier. */
let effetsParIp = new Map<string, Map<string, string[]>>();
let sectionsParIp = new Map<string, string>();
/** Les couleurs des sections, données par l'implantation active (plan de salle du serveur). */
let couleursSections = new Map<string, string>();

export function noterInventaire(inventaire: Inventaire): void {
  const suivant = new Map<string, Set<string> | null>();
  const effets = new Map<string, Map<string, string[]>>();
  for (const pi of inventaire.pis) {
    if (pi.erreur) {
      suivant.set(pi.ip, null);
      continue;
    }
    const fichiers = new Set<string>();
    const parFichier = new Map<string, string[]>();
    for (const c of pi.compositions)
      for (const s of c.sons) {
        fichiers.add(s.fichier);
        const noms = (s.fiche?.effets ?? []).map((e) => e.nom);
        if (noms.length) parFichier.set(s.fichier, noms);
      }
    suivant.set(pi.ip, fichiers);
    effets.set(pi.ip, parFichier);
  }
  sonsParIp = suivant;
  effetsParIp = effets;
}

/** Les effets appliqués au son lié à une région (sa fiche sur le Pi) ; vide : son sec ou inconnu. */
export function effetsDuSon(ip: string | undefined, region: { sonNumber: number | null; nomFichier: string }): string[] {
  if (!ip) return [];
  const fichier = region.sonNumber !== null ? `son${region.sonNumber}.wav` : region.nomFichier;
  return effetsParIp.get(ip)?.get(fichier) ?? [];
}

export function noterSections(
  modules: { ip: string; section: string }[],
  sections: { nom: string; couleur: string }[] = []
): void {
  sectionsParIp = new Map(modules.filter((m) => m.section).map((m) => [m.ip, m.section]));
  couleursSections = new Map(sections.filter((s) => s.couleur).map((s) => [s.nom, s.couleur]));
}

/** La section d'un Pi (parc, via la maintenance) ; null : réserve ou inconnue. */
export function sectionDe(ip: string): string | null {
  return sectionsParIp.get(ip) ?? null;
}

/** La couleur de la section d'un Pi ; aucune pour un Pi sans section (réserve). */
export function couleurSection(ip: string): string | null {
  const section = sectionsParIp.get(ip);
  if (!section) return null;
  const choisie = couleursSections.get(section);
  if (choisie) return choisie;
  const noms = [...new Set(sectionsParIp.values())].sort();
  return PALETTE_SECTIONS[noms.indexOf(section) % PALETTE_SECTIONS.length];
}

export function etatEnvoi(
  ip: string | undefined,
  region: { sonNumber: number | null; nomFichier: string; durationMs: number; dureeEnvoyeeMs?: number }
): EtatEnvoi {
  if (region.sonNumber === null && !region.nomFichier) return "a-envoyer";
  const sons = ip ? sonsParIp.get(ip) : undefined;
  if (!sons) return "inconnu";
  const fichier = region.sonNumber !== null ? `son${region.sonNumber}.wav` : region.nomFichier;
  if (!sons.has(fichier)) return "absente";
  if (region.sonNumber !== null && region.sonNumber < PREMIER_SON_WAM) return "importee";
  if (region.dureeEnvoyeeMs !== undefined && Math.abs(region.dureeEnvoyeeMs - region.durationMs) > TOLERANCE_DUREE_MS) {
    return "modifiee";
  }
  return "sur-pi";
}

/** Relit l'inventaire et les sections toutes les 10 s ; `apres` est appelé à chaque relecture. */
export function suivreEtatsEnvoi(params: {
  lireInventaire: () => Promise<{ ok: true; inventaire: Inventaire } | { ok: false; error: string }>;
  apres: () => void;
}): void {
  const relire = async () => {
    const r = await params.lireInventaire();
    if (r.ok) noterInventaire(r.inventaire);
    try {
      const reponse = await fetch("/api/maintenance");
      if (reponse.ok) {
        const j = await reponse.json();
        noterSections(j.modules ?? [], j.sections ?? []);
      }
    } catch {
      /* pas de serveur : pas de sections */
    }
    params.apres();
  };
  void relire();
  window.setInterval(() => void relire(), 10000);
}
