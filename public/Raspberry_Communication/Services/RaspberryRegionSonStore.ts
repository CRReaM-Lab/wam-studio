const CLE = "wam-regions-sons";
const TOLERANCE_START_MS = 120;
const TOLERANCE_DUREE_MS = 250;

export type EntreeRegionSon = {
  trackId?: number;
  regionId?: number;
  raspberryId: number;
  startMs: number;
  durationMs: number;
  sonNumber: number | null;
  nomFichier: string;
  nomAffiche: string;
  indexOrdre?: number;
};

/** Metadonnees stables sauvegardees avec la session (cle = content_name region). */
export type EntreeRegionSonPersiste = Omit<EntreeRegionSon, "trackId" | "regionId">;

function lireStockage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function lireToutes(): EntreeRegionSon[] {
  const stockage = lireStockage();
  if (!stockage) {
    return [];
  }
  try {
    const brut = stockage.getItem(CLE);
    if (!brut) {
      return [];
    }
    const parse = JSON.parse(brut) as EntreeRegionSon[];
    return Array.isArray(parse) ? parse.filter(estEntreeValide).map(normaliserEntree) : [];
  } catch {
    return [];
  }
}

function normaliserEntree(entree: EntreeRegionSon): EntreeRegionSon {
  const sansExtension =
    entree.nomFichier.replace(/\.[^.]+$/, "").trim() || entree.nomFichier.trim();
  return {
    ...entree,
    nomAffiche:
      entree.nomAffiche?.trim() ||
      sansExtension ||
      (entree.sonNumber !== null ? `son${entree.sonNumber}` : "son ?"),
  };
}

function estEntreeValide(item: unknown): item is EntreeRegionSon {
  if (!item || typeof item !== "object") {
    return false;
  }
  const entree = item as EntreeRegionSon;
  return (
    Number.isFinite(entree.raspberryId) &&
    Number.isFinite(entree.startMs) &&
    Number.isFinite(entree.durationMs) &&
    (entree.sonNumber === null || Number.isFinite(entree.sonNumber)) &&
    typeof entree.nomFichier === "string"
  );
}

function ecrireToutes(entrees: EntreeRegionSon[]): void {
  const stockage = lireStockage();
  if (!stockage) {
    return;
  }
  stockage.setItem(CLE, JSON.stringify(entrees));
}

function positionsProches(a: EntreeRegionSon, startMs: number, durationMs?: number): boolean {
  if (Math.abs(a.startMs - startMs) > TOLERANCE_START_MS) {
    return false;
  }
  if (durationMs === undefined) {
    return true;
  }
  return Math.abs(a.durationMs - durationMs) <= TOLERANCE_DUREE_MS;
}

/** Deux entrées pour la même région : même identifiant si les deux en ont un, sinon même place. */
function memeRegion(a: EntreeRegionSon, b: EntreeRegionSon): boolean {
  if (
    a.trackId !== undefined &&
    a.regionId !== undefined &&
    b.trackId !== undefined &&
    b.regionId !== undefined
  ) {
    return a.trackId === b.trackId && a.regionId === b.regionId;
  }
  return a.raspberryId === b.raspberryId && positionsProches(a, b.startMs, b.durationMs);
}

export function enregistrerRegionSon(entree: EntreeRegionSon): void {
  const normalise = normaliserEntree(entree);
  const autres = lireToutes().filter((item) => !memeRegion(item, normalise));
  autres.push(normalise);
  ecrireToutes(autres);
}

export function importerRegionsSonsPersistes(
  regionsSons: Record<string, EntreeRegionSonPersiste> | undefined
): void {
  if (!regionsSons) {
    return;
  }
  for (const entree of Object.values(regionsSons)) {
    if (!estEntreeValide(entree as EntreeRegionSon)) {
      continue;
    }
    enregistrerRegionSon(entree as EntreeRegionSon);
  }
}

/** Le lien région → son d'un projet chargé remplace celui du navigateur (projet d'une autre session). */
export function remplacerRegionsSons(regionsSons: Record<string, EntreeRegionSonPersiste>): void {
  ecrireToutes([]);
  importerRegionsSonsPersistes(regionsSons);
}

export type RequeteRegionSon = {
  raspberryId: number;
  startMs: number;
  durationMs?: number;
  regionId?: number;
  trackId?: number;
};

/**
 * Le son de chaque région, en une passe sur toutes : d'abord par identifiant (trackId, regionId),
 * puis, pour les autres, par position (début, et durée si connue) sur le même Pi. Un son ne va
 * qu'à une région : une région jamais envoyée ne prend plus le nom du son d'une autre (l'ancienne
 * recherche par rang dans la piste, sans regarder le temps, donnait deux « son9 »).
 */
export function associerRegionsSons(requetes: RequeteRegionSon[]): (EntreeRegionSon | undefined)[] {
  const toutes = lireToutes();
  const prises = new Set<number>();
  const resultat: (EntreeRegionSon | undefined)[] = requetes.map(() => undefined);
  requetes.forEach((r, i) => {
    if (r.trackId === undefined || r.regionId === undefined) return;
    const j = toutes.findIndex(
      (item, k) => !prises.has(k) && item.trackId === r.trackId && item.regionId === r.regionId
    );
    if (j >= 0) {
      prises.add(j);
      resultat[i] = toutes[j];
    }
  });
  const parPosition = (r: RequeteRegionSon, avecDuree: boolean) =>
    toutes.findIndex(
      (item, k) =>
        !prises.has(k) &&
        item.raspberryId === r.raspberryId &&
        // Une entrée attachée à une autre région vivante ne se prête pas.
        (item.trackId === undefined || item.trackId === r.trackId) &&
        positionsProches(item, r.startMs, avecDuree ? r.durationMs : undefined)
    );
  requetes.forEach((r, i) => {
    if (resultat[i]) return;
    let j = r.durationMs !== undefined ? parPosition(r, true) : -1;
    if (j < 0) j = parPosition(r, false);
    if (j >= 0) {
      prises.add(j);
      resultat[i] = toutes[j];
    }
  });
  return resultat;
}

/** Le son d'une seule région (même règle qu'associerRegionsSons). */
export function trouverSonPourRegion(
  raspberryId: number,
  startMs: number,
  regionId?: number,
  trackId?: number,
  durationMs?: number
): EntreeRegionSon | undefined {
  return associerRegionsSons([{ raspberryId, startMs, regionId, trackId, durationMs }])[0];
}

export function listerSonsPourRaspberry(raspberryId: number): EntreeRegionSon[] {
  return lireToutes()
    .filter((item) => item.raspberryId === raspberryId)
    .sort((a, b) => a.startMs - b.startMs);
}

export function listerToutesEntreesRegionSon(): EntreeRegionSon[] {
  return lireToutes();
}
