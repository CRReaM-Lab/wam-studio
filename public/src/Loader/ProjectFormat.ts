/**
 * La version du format des projets, et les migrations d'une version à la suivante.
 * Documentation du format : docs/format-projet.md (à tenir à jour avec ce fichier).
 *
 * Mineure : un ajout qu'un WAM plus ancien ignore (mais perdrait en resauvant).
 * Majeure : un changement qu'un WAM plus ancien lirait de travers.
 * Un projet plus récent que ce WAM est refusé ; un projet plus ancien est migré pas à pas, et
 * chaque migration est consignée dans `meta.migrations`, sauvée avec le projet.
 */
export const CURRENT_PROJECT_VERSION: [number, number] = [1, 3];

/** Une migration appliquée à un projet, consignée dans ses métadonnées. */
export type MigrationConsignee = {
  de: string;
  vers: string;
  le: string;
  note: string;
};

export type MetaProjet = {
  /** Création : date, et version du format à ce moment. */
  creeLe?: string;
  formatInitial?: string;
  /** Dernière sauvegarde. */
  sauveLe?: string;
  migrations: MigrationConsignee[];
};

type ProjetBrut = Record<string, any>;

type Migration = {
  vers: [number, number];
  /** Applique la migration au projet chargé ; rend ce qui a été fait (consigné). */
  appliquer: (projet: ProjetBrut) => string;
};

const MIGRATIONS: Migration[] = [
  {
    vers: [1, 1],
    appliquer: (p) => {
      const liees = (p.tracks ?? []).filter((t: ProjetBrut) => t.raspberry).length;
      return `pistes liées aux Raspberry (tracks[].raspberry) : ${liees} piste(s) déjà liée(s), rien à convertir`;
    },
  },
  {
    vers: [1, 2],
    appliquer: (p) =>
      Array.isArray(p.marqueurs)
        ? `marqueurs dans le projet : ${p.marqueurs.length} déjà présent(s)`
        : "marqueurs dans le projet : absents, ceux du navigateur sont repris",
  },
  {
    vers: [1, 3],
    appliquer: (p) =>
      p.regionsSons && typeof p.regionsSons === "object"
        ? `lien région → son du Pi (regionsSons) : ${Object.keys(p.regionsSons).length} déjà présent(s)`
        : "lien région → son du Pi (regionsSons) : absent, repris du navigateur",
  },
];

export const texteVersion = (v: [number, number]) => `${v[0]}.${v[1]}`;

/**
 * Vérifie et migre un projet chargé. Rend les migrations appliquées, ou l'erreur qui empêche
 * de l'ouvrir (version invalide, majeure différente, ou plus récente que ce WAM).
 */
export function migrerProjet(projet: ProjetBrut): { ok: true; migrations: MigrationConsignee[] } | { ok: false; erreur: string } {
  const v = projet.version;
  const courante = texteVersion(CURRENT_PROJECT_VERSION);
  if (!Array.isArray(v) || v.length !== 2) {
    return { ok: false, erreur: `version de projet invalide (${v})` };
  }
  if (v[0] !== CURRENT_PROJECT_VERSION[0]) {
    return { ok: false, erreur: `projet en version ${v.join(".")}, incompatible avec ce WAM (${courante})` };
  }
  if (v[1] > CURRENT_PROJECT_VERSION[1]) {
    return { ok: false, erreur: `projet en version ${v.join(".")}, plus récent que ce WAM (${courante}) : utiliser un WAM plus récent` };
  }
  const le = new Date().toISOString();
  const migrations: MigrationConsignee[] = [];
  let actuelle: [number, number] = [v[0], v[1]];
  for (const m of MIGRATIONS) {
    if (m.vers[0] !== actuelle[0] || m.vers[1] <= actuelle[1]) continue;
    migrations.push({ de: texteVersion(actuelle), vers: texteVersion(m.vers), le, note: m.appliquer(projet) });
    actuelle = m.vers;
  }
  return { ok: true, migrations };
}

/** Les métadonnées à sauver : celles du projet chargé, plus ses migrations, plus la date. */
export function metaASauver(chargee: MetaProjet | undefined, migrationsAuChargement: MigrationConsignee[]): MetaProjet {
  const maintenant = new Date().toISOString();
  const meta: MetaProjet = chargee
    ? { ...chargee, migrations: [...(chargee.migrations ?? [])] }
    : { creeLe: maintenant, formatInitial: texteVersion(CURRENT_PROJECT_VERSION), migrations: [] };
  meta.migrations.push(...migrationsAuChargement);
  meta.sauveLe = maintenant;
  return meta;
}
