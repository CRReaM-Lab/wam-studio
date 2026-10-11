/**
 * Liaison entre une piste WAM Studio et un Raspberry Pi du parc.
 */
import { SON_NUMERO_DEFAUT } from "../utils/agent-transfert/AgentTransfertHelpers";

export type RaspberryTrackBinding = {
  trackId: number;
  raspberryIp: string;
  raspberryId: number;
  sonNumber: number;
  /** false = piste deliee : nom libre, ignoree par le sequenceur OSC. */
  liee: boolean;
  /** Les réglages des effets de la piste suivis en direct sur le module (/fx). */
  fxDirect?: boolean;
  /** Le niveau du module choisi au fader de la piste (Pd, 100 = 0 dB) ; absent : jamais touché. */
  niveau?: number;
  /** La piste coupée (bouton M) : le module reçoit /level 0. */
  muet?: boolean;
};

export type RaspberryTrackBindingPersiste = {
  ip: string;
  raspberryId: number;
  sonNumber: number;
  liee?: boolean;
  fxDirect?: boolean;
  niveau?: number;
  muet?: boolean;
};

export function creerBinding(
  trackId: number,
  raspberryIp: string,
  raspberryId: number,
  sonNumber: number,
  liee = true
): RaspberryTrackBinding {
  return { trackId, raspberryIp, raspberryId, sonNumber, liee };
}

export function bindingDepuisPersiste(
  trackId: number,
  donnees: RaspberryTrackBindingPersiste
): RaspberryTrackBinding {
  return {
    ...creerBinding(trackId, donnees.ip, donnees.raspberryId, donnees.sonNumber ?? SON_NUMERO_DEFAUT, donnees.liee !== false),
    fxDirect: donnees.fxDirect === true,
    ...(typeof donnees.niveau === "number" && Number.isFinite(donnees.niveau) ? { niveau: donnees.niveau } : {}),
    ...(donnees.muet ? { muet: true } : {}),
  };
}
