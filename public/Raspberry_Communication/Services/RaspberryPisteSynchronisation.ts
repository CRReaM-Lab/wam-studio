/**
 * Declencheurs de synchronisation pistes ↔ Raspberry (apres chargement projet, etc.).
 */
type CallbackSynchronisation = () => void;

let callbackSynchronisation: CallbackSynchronisation | null = null;

export function enregistrerSynchronisationPistesRaspberry(
  callback: CallbackSynchronisation
): void {
  callbackSynchronisation = callback;
}

export function declencherSynchronisationPistesRaspberry(): void {
  callbackSynchronisation?.();
}

/** Émis par « Nouveau projet » : une piste par module en ligne, et aucune pour les autres. */
export const EVENEMENT_NOUVEAU_PROJET = "wam-nouveau-projet";
