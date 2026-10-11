/**
 * Un effet de la chaîne FX d'une piste, tel qu'on le note dans la fiche d'un son envoyé avec
 * l'effet appliqué : de quoi retrouver exactement la pédale et ses réglages.
 */
export type EffetDecrit = {
  /** Le nom à afficher (« Greyhole »). */
  nom: string;
  /** L'identifiant WAM de la pédale (celui du pedalboard, ou du descripteur du plugin). */
  wamId: string;
  /** La bibliothèque de pédales d'où elle vient (pedalboard), ou l'adresse du plugin. */
  source?: string;
  fabricant?: string;
  version?: string;
  /** Sa place dans la chaîne (0 : la première). */
  position: number;
  /** La pédale Pd correspondante sur les modules (`greyhole` pour `[greyhole~]`) ; null : aucune. */
  objetPd: string | null;
  /** L'état complet de ses paramètres (getState). */
  etat: unknown;
};

/** Un paramètre réglable d'une pédale du pedalboard d'une piste. */
export type ParametreEffet = {
  /** L'identifiant exposé par le pedalboard (`<pédale><|:pdb2:|><paramètre>`). */
  id: string;
  /** Son libellé dans la pédale (« Wet »). */
  nom: string;
  min: number;
  max: number;
  valeur: number;
  /** Un entier, un interrupteur ou un choix : réglé par pas de 1. */
  discret: boolean;
  /** Les libellés d'un paramètre à choix, dans l'ordre des valeurs. */
  choix: string[];
};

/** L'interface d'un plugin WAM ouverte à part (un instrument des modules, réglé par son GUI). */
export type InterfaceWamOuverte = {
  gui: Element;
  /** Les identifiants de ses paramètres (adresse Faust, endpointID Cmajor). */
  parametres: string[];
  /** Donne une valeur à un paramètre (sans la rapporter comme un changement). */
  regler(id: string, valeur: number): void;
  fermer(): void;
};

/** Les réglages d'une pédale, à sa place dans la chaîne. */
export type ReglagesEffet = { position: number; nom: string; parametres: ParametreEffet[] };

import type { RaspberryTrackBinding } from "../Models/RaspberryTrackBinding";
import type { EntreeRegionSonPersiste } from "../Services/RaspberryRegionSonStore";

export type PisteRaspberryCreee = {
  trackId: number;
  nomPiste: string;
  binding: RaspberryTrackBinding;
};

/**
 * Pont minimal entre Raspberry_Communication et l'application WAM Studio.
 * Implemente cote WAM (HostController) pour acceder aux pistes sans dupliquer la logique.
 */
export interface IWamPistesPont {
  creerPistePourRaspberry(
    raspberryIp: string,
    raspberryId: number,
    sonNumber: number
  ): Promise<PisteRaspberryCreee>;

  focusPiste(trackId: number): void;

  /** La piste choisie (celle dont la fenêtre des effets montre la chaîne), ou null. */
  lirePisteChoisie(): number | null;

  lireNomPiste(trackId: number): string | undefined;
  /** L'identité du projet ouvert (et son nom une fois sauvé), écrite dans la fiche des sons. */
  lireProjet(): { id: string; nom?: string };

  exporterPisteVersWave(trackId: number): Promise<Blob | null>;

  compterRegionsAudioPiste(trackId: number): number;

  exporterRegionsAudioPiste(trackId: number): Blob[];

  /** Une région audio en WAV (null si elle n'existe pas ou n'est pas audio). */
  exporterRegionAudio(trackId: number, regionId: number): Blob | null;

  /** La même, passée par les effets (FX) de sa piste. */
  exporterRegionAvecEffets(trackId: number, regionId: number): Promise<Blob | null>;

  /** Les effets (FX) d'une piste, identifiés exactement, avec l'état de leurs paramètres. */
  decrireEffetsPiste(trackId: number): Promise<EffetDecrit[]>;

  /** Les réglages de chaque pédale du pedalboard de la piste, dans l'ordre de la chaîne ; [] sans pedalboard. */
  lireReglagesEffets(trackId: number): Promise<ReglagesEffet[]>;

  /**
   * Ouvre un plugin WAM (`/bank/plugins/JUNO6v2/index.js`) pour son interface seulement : instancié
   * dans le contexte de WAM, pas branché à la sortie. `surChangement` reçoit chaque réglage fait
   * dans l'interface. null : le plugin ne s'ouvre pas.
   */
  ouvrirInterfaceWam(url: string, surChangement: (id: string, valeur: number) => void): Promise<InterfaceWamOuverte | null>;

