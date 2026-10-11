/**
 * Freesound, depuis le navigateur : chercher des sons et en prendre l'aperçu pour la bibliothèque
 * du serveur (qui n'a pas Internet). Comme le WamSampler de WAM : la clé d'API de chacun, gardée
 * dans son navigateur, n'est envoyée qu'à freesound.org ; jamais au serveur ni dans un projet.
 *
 * Les aperçus (mp3 ~128 kb/s) ne demandent que la clé ; les fichiers originaux demanderaient une
 * connexion freesound de l'utilisateur (OAuth2), pas encore faite. Chaque son garde son origine
 * (auteur, licence) : les sons sous CC BY doivent être crédités.
 */

const API = "https://freesound.org/apiv2";
const CLE_STOCKAGE = "freesound-cle-api";

export type SonFreesound = {
  id: number;
  nom: string;
  auteur: string;
  /** L'adresse de la licence (Creative Commons). */
  licence: string;
  duree: number;
  /** La page du son sur freesound.org. */
  url: string;
  apercu: string;
};

/** Ce que la bibliothèque garde d'un son de freesound (son origine), pour les crédits. */
export type OrigineFreesound = {
  source: "freesound";
  id: number;
  nom: string;
  auteur: string;
  licence: string;
  url: string;
  /** Vrai : l'aperçu mp3 (pas le fichier original). */
  apercu: boolean;
};

export function lireCle(): string {
  try {
    return window.localStorage.getItem(CLE_STOCKAGE) ?? "";
  } catch {
    return "";
  }
}

export function ecrireCle(cle: string): void {
  try {
    if (cle.trim()) window.localStorage.setItem(CLE_STOCKAGE, cle.trim());
    else window.localStorage.removeItem(CLE_STOCKAGE);
  } catch {
    /* stockage indisponible : la clé vit jusqu'au rechargement */
  }
}

/** Le nom court d'une licence (« CC BY 4.0 », « CC0 ») d'après son adresse. */
export function nomLicence(url: string): string {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/([\d.]+)/i.exec(url);
  if (!m) return url;
  if (m[1] === "publicdomain") return m[2].toLowerCase() === "zero" ? "CC0" : `domaine public`;
  return `CC ${m[2].toUpperCase()} ${m[3]}`;
}

/** Une réponse de freesound (`/search/text/`) en sons. */
export function lireResultats(reponse: unknown): { sons: SonFreesound[]; total: number } {
  const r = reponse as { count?: number; results?: Record<string, unknown>[] };
  const sons = (r.results ?? []).flatMap((x) => {
    const apercus = x.previews as Record<string, string> | undefined;
    const apercu = apercus?.["preview-hq-mp3"] ?? apercus?.["preview-lq-mp3"];
    if (typeof x.id !== "number" || !apercu) return [];
    return [{
      id: x.id,
      nom: String(x.name ?? x.id),
      auteur: String(x.username ?? ""),
      licence: String(x.license ?? ""),
      duree: Number(x.duration ?? 0),
      url: String(x.url ?? `https://freesound.org/s/${x.id}/`),
      apercu,
    }];
  });
  return { sons, total: Number(r.count ?? sons.length) };
}

/** Cherche des sons ; `dureeMax` (s) écarte les sons longs, inutiles dans un kit. */
export async function chercher(cle: string, requete: string, page = 1, dureeMax = 10): Promise<{ sons: SonFreesound[]; total: number }> {
  if (!cle) throw new Error("clé d'API freesound manquante");
  const params = new URLSearchParams({
    query: requete,
    token: cle,
    page: String(page),
    page_size: "12",
    fields: "id,name,username,license,duration,url,previews",
    filter: `duration:[0 TO ${dureeMax}]`,
  });
  const r = await fetch(`${API}/search/text/?${params}`);
  if (r.status === 401) throw new Error("clé d'API refusée par freesound");
  if (!r.ok) throw new Error(`freesound : ${r.status}`);
  return lireResultats(await r.json());
}

/** L'aperçu d'un son, et son origine pour la bibliothèque. */
export async function telechargerApercu(son: SonFreesound): Promise<{ donnees: Blob; origine: OrigineFreesound }> {
  const r = await fetch(son.apercu);
  if (!r.ok) throw new Error(`aperçu de ${son.nom} : ${r.status}`);
  return {
    donnees: await r.blob(),
    origine: { source: "freesound", id: son.id, nom: son.nom, auteur: son.auteur, licence: son.licence, url: son.url, apercu: true },
  };
}
