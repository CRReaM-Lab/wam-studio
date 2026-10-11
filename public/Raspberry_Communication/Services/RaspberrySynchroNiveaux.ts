/**
 * Le fader de piste relié au module : le niveau choisi au fader (et le bouton M) d'une piste liée
 * part en `/level` à son module (le niveau de sa composition : skini, soundfont, faust). Le master
 * de WAM part à tous les modules en `/volume` (le volume du module, après pédales et égaliseur)
 * et `/mute`.
 *
 * Seuls les gestes comptent (RaspberryIndicateurPisteUi les retient dans la liaison) : pendant la
 * lecture, les marqueurs (`/play`, `/attenuation`) bougent aussi le fader pour l'écoute dans WAM,
 * et ne doivent pas devenir le niveau de tout le module. Le niveau retenu repart à chaque
 * changement, au départ de chaque lecture (RaspberryLectureServeur), et toutes les 10 s hors
 * lecture : un module redémarré, ou une composition rechargée (qui repart à 100), se rattrape seul.
 *
 * Le marqueur gagne : pendant la lecture, rien n'est renvoyé de soi-même, un `/level` ou un
 * `/volume` posé sur la timeline tient jusqu'au marqueur suivant. Seul un geste sur le fader part.
 * À l'arrêt, le niveau du fader revient.
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

/** Le master de WAM en messages pour chaque module : `/volume` (son niveau), `/mute`. */
export function messagesGeneral(general: { niveau?: number; muet?: boolean } | undefined): { adresse: string; valeur: string }[] {
  const messages: { adresse: string; valeur: string }[] = [];
  if (typeof general?.niveau === "number") messages.push({ adresse: "/volume", valeur: String(general.niveau) });
  if (general?.muet !== undefined) messages.push({ adresse: "/mute", valeur: general.muet ? "1" : "0" });
  return messages;
}

export function demarrerSynchroNiveaux(params: {
  liaisons: () => RaspberryTrackBinding[];
  /** Le master de WAM touché à la main (RaspberryCompositionsStore). */
  general: () => { niveau?: number; muet?: boolean } | undefined;
  /** Les adresses des modules en ligne. */
  modulesEnLigne: () => string[];
  /** Envoie `<adresse> <valeur>` au module ; faux : serveur non connecté. */
  envoyer: (ip: string, adresse: string, valeur: string) => boolean;
  /** Vrai pendant la lecture : les marqueurs ont la main, pas de renvoi de soi-même. */
  enLecture: () => boolean;
}): void {
  /** Par module et par adresse : la valeur envoyée et quand. */
  const envoye = new Map<string, { valeur: string; quand: number }>();
  window.setInterval(() => {
    const maintenant = Date.now();
    const enLigne = new Set(params.modulesEnLigne());
    const voulus = new Map<string, string>();
    for (const [ip, niveau] of niveauxParModule(params.liaisons())) {
      if (enLigne.has(ip)) voulus.set(`${ip} /level`, String(niveau));
    }
    for (const ip of enLigne) {
      for (const m of messagesGeneral(params.general())) voulus.set(`${ip} ${m.adresse}`, m.valeur);
    }
    const enLecture = params.enLecture();
    for (const [cle, valeur] of voulus) {
      const avant = envoye.get(cle);
      if (avant && avant.valeur === valeur && (enLecture || maintenant - avant.quand < ETAT_COMPLET_MS)) continue;
      const [ip, adresse] = cle.split(" ");
      if (params.envoyer(ip, adresse, valeur)) envoye.set(cle, { valeur, quand: maintenant });
    }
    // Un module parti : à son retour, tout repartira.
    for (const cle of [...envoye.keys()]) if (!voulus.has(cle)) envoye.delete(cle);
  }, INTERVALLE_MS);
}
