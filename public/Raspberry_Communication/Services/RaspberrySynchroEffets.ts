/**
 * Les réglages des effets d'une piste suivis en direct sur son module (bouton « FX » de la piste,
 * `fxDirect` de la liaison) : la chaîne de la piste est relue 4 fois par seconde (le pedalboard
 * ne signale pas ses changements) et ce qui a changé part en `/fx`.
 *
 * Une pédale qui change dans un emplacement : tout l'emplacement repart (ses réglages suivent la
 * charge). Toutes les 10 s, et à l'activation, tout l'état repart : un module redémarré ou un
 * message perdu se rattrapent seuls (état, jamais deltas ; inserts~ ne recrée pas une pédale déjà là).
 */
import type { IWamPistesPont } from "../Interfaces/IWamPistesPont";
import type { RaspberryTrackBinding } from "../Models/RaspberryTrackBinding";
import { etatEffetsModule } from "./RaspberryEffetsModule";

const INTERVALLE_MS = 250;
const ETAT_COMPLET_MS = 10000;

export function demarrerSynchroEffets(params: {
  pont: IWamPistesPont;
  liaisons: () => RaspberryTrackBinding[];
  enLigne: (ip: string) => boolean;
  /** Envoie `/fx <valeur>` au module ; faux : serveur non connecté. */
  envoyer: (ip: string, valeur: string) => boolean;
}): void {
  /** Par Pi : ce qui a été envoyé, emplacement par emplacement, et quand tout est reparti. */
  const envoye = new Map<string, { emplacements: string[][]; complet: number }>();
  let enCours = false;

  const tour = async () => {
    if (enCours) return;
    enCours = true;
    try {
      const suivis = new Set<string>();
      for (const b of params.liaisons()) {
        // Un module, une chaîne : la première piste suivie d'un Pi l'emporte.
        if (b.liee === false || !b.fxDirect || suivis.has(b.raspberryIp) || !params.enLigne(b.raspberryIp)) continue;
        suivis.add(b.raspberryIp);
        const effets = await params.pont.decrireEffetsPiste(b.trackId).catch(() => null);
        if (!effets) continue;
        const { emplacements } = etatEffetsModule(effets);
        const avant = envoye.get(b.raspberryIp);
        const maintenant = Date.now();
        const complet = !avant || maintenant - avant.complet > ETAT_COMPLET_MS;
        const lignes: string[] = [];
        emplacements.forEach((emplacement, i) => {
          const ancien = avant?.emplacements[i];
          if (complet || !ancien || ancien[0] !== emplacement[0]) lignes.push(...emplacement);
          else lignes.push(...emplacement.filter((l) => !ancien.includes(l)));
        });
        let ok = true;
        for (const l of lignes) ok = params.envoyer(b.raspberryIp, l) && ok;
        // Rien de retenu si le serveur n'a pas pris les messages : tout repartira au tour suivant.
        if (ok) envoye.set(b.raspberryIp, { emplacements, complet: complet ? maintenant : avant!.complet });
        else envoye.delete(b.raspberryIp);
      }
      // Un Pi qui n'est plus suivi : à sa reprise, tout repartira.
      for (const ip of [...envoye.keys()]) if (!suivis.has(ip)) envoye.delete(ip);
    } finally {
      enCours = false;
    }
  };
  window.setInterval(() => void tour(), INTERVALLE_MS);
}
