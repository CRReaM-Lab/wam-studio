/**
 * Le fader de piste relié au module : le niveau choisi au fader (et le bouton M) d'une piste liée
 * part en `/level` à son module (le niveau de sa composition : skini, soundfont, faust).
 *
 * Seuls les gestes comptent (RaspberryIndicateurPisteUi les retient dans la liaison) : pendant la
 * lecture, les marqueurs (`/play`, `/attenuation`) bougent aussi le fader pour l'écoute dans WAM,
 * et ne doivent pas devenir le niveau de tout le module. Le niveau retenu repart à chaque
 * changement, à chaque lecture (RaspberryLectureServeur), et toutes les 10 s : un module
 * redémarré, ou une composition rechargée (qui repart à 100), se rattrape seul.
 */
import type { RaspberryTrackBinding } from "../Models/RaspberryTrackBinding";

const INTERVALLE_MS = 100;
const ETAT_COMPLET_MS = 10000;

/** Le niveau à envoyer pour une liaison, ou null : fader jamais touché, le module garde le sien. */
export function niveauModule(b: RaspberryTrackBinding): number | null {
  if (b.liee === false || typeof b.niveau !== "number") return null;
  return b.muet ? 0 : b.niveau;
}

/** Une liaison par module : la première piste liée dont le fader a été touché (comme la lecture). */
export function niveauxParModule(liaisons: RaspberryTrackBinding[]): Map<string, number> {
  const niveaux = new Map<string, number>();
  for (const b of liaisons) {
    const niveau = niveauModule(b);
    if (niveau === null || !b.raspberryIp || niveaux.has(b.raspberryIp)) continue;
    niveaux.set(b.raspberryIp, niveau);
  }
  return niveaux;
}

export function demarrerSynchroNiveaux(params: {
  liaisons: () => RaspberryTrackBinding[];
  enLigne: (ip: string) => boolean;
  /** Envoie `/level <valeur>` au module ; faux : serveur non connecté. */
  envoyer: (ip: string, valeur: string) => boolean;
}): void {
  const envoye = new Map<string, { niveau: number; quand: number }>();
  window.setInterval(() => {
    const maintenant = Date.now();
    const niveaux = niveauxParModule(params.liaisons());
    for (const [ip, niveau] of niveaux) {
      if (!params.enLigne(ip)) {
        envoye.delete(ip);
        continue;
      }
      const avant = envoye.get(ip);
      if (avant && avant.niveau === niveau && maintenant - avant.quand < ETAT_COMPLET_MS) continue;
      if (params.envoyer(ip, String(niveau))) envoye.set(ip, { niveau, quand: maintenant });
    }
    for (const ip of [...envoye.keys()]) if (!niveaux.has(ip)) envoye.delete(ip);
  }, INTERVALLE_MS);
}
