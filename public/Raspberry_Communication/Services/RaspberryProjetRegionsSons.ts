/**
 * Le lien région → son du Pi (numéro, fichier) voyage avec le projet sauvé dans la banque, comme
 * les marqueurs. Le chargeur de WAM (src/Loader) l'appelle par ce relais : le pont, qui connaît
 * les régions vivantes, s'y branche à sa création.
 */
import type { EntreeRegionSonPersiste } from "./RaspberryRegionSonStore";

type ExporteurRegionsSons = (projet: unknown) => Record<string, EntreeRegionSonPersiste>;

let exporteur: ExporteurRegionsSons | null = null;

export function brancherExportRegionsSons(f: ExporteurRegionsSons): void {
  exporteur = f;
}

/** Pour chaque région audio (clé : son fichier dans le projet), son Pi et son numéro de son. */
export function exporterRegionsSonsProjet(projet: unknown): Record<string, EntreeRegionSonPersiste> {
  return exporteur ? exporteur(projet) : {};
}
