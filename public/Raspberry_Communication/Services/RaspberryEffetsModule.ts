/**
 * La chaîne FX d'une piste, dite au module : les valeurs de `/fx` (inserts~ de modulePre-client),
 * un emplacement par pédale, dans l'ordre de la piste.
 *
 * C'est un ÉTAT, pas une suite d'ordres : `<n> charge <pédale>` ne recrée pas une pédale déjà là,
 * on peut donc tout renvoyer aussi souvent qu'on veut (le module ne reconstruit que ce qui change).
 */
import type { EffetDecrit } from "../Interfaces/IWamPistesPont";

export const EMPLACEMENTS_FX = 4;

export type EtatEffetsModule = {
  /** Par emplacement (1 à 4) : `n charge <pédale>` ou `n vide`, puis ses réglages `n <paramètre> <valeur>`. */
  emplacements: string[][];
  /** Les pédales sans équivalent sur le module (emplacement laissé vide). */
  sautees: string[];
  /** Les objets Pd chargés, dans l'ordre. */
  chargees: string[];
};

export function etatEffetsModule(effets: EffetDecrit[]): EtatEffetsModule {
  const emplacements: string[][] = [];
  const sautees: string[] = [];
  const chargees: string[] = [];
  for (let n = 1; n <= EMPLACEMENTS_FX; n++) {
    const e = effets[n - 1];
    if (!e) {
      emplacements.push([`${n} vide`]);
      continue;
    }
    if (!e.objetPd) {
      sautees.push(e.nom);
      emplacements.push([`${n} vide`]);
      continue;
    }
    chargees.push(e.objetPd);
    const lignes = [`${n} charge ${e.objetPd}`];
    for (const [adresse, valeur] of Object.entries((e.etat ?? {}) as Record<string, unknown>)) {
      const parametre = adresse.split("/").filter(Boolean).pop();
      const nombre = Number(valeur);
      if (parametre && Number.isFinite(nombre)) lignes.push(`${n} ${parametre} ${nombre}`);
    }
    emplacements.push(lignes);
  }
  return { emplacements, sautees, chargees };
}
