import type { RaspberryTrackBinding } from "../Models/RaspberryTrackBinding";
import {
  formaterNomPisteRaspberry,
  lireNumeroRaspberryDepuisNomPiste,
} from "../utils/agent-transfert/AgentTransfertHelpers";
import { raspberryTrackBindingStore } from "./RaspberryTrackBindingStore";
import { volumePisteVersNiveauPd } from "../utils/osc/CommandesOscMarqueur";
import {
  protegerNomPisteRaspberry,
  retirerProtectionNomPiste,
} from "./RaspberryNomPisteProtection";

const ATTR_RASPBERRY_LIE = "data-raspberry-lie";
const ATTR_CASE_LIAISON = "data-raspberry-case-liaison";
const ATTR_BOUTON_FX = "data-raspberry-fx-direct";
const ATTR_SUIVI_FADER = "data-raspberry-suivi-fader";
const STYLE_BORDURE_LIE = "4px solid #1f8b4c";
const STYLE_BORDURE_DELIE = "4px solid #6b7280";

type ElementPiste = {
  element: HTMLElement;
};

type InfoRaspberry = {
  ip: string;
  enLigne: boolean;
};

let lireInfoRaspberry: ((raspberryId: number) => InfoRaspberry | null) | null = null;

export function brancherLectureRaspberryEnLigne(
  lire: (raspberryId: number) => InfoRaspberry | null
): void {
  lireInfoRaspberry = lire;
}

export function appliquerIndicateurRaspberry(
  piste: ElementPiste,
  binding: RaspberryTrackBinding
): void {
  assurerCaseLiaison(piste.element, binding);
  assurerSuiviFader(piste.element);
  appliquerEtatLiaison(piste, binding);
}

/**
 * Le fader et le bouton M de la piste, touchés à la main : retenus dans la liaison, que
 * RaspberrySynchroNiveaux envoie au module en `/level`. Un fader bougé par un marqueur pendant la
 * lecture ne passe pas par ici (pas d'évènement du navigateur) : il reste à l'écoute dans WAM.
 */
function assurerSuiviFader(element: HTMLElement): void {
  const racine = element.shadowRoot;
  const fader = racine?.getElementById("volume-slider") as HTMLInputElement | null;
  const muet = racine?.getElementById("mute-btn");
  if (!fader || !muet || fader.hasAttribute(ATTR_SUIVI_FADER)) return;
  fader.setAttribute(ATTR_SUIVI_FADER, "1");
  const retenir = (changer: (b: RaspberryTrackBinding) => void) => {
    const trackId = lireTrackIdCase(element);
    const b = trackId === null ? undefined : raspberryTrackBindingStore.trouverParTrackId(trackId);
    if (!b) return;
    changer(b);
    raspberryTrackBindingStore.enregistrer(b);
  };
  fader.addEventListener("input", () => {
    retenir((b) => { b.niveau = volumePisteVersNiveauPd(fader.valueAsNumber / 100); });
  });
  // WAM bascule le mute dans son propre écouteur : lire l'état une fois qu'il est passé.
  muet.addEventListener("click", () => {
    window.setTimeout(() => {
      retenir((b) => {
        b.muet = muet.classList.contains("_red");
        if (typeof b.niveau !== "number") b.niveau = volumePisteVersNiveauPd(fader.valueAsNumber / 100);
      });
    }, 0);
  });
}

export function rafraichirDisponibiliteCasesLiaison(): void {
  document.querySelectorAll("track-element").forEach((noeud) => {
    const element = noeud as HTMLElement;
    const trackId = lireTrackIdCase(element);
    if (trackId === null) {
      return;
    }
    const binding = raspberryTrackBindingStore.trouverParTrackId(trackId);
    if (!binding) {
      return;
    }
    appliquerEtatLiaison({ element }, binding);
  });
}

export function retirerIndicateurRaspberry(piste: ElementPiste): void {
  const element = piste.element;
  element.style.borderLeft = "";
  element.removeAttribute(ATTR_RASPBERRY_LIE);
  element.title = "";
  retirerProtectionNomPiste(piste);
  element.shadowRoot?.querySelector(`[${ATTR_CASE_LIAISON}]`)?.remove();
  element.shadowRoot?.querySelector(`[${ATTR_BOUTON_FX}]`)?.remove();
}

export function texteStatutLiaisonPiste(binding: RaspberryTrackBinding): string {
  const nom = formaterNomPisteRaspberry(binding.raspberryId);
  if (binding.liee === false) {
    return `Piste deliee : ${nom} (le sequenceur OSC l'ignore)`;
  }
  return `Piste liee : ${nom} (son ${binding.sonNumber})`;
}

function pisteEstLiee(binding: RaspberryTrackBinding): boolean {
  return binding.liee !== false;
}

function lireNomPiste(element: HTMLElement): string {
  const champ = element.shadowRoot?.getElementById("name-input") as HTMLInputElement | null;
  return champ?.value || (element as HTMLElement & { name?: string }).name || "";
}

