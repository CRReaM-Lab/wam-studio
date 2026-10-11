/**
 * La bibliothèque des instruments échantillonnés du serveur (`/api/bibliotheque`,
 * modulePre-serveur, Bibliotheque.fs) : les SoundFonts que jouent les modules dans la composition
 * soundfont. Une SoundFont perso (`.sf2`, `.sf3`) y entre telle quelle ; un kit de batterie y entre
 * par ses sons, et le serveur fabrique sa SoundFont.
 *
 * Le serveur n'a pas Internet : ce qui vient d'ailleurs (freesound, un kit en ligne) passe par le
 * navigateur, qui le dépose ici. Les modules reçoivent ensuite la SoundFont du serveur
 * (`envoyerAuxModules`), qui vérifie son empreinte sur chaque Pi.
 */

export type InstrumentBibliotheque = {
  nom: string;
  /** `soundfont` (importée telle quelle) ou `kit` (fabriquée par le serveur). */
  genre: "soundfont" | "kit";
  empreinte: string;
  extension: "sf2" | "sf3";
  taille: number;
  date: string;
  avertissements: string[];
};

export type ListeBibliotheque = {
  instruments: InstrumentBibliotheque[];
  /** Par instrument : les Pi qui l'ont à jour (dernier inventaire du serveur). */
  surLesPi: Record<string, string[]>;
};

const PREFIXE = "/api/bibliotheque";

/** Le nom d'un instrument devient un nom de fichier sur les modules (`sf/<nom>.sf2`). */
const NOM_VALIDE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function nomValide(nom: string): boolean {
  return NOM_VALIDE.test(nom);
}

/**
 * Un nom d'instrument tiré d'un nom de fichier : sans extension, accents retirés, le reste des
 * caractères non permis remplacé par `_` (`Piano à queue.sf2` → `Piano_a_queue`).
 */
export function nomDepuisFichier(fichier: string): string {
  const base = fichier.replace(/\.[^.]*$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nom = base.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[_-]+/, "").replace(/_+$/, "").slice(0, 64);
  return nom || "instrument";
}

async function reponse<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => ({ ok: false, error: `réponse illisible (${r.status})` }))) as { ok?: boolean; error?: string };
  if (!r.ok || j.ok === false) throw new Error(j.error || `${r.status}`);
  return j as T;
}

export async function lireBibliotheque(): Promise<ListeBibliotheque> {
  const j = await reponse<{ instruments?: InstrumentBibliotheque[]; surLesPi?: Record<string, string[]> }>(await fetch(PREFIXE));
  return { instruments: j.instruments ?? [], surLesPi: j.surLesPi ?? {} };
}

/** L'adresse d'un fichier de la bibliothèque (rangé par empreinte : il ne change jamais). */
export function urlFichier(empreinte: string): string {
  return `${PREFIXE}/fichiers/${empreinte}`;
}

/**
 * Dépose un fichier (WAV, SF2, SF3) ; rend son empreinte et ce que le serveur y a reconnu.
 * `origine` : d'où il vient (freesound, un kit en ligne), gardé pour les crédits.
 */
export async function deposerFichier(fichier: File, origine?: Record<string, unknown>): Promise<{ empreinte: string; genre: string; description: string }> {
  const formulaire = new FormData();
  formulaire.append("fichier", fichier, fichier.name);
  if (origine) formulaire.append("origine", JSON.stringify(origine));
  return reponse(await fetch(`${PREFIXE}/fichiers`, { method: "POST", body: formulaire }));
}

/**
 * Importe une SoundFont perso sous `nom` : le fichier, puis l'instrument. `remplacer` : écrase un
 * instrument du même nom (sinon le serveur refuse).
 */
export async function importerSoundfont(fichier: File, nom: string, remplacer = false): Promise<InstrumentBibliotheque> {
  if (!nomValide(nom)) throw new Error(`nom « ${nom} » : lettres, chiffres, _ et - seulement`);
  const depot = await deposerFichier(fichier);
  if (depot.genre !== "sf2" && depot.genre !== "sf3") throw new Error(`${fichier.name} n'est pas une SoundFont (${depot.description})`);
  const j = await reponse<{ instrument: InstrumentBibliotheque }>(
    await fetch(`${PREFIXE}/soundfonts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, empreinte: depot.empreinte, remplacer }),
    }),
  );
  return j.instrument;
}

export type ResultatEnvoi = { ip: string; ok: boolean; erreur: string };

/** Envoie l'instrument aux modules (par leur IP) ; le serveur vérifie l'empreinte sur chacun. */
export async function envoyerAuxModules(nom: string, ips: string[]): Promise<ResultatEnvoi[]> {
  const r = await fetch(`${PREFIXE}/envoyer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nom, ips }),
  });
  // Un envoi partiel répond ok: false avec le détail par Pi : c'est ce détail qui compte.
  const j = (await r.json().catch(() => ({}))) as { resultats?: ResultatEnvoi[]; error?: string };
  if (!j.resultats) throw new Error(j.error || `${r.status}`);
  return j.resultats;
}

/** Une case d'un kit : un son de la bibliothèque sur une note (le drumsampler de WAM). */
export type CaseKit = {
  nom: string;
  empreinte: string;
  note: number;
  /** 0 à 1,5. */
  gain: number;
  /** -1 (gauche) à 1 (droite). */
  pan: number;
  /** -1 (aigus coupés) à 1 (graves coupés). */
  timbre: number;
  /** 0 : aucun ; une case du même groupe coupe celles qui sonnent (charleston). */
  groupe: number;
};

/** Demande au serveur la SoundFont du kit ; rend l'instrument (avec ses avertissements). */
export async function fabriquerKit(nom: string, cases: CaseKit[], remplacer = false): Promise<InstrumentBibliotheque> {
  if (!nomValide(nom)) throw new Error(`nom « ${nom} » : lettres, chiffres, _ et - seulement`);
  const r = await fetch(`${PREFIXE}/kits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nom, cases, remplacer }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; problemes?: string[]; instrument?: InstrumentBibliotheque };
  if (!r.ok || !j.instrument) throw new Error([j.error, ...(j.problemes ?? [])].filter(Boolean).join(" ; ") || `${r.status}`);
  return j.instrument;
}
