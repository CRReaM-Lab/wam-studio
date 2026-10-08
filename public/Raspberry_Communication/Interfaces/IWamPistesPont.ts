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
  /** L'état complet de ses paramètres (getState). */
  etat: unknown;
};

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

  lireNomPiste(trackId: number): string | undefined;

  exporterPisteVersWave(trackId: number): Promise<Blob | null>;

  compterRegionsAudioPiste(trackId: number): number;

  exporterRegionsAudioPiste(trackId: number): Blob[];

  /** Une région audio en WAV (null si elle n'existe pas ou n'est pas audio). */
  exporterRegionAudio(trackId: number, regionId: number): Blob | null;

  /** La même, passée par les effets (FX) de sa piste. */
  exporterRegionAvecEffets(trackId: number, regionId: number): Promise<Blob | null>;

  /** Les effets (FX) d'une piste, identifiés exactement, avec l'état de leurs paramètres. */
  decrireEffetsPiste(trackId: number): Promise<EffetDecrit[]>;

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