function lireCibleNom(element: HTMLElement): { raspberryId: number; ip: string; enLigne: boolean } | null {
  const numero = lireNumeroRaspberryDepuisNomPiste(lireNomPiste(element));
  if (numero === undefined) {
    return null;
  }
  const info = lireInfoRaspberry?.(numero) ?? null;
  return {
    raspberryId: numero,
    ip: info?.ip || "",
    enLigne: info?.enLigne === true,
  };
}

function appliquerEtatLiaison(piste: ElementPiste, binding: RaspberryTrackBinding): void {
  const element = piste.element;
  const coche = element.shadowRoot?.querySelector<HTMLInputElement>(`[${ATTR_CASE_LIAISON}]`);
  if (coche && document.activeElement !== coche) {
    coche.checked = pisteEstLiee(binding);
  }

  if (pisteEstLiee(binding)) {
    element.setAttribute(ATTR_RASPBERRY_LIE, String(binding.raspberryId));
    element.style.borderLeft = STYLE_BORDURE_LIE;
    element.title = `Liee au Raspberry ${binding.raspberryIp} (son ${binding.sonNumber})`;
    reglerCase(coche, true, "Decocher pour delier la piste et modifier son nom.");
    protegerNomPisteRaspberry(piste, binding);
    return;
  }

  element.style.borderLeft = STYLE_BORDURE_DELIE;
  element.title = "Deliee : le sequenceur OSC ne joue pas cette piste. Le nom peut etre modifie.";
  retirerProtectionNomPiste(piste);
  const cible = lireCibleNom(element);
  const joignable = cible !== null && cible.enLigne;
  reglerCase(
    coche,
    joignable,
    joignable
      ? "Cocher pour lier cette piste."
      : "Raspberry hors ligne : impossible de lier cette piste."
  );
}

function reglerCase(
  coche: HTMLInputElement | null | undefined,
  joignable: boolean,
  titre: string
): void {
  if (!coche) {
    return;
  }
  coche.disabled = !joignable;
  coche.style.opacity = joignable ? "1" : "0.35";
  coche.style.cursor = joignable ? "pointer" : "not-allowed";
  coche.title = titre;
  if (!joignable) {
    coche.checked = false;
  }
}

function lireTrackIdCase(element: HTMLElement): number | null {
  const brut = element.shadowRoot
    ?.querySelector(`[${ATTR_CASE_LIAISON}]`)
    ?.getAttribute("data-track-id");
  const trackId = Number(brut);
  return Number.isFinite(trackId) ? trackId : null;
}

function assurerCaseLiaison(element: HTMLElement, binding: RaspberryTrackBinding): void {
  const racine = element.shadowRoot;
  const champNom = racine?.getElementById("name-input") as HTMLInputElement | null;
  if (!racine || !champNom?.parentElement) {
    return;
  }

  let coche = racine.querySelector<HTMLInputElement>(`[${ATTR_CASE_LIAISON}]`);
  if (!coche) {
    coche = document.createElement("input");
    coche.type = "checkbox";
    coche.setAttribute(ATTR_CASE_LIAISON, "1");
    coche.style.marginRight = "6px";
    coche.style.flexShrink = "0";
    champNom.parentElement.insertBefore(coche, champNom);
    coche.addEventListener("click", (event) => event.stopPropagation());
    coche.addEventListener("change", () => {
      const trackId = lireTrackIdCase(element);
      const actuel = trackId === null ? undefined : raspberryTrackBindingStore.trouverParTrackId(trackId);
      if (!actuel || !coche) {
        return;
      }
      if (!coche.checked) {
        actuel.liee = false;
        raspberryTrackBindingStore.enregistrer(actuel);
        appliquerEtatLiaison({ element }, actuel);
        return;
      }
      const cible = lireCibleNom(element);
      if (!cible || !cible.enLigne) {
        coche.checked = false;
        actuel.liee = false;
        raspberryTrackBindingStore.enregistrer(actuel);
        appliquerEtatLiaison({ element }, actuel);
        return;
      }
      actuel.liee = true;
      actuel.raspberryId = cible.raspberryId;
      if (cible.ip.length > 0) {
        actuel.raspberryIp = cible.ip;
      }
      raspberryTrackBindingStore.enregistrer(actuel);
      appliquerEtatLiaison({ element }, actuel);
    });
    if (champNom.dataset.raspberryNomLiaison !== "1") {
      champNom.dataset.raspberryNomLiaison = "1";
      champNom.addEventListener("input", () => {
        const trackId = lireTrackIdCase(element);
        const actuel = trackId === null ? undefined : raspberryTrackBindingStore.trouverParTrackId(trackId);
        if (!actuel || actuel.liee !== false) {
          return;
        }
        appliquerEtatLiaison({ element }, actuel);
      });
    }
  }

  coche.setAttribute("data-track-id", String(binding.trackId));
}