  /** Règle un paramètre d'une pédale de la piste (identifiant de `lireReglagesEffets`). */
  reglerEffet(trackId: number, id: string, valeur: number): Promise<void>;

  /** Clic droit sur une région de l'arrangeur (coordonnées de la fenêtre). Rend le désabonnement. */
  abonnerClicDroitRegion(
    surClic: (trackId: number, regionId: number, x: number, y: number) => void
  ): () => void;

  pisteADuContenu(trackId: number): boolean;

  pisteExiste(trackId: number): boolean;

  trouverPisteIdParNumeroRaspberry(raspberryId: number): number | undefined;

  listerRegionsPistesRaspberry(): RegionPisteRaspberry[];

  listerRegionsAudioPiste(trackId: number): RegionAudioPiste[];

  listerPositionsLibellesRegions(): PositionLibelleRegion[];
  /** Donne sa couleur à une piste (la couleur de la section de son Pi). */
  colorerPiste(trackId: number, couleur: string): void;

  lirePlayheadMs(): number;

  lirePositionMarqueurPiste(tempsMs: number): PositionMarqueurPiste;

  lireTempsMsDepuisXCanvas(xCanvas: number): number;

  /**
   * Cale une abscisse du canvas des pistes sur la grille de l'éditeur, comme les régions et la
   * boucle : seulement si l'aimant de WAM est actif et que `sansAimant` (touche Maj) est faux.
   */
  alignerXCanvasSurGrille(xCanvas: number, sansAimant: boolean): number;

  lectureEstActive(): boolean;

  pauserLecture(): void;

  reprendreLecture(): void;

  abonnerPlayhead(onPlayhead: (playheadMs: number) => void): () => void;

  reprendreContexteAudioSiBesoin(): Promise<void>;

  /** Recable host + pistes vers la destination audio (silence Chrome apres YouTube). */
  rebrancherSortieAudio(): void;

  reglerVolumePistes(volume01: number, sonNumber?: number): void;

  /**
   * Les gestes sur le master (son fader, son M et celui de la barre du haut) : `surVolume` reçoit
   * le volume (0 à 1), `surMuet` l'état coupé. Les changements venus d'ailleurs (marqueurs,
   * chargement d'un projet) ne passent pas par ici.
   */
  abonnerGestesMaster(surVolume: (volume01: number) => void, surMuet: (muet: boolean) => void): void;

  reglerMutePistes(mute: boolean, sonNumber?: number): void;

  lireVolumePistes(sonNumber?: number): number;

  lierPisteExistante(
    trackId: number,
    raspberryIp: string,
    raspberryId: number,
    sonNumber: number
  ): PisteRaspberryCreee;

  restaurerNomsPistesLiees(): void;

  lireSignaturePistes(): string;

  exporterSessionLocale(): Promise<SessionProjetLocale | null>;

  importerSessionLocale(session: SessionProjetLocale): Promise<void>;

  /** Ajoute un fichier audio en fin de piste (ou a la position indiquee). */
  ajouterBlobAudioSurPiste(
    trackId: number,
    blob: Blob,
    positionDebutMs?: number
  ): Promise<RegionAjouteePiste>;

  finirChargementEditeur(): void;
}

export type RegionAjouteePiste = {
  regionId: number;
  debutMs: number;
  finMs: number;
};

export type RegionAudioPiste = {
  regionId: number;
  startMs: number;
  durationMs: number;
  endMs: number;
};

export type RegionPisteRaspberry = {
  trackId: number;
  regionId: number;
  raspberryId: number;
  nomPiste: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  sonNumber: number | null;
  nomFichier: string;
  nomAffiche: string;
  /** La durée de la région quand son son a été envoyé (lien région → son) ; absent : jamais envoyé. */
  dureeEnvoyeeMs?: number;
};

export type PositionLibelleRegion = {
  trackId: number;
  regionId: number;
  /** Le nom du son ; « son ? » pour une région jamais envoyée. */
  nomAffiche: string;
  x: number;
  y: number;
  /** La place de la région à l'écran (px), pour l'encadrer selon son état d'envoi. */
  largeur: number;
  hauteur: number;
  visible: boolean;
  raspberryId: number;
  sonNumber: number | null;
  nomFichier: string;
  durationMs: number;
  dureeEnvoyeeMs?: number;
};

export type PositionMarqueurPiste = {
  x: number;
  y: number;
  hauteur: number;
  visible: boolean;
};

export type SessionProjetLocale = {
  project: object;
  contents: { content_name: string; blob: Blob }[];
  regionsSons?: Record<string, EntreeRegionSonPersiste>;
};
