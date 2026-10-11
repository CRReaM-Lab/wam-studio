/**
 * Une seule lecture : Play dans WAM joue aussi la pièce sur les Pi son, par le serveur.
 *
 * Au passage à Play, le programme (les régions des pistes « rasp N » : /play au début, /stop -1
 * à la fin ; les marqueurs OSC ; les cues) part au serveur avec la position de lecture, et le
 * serveur le déroule avec son horloge. À l'arrêt, le serveur s'arrête : il coupe les sons
 * (/stop -1), sauf pour une pause sur un cue, où les sons en cours finissent. Reprendre après
 * un cue relance depuis le cue ; le serveur ne recharge pas la composition.
 */
import type { IWamPistesPont } from "../Interfaces/IWamPistesPont";
import { lireCueEnAttente } from "./RaspberryMarqueursCueEtat";
import { parserAdresseOscPersonnalisee } from "./RaspberryMarqueursSequenceur";
import { lireMarqueursSequenceur } from "./RaspberryMarqueursStore";
import type { EvenementSequenceurOsc } from "./RaspberrySequenceurOscService";
import { lireAffectationCompositions } from "./RaspberryCompositionsStore";
import { messagesGeneral, niveauxParModule } from "./RaspberrySynchroNiveaux";
import { raspberryTrackBindingStore } from "./RaspberryTrackBindingStore";

/**
 * Les niveaux des faders de piste, au départ de la lecture : /level à chaque module dont le fader
 * a été touché (une composition rechargée repart à 100 ; le serveur les envoie après son chargement).
 */
export function evenementsNiveaux(departMs: number): EvenementProgramme[] {
  return [
    // Le master : à tous les Pi en ligne (ip vide).
    ...messagesGeneral(lireAffectationCompositions().general).map((m) => ({ tMs: departMs, ip: "", ...m })),
    ...[...niveauxParModule(raspberryTrackBindingStore.tous())].map(([ip, niveau]) => ({
      tMs: departMs,
      ip,
      adresse: "/level",
      valeur: String(niveau),
    })),
  ];
}

/**
 * Les instruments soundfont du projet, au départ de la lecture : /soundfont (le fichier, s'il
 * vient de la bibliothèque), /bank puis /pgm à chaque module qui en a un (le serveur les envoie
 * après /composition et son délai de chargement ; le module réapplique banque et programme après
 * avoir ouvert le fichier).
 */
export function evenementsInstruments(departMs: number, ipDuModule: (numero: number) => string | undefined): EvenementProgramme[] {
  const evenements: EvenementProgramme[] = [];
  for (const [numero, i] of Object.entries(lireAffectationCompositions().instruments)) {
    const ip = ipDuModule(Number(numero));
    if (!ip) continue;
    if (i.soundfont) evenements.push({ tMs: departMs, ip, adresse: "/soundfont", valeur: i.soundfont });
    if (i.banque !== 0) evenements.push({ tMs: departMs, ip, adresse: "/bank", valeur: String(i.banque) });
    evenements.push({ tMs: departMs, ip, adresse: "/pgm", valeur: String(i.programme) });
  }
  // Le synthé des modules qui jouent faust (sans effet sur une autre composition), puis ses
  // réglages : /instrument reconstruit les voix avec les valeurs de la fiche.
  const affectation = lireAffectationCompositions();
  for (const [numero, synthe] of Object.entries(affectation.synthes)) {
    const ip = ipDuModule(Number(numero));
    if (!ip) continue;
    evenements.push({ tMs: departMs, ip, adresse: "/instrument", valeur: synthe });
    for (const [parametre, v] of Object.entries(affectation.reglagesSynthes?.[numero]?.[synthe] ?? {}))
      evenements.push({ tMs: departMs, ip, adresse: "/synth", valeur: `tous ${parametre} ${v}` });
  }
  return evenements;
}


const INTERVALLE_SURVEILLANCE_MS = 30;

export type EvenementProgramme = {
  tMs: number;
  /** Vide : tous les Pi son en ligne. */
  ip: string;
  adresse: string;
  valeur: string;
  cue?: boolean;
  libelle?: string;
};

export function construireProgrammeServeur(regions: EvenementSequenceurOsc[]): EvenementProgramme[] {
  const evenements: EvenementProgramme[] = [];
  for (const region of regions) {
    if (region.sonNumber === null || !region.ip) continue;
    evenements.push({
      tMs: Math.round(region.startMs),
      ip: region.ip,
      adresse: "/play",
      valeur: `${region.sonNumber} ${region.niveau}`,
    });
    if (region.endMs > region.startMs) {
      evenements.push({ tMs: Math.round(region.endMs), ip: region.ip, adresse: "/stop", valeur: "-1" });
    }
  }
  for (const marqueur of lireMarqueursSequenceur()) {
    const tMs = Math.round(marqueur.tempsMs);
    // Un repère ne sert qu'à naviguer dans WAM : rien à envoyer aux Pi.
    if (marqueur.type === "repere") continue;
    if (marqueur.type === "cue") {
      evenements.push({ tMs, ip: "", adresse: "", valeur: "", cue: true, libelle: marqueur.libelle });
      continue;
    }
    const osc = parserAdresseOscPersonnalisee(marqueur.oscAdresse, marqueur.oscValeur);
    if (osc) evenements.push({ tMs, ip: "", adresse: osc.message, valeur: osc.value });
  }
  return evenements;
}

/** Surveille le transport de WAM et pilote la lecture du serveur. */
export function demarrerLectureServeur(params: {
  pont: IWamPistesPont;
  envoyer: (message: Record<string, unknown> & { type: string }) => boolean;
  /** Les régions des pistes « rasp N », avec les IP et niveaux du moment. */
  regions: () => EvenementSequenceurOsc[];
  /** L'adresse d'un module par son numéro (pour ses réglages d'instrument). */
  ipDuModule: (numero: number) => string | undefined;
}): void {
  let enLecture = params.pont.lectureEstActive();
  /* La position de la tête À L'ARRÊT : c'est d'elle que part Play. Lue au moment où l'on
     s'aperçoit du départ, la tête a déjà avancé (jusqu'à 30 ms) et le serveur sauterait une
     région qui commence pile à la position de départ (mesuré : « lecture depuis 11 ms »,
     le /play à 0 ms perdu). */
  let positionArret = params.pont.lirePlayheadMs();
  window.setInterval(() => {
    const maintenant = params.pont.lectureEstActive();
    if (!maintenant) positionArret = params.pont.lirePlayheadMs();
    if (maintenant === enLecture) return;
    enLecture = maintenant;
    if (maintenant) {
      params.envoyer({
        type: "programmeLancer",
        depuisMs: Math.round(positionArret),
        // Le serveur la traduit en /composition N pour chaque Pi (Programme.fs).
        affectation: lireAffectationCompositions(),
        evenements: [
          ...evenementsInstruments(Math.round(positionArret), params.ipDuModule),
          ...evenementsNiveaux(Math.round(positionArret)),
          ...construireProgrammeServeur(params.regions()),
        ],
      });
    } else {
      params.envoyer({ type: "programmeArreter", couper: lireCueEnAttente() === null });
    }
  }, INTERVALLE_SURVEILLANCE_MS);
}
