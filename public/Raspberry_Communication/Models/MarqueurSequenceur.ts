/** `repere` : un simple repère pour naviguer (touche M, comme dans REAPER) ; ni OSC ni arrêt. */
export type TypeMarqueurSequenceur = "osc" | "cue" | "repere";

export type MarqueurSequenceur = {
  id: string;
  type: TypeMarqueurSequenceur;
  tempsMs: number;
  libelle: string;
  oscAdresse: string;
  oscValeur: string;
};
