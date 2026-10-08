import type { CibleImportAudio } from "../Services/RaspberryImportAudioService";
import { formaterLibelleFichierPlay } from "../utils/osc/OscPlayHelpers";
import { synchroniserLibellesDepuisFichiers } from "../Services/RaspberryLibellesSonsStore";
import {
  dessinerFormeOnde,
  dessinerSpectrogramme,
  resumerAnalyse,
  type ResultatAnalyse,
} from "./SearchRaspberryApercuSon";
import { monterFenetre } from "./PanneauPiSon";
import { demanderConfirmation } from "./SearchRaspberryConfirmationEnvoi";

const ID_OVERLAY = "raspberry-import-audio-overlay";

export type SelectionImportAudio = {
  ip: string;
  raspberryId: number;
  fichiers: string[];
};

function fermerOverlay(): void {
  document.getElementById(ID_OVERLAY)?.remove();
}

export function appliquerStyleOverlay(overlay: HTMLDivElement): void {
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0, 0, 0, 0.45)";
  overlay.style.zIndex = "2000";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
}

export function appliquerStyleModal(modal: HTMLDivElement): void {
  modal.style.background = "#1f252b";
  modal.style.color = "#f1f1f1";
  modal.style.padding = "20px";
  modal.style.border = "1px solid #3b4046";
  modal.style.borderRadius = "8px";
  modal.style.width = "660px";
  modal.style.maxWidth = "95vw";
  /* Une colonne : seule la liste des sons défile, la fenêtre garde ses boutons en vue. */
  modal.style.maxHeight = "85vh";
  modal.style.overflow = "hidden";
  modal.style.display = "flex";
  modal.style.flexDirection = "column";
}

function lireCibleParIp(cibles: CibleImportAudio[], ip: string): CibleImportAudio | undefined {
  return cibles.find((cible) => cible.ip === ip);
}

/** Un seul lecteur pour les écoutes : en lancer une arrête la précédente. */
let lecteur: { audio: HTMLAudioElement; cle: string; bouton: HTMLButtonElement } | null = null;

function arreterEcoute(): void {
  if (!lecteur) return;
  lecteur.audio.pause();
  URL.revokeObjectURL(lecteur.audio.src);
  lecteur.bouton.textContent = "▶";
  lecteur.bouton.setAttribute("aria-pressed", "false");
  lecteur = null;
}

/**
 * Les sons d'un Pi (dossier sons/ de skini), dans un seul éditeur : les écouter (dans le
 * navigateur, ou joués par le module), les importer sur la piste WAM liée, les supprimer.
 * Les commandes tiennent en une barre en haut et une en bas : la liste prend le reste.
 */
export function ouvrirFenetreImportAudio(params: {
  cibles: CibleImportAudio[];
  listerSons: (ip: string) => Promise<{ ok: true; fichiers: string[] } | { ok: false; error: string }>;
  onImporter: (selection: SelectionImportAudio) => Promise<{ ok: boolean; message: string }>;
  /** L'analyse d'un son du Pi (serveur), pour l'aperçu et les avertissements. */
  analyser?: (ip: string, fichier: string) => Promise<ResultatAnalyse>;
  /** Supprimer des sons du Pi ; absent : pas de bouton Supprimer. */
  onSupprimer?: (selection: { ip: string; fichiers: string[] }) => Promise<{ ok: boolean; message: string }>;
  /** Le fichier du Pi, pour l'écouter ici. */
  telecharger?: (ip: string, fichier: string) => Promise<{ ok: true; blob: Blob } | { ok: false; error: string }>;
  /** Faire jouer le son par le module (`/play`) ; null : le fichier n'a pas de numéro skini. */
  jouerSurPi?: (ip: string, fichier: string) => string | null;
}): void {
  fermerOverlay();

  const enLigne = params.cibles.filter((cible) => cible.enLigne);
  const overlay = document.createElement("div");
  overlay.id = ID_OVERLAY;
  appliquerStyleOverlay(overlay);

  const modal = document.createElement("div");
  appliquerStyleModal(modal);

  const titre = document.createElement("h3");
  titre.style.margin = "0 0 8px";
  titre.innerText = "Sons du Pi";
  modal.appendChild(titre);

  const selectRaspberry = document.createElement("select");
  selectRaspberry.setAttribute("aria-label", "Pi son");
  selectRaspberry.style.flex = "1 1 auto";
  selectRaspberry.style.minWidth = "0";
  selectRaspberry.disabled = enLigne.length === 0;

  if (enLigne.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.text = "Aucun Raspberry en ligne";
    selectRaspberry.appendChild(option);
  } else {
    for (const cible of enLigne) {
      const option = document.createElement("option");
      option.value = cible.ip;
      option.text = `${cible.nomAffichage} (${cible.ip}) → ${cible.nomPiste}`;
      selectRaspberry.appendChild(option);
    }
  }

  // La barre du haut : le Pi, relire, tout cocher ou rien.
  const barre = document.createElement("div");
  barre.style.display = "flex";
  barre.style.gap = "6px";
  barre.style.alignItems = "center";
  barre.style.marginBottom = "6px";

  const boutonActualiser = document.createElement("button");
  boutonActualiser.type = "button";
  boutonActualiser.className = "btn btn-sm btn-secondary";
  boutonActualiser.innerText = "↻";
  boutonActualiser.title = "Relire la liste";
  boutonActualiser.disabled = enLigne.length === 0;

  const boutonToutCocher = document.createElement("button");
  boutonToutCocher.type = "button";
  boutonToutCocher.className = "btn btn-sm btn-secondary";
  boutonToutCocher.innerText = "Tout";
  boutonToutCocher.title = "Tout cocher";
  boutonToutCocher.disabled = true;

  const boutonToutDecocher = document.createElement("button");
  boutonToutDecocher.type = "button";
  boutonToutDecocher.className = "btn btn-sm btn-secondary";
  boutonToutDecocher.innerText = "Aucun";
  boutonToutDecocher.title = "Tout décocher";
  boutonToutDecocher.disabled = true;

  barre.append(selectRaspberry, boutonActualiser, boutonToutCocher, boutonToutDecocher);
  modal.appendChild(barre);

  // Seulement quand la piste n'existe pas encore : l'option du Pi dit déjà « → rasp N ».
  const infoPiste = document.createElement("div");
  infoPiste.style.fontSize = "12px";
  infoPiste.style.marginBottom = "6px";
  infoPiste.style.color = "#9ecbff";
  modal.appendChild(infoPiste);

  const listeSons = document.createElement("div");
  listeSons.style.border = "1px solid #3b4046";
  listeSons.style.borderRadius = "6px";
  listeSons.style.padding = "8px";
  listeSons.style.flex = "1 1 auto";
  listeSons.style.minHeight = "160px";
  listeSons.style.overflow = "auto";
  listeSons.style.fontSize = "13px";
  listeSons.innerText = enLigne.length === 0 ? "Aucun Raspberry disponible." : "Chargement...";
  modal.appendChild(listeSons);

  // La barre du bas : le compte rendu, puis les actions sur les sons cochés.
  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.alignItems = "center";
  actions.style.gap = "8px";
  actions.style.marginTop = "8px";

  const statut = document.createElement("div");
  statut.style.fontSize = "12px";
  statut.style.flex = "1 1 auto";
  statut.style.minWidth = "0";
  statut.style.whiteSpace = "pre-wrap";
  actions.appendChild(statut);

  const boutonFermer = document.createElement("button");
  boutonFermer.type = "button";
  boutonFermer.className = "fermer-fenetre";
  boutonFermer.innerText = "Fermer";

  const boutonSupprimer = document.createElement("button");
  boutonSupprimer.type = "button";
  boutonSupprimer.innerText = "Supprimer";
  boutonSupprimer.title = "Supprimer du Pi les sons cochés";
  boutonSupprimer.style.background = "transparent";
  boutonSupprimer.style.color = "#ef6b5d";
  boutonSupprimer.style.border = "1px solid #5a2a25";
  boutonSupprimer.style.padding = "6px 12px";
  boutonSupprimer.style.borderRadius = "4px";
  boutonSupprimer.disabled = enLigne.length === 0;
  if (!params.onSupprimer) boutonSupprimer.style.display = "none";

  const boutonImporter = document.createElement("button");
  boutonImporter.type = "button";
  boutonImporter.innerText = "Importer";
  boutonImporter.title = "Importer les sons cochés sur la piste du Pi";
  boutonImporter.style.background = "#2e6da4";
  boutonImporter.style.color = "#fff";
  boutonImporter.style.border = "none";
  boutonImporter.style.padding = "6px 12px";
  boutonImporter.style.borderRadius = "4px";
  boutonImporter.disabled = enLigne.length === 0;

  let cases: HTMLInputElement[] = [];
  let chargement = false;

  const mettreAJourInfoPiste = () => {
    const cible = lireCibleParIp(enLigne, selectRaspberry.value);
    if (!cible) {
      infoPiste.innerText = "";
      return;
    }
    if (cible.pistePresente) {
      infoPiste.innerText = "";
    } else {
      infoPiste.innerText = `La piste ${cible.nomPiste} sera creee automatiquement a l'import.`;
    }
  };

  const lireFichiersCoches = (): string[] =>
    cases.filter((item) => item.checked).map((item) => item.value);

  /* Les analyses, demandées deux à la fois pour ne pas charger le serveur ; une liste
     rechargée (autre Pi, actualiser) abandonne les demandes de la précédente. */
  let generation = 0;
  const apercus: Array<() => Promise<void>> = [];
  const lancerApercus = (gen: number) => {
    const suivant = async () => {
      while (gen === generation && apercus.length > 0) {
        const tache = apercus.shift()!;
        await tache();
      }
    };
    void suivant();
    void suivant();
  };

  const remplirListeSons = (fichiers: string[], ip: string) => {
    listeSons.innerHTML = "";
    cases = [];
    const gen = ++generation;
    apercus.length = 0;
    const libelles = synchroniserLibellesDepuisFichiers(ip, fichiers);

    if (fichiers.length === 0) {
      listeSons.innerText = "Aucun fichier audio dans sons/.";
      boutonToutCocher.disabled = true;
      boutonToutDecocher.disabled = true;
      return;
    }

    for (const nom of fichiers) {
      const bloc = document.createElement("div");
      bloc.style.padding = "4px 0";
      bloc.style.borderBottom = "1px solid rgba(255,255,255,0.06)";

      const rangee = document.createElement("div");
      rangee.style.display = "flex";
      rangee.style.alignItems = "center";
      rangee.style.gap = "8px";

      const ligne = document.createElement("label");
      ligne.style.display = "flex";
      ligne.style.alignItems = "center";
      ligne.style.gap = "8px";
      ligne.style.cursor = "pointer";
      ligne.style.flex = "1";

      const caseACocher = document.createElement("input");
      caseACocher.type = "checkbox";
      caseACocher.value = nom;
      cases.push(caseACocher);

      const texte = document.createElement("span");
      texte.innerText = formaterLibelleFichierPlay(nom, libelles);

      ligne.appendChild(caseACocher);
      ligne.appendChild(texte);
      rangee.appendChild(ligne);

      const petitBouton = (libelle: string, titreBouton: string) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-sm btn-secondary";
        b.textContent = libelle;
        b.title = titreBouton;
        b.style.minWidth = "36px";
        b.style.flex = "0 0 auto";
        return b;
      };
      if (params.telecharger) {
        const ecouter = petitBouton("▶", "Écouter ici");
        ecouter.setAttribute("aria-pressed", "false");
        ecouter.addEventListener("click", async () => {
          const cle = `${ip}/${nom}`;
          if (lecteur?.cle === cle) {
            arreterEcoute();
            return;
          }
          arreterEcoute();
          ecouter.textContent = "…";
          const r = await params.telecharger!(ip, nom);
          if (!r.ok) {
            ecouter.textContent = "▶";
            statut.innerText = `${nom} : ${r.error}`;
            return;
          }
          const audio = new Audio(URL.createObjectURL(r.blob));
          lecteur = { audio, cle, bouton: ecouter };
          ecouter.textContent = "■";
          ecouter.setAttribute("aria-pressed", "true");
          audio.addEventListener("ended", () => { if (lecteur?.audio === audio) arreterEcoute(); });
          void audio.play().catch((e) => {
            arreterEcoute();
            statut.innerText = `${nom} : lecture impossible (${e instanceof Error ? e.message : e})`;
          });
        });
        rangee.appendChild(ecouter);
      }
      if (params.jouerSurPi) {
        const surPi = petitBouton("▶ Pi", "Faire jouer le son par le module (/play)");
        surPi.addEventListener("click", () => {
          const r = params.jouerSurPi!(ip, nom);
          statut.innerText = r ?? `${nom} : pas de numéro skini, le module ne sait pas le jouer.`;
        });
        rangee.appendChild(surPi);
      }

      // L'aperçu : la forme d'onde colorée par les fréquences ; un clic montre le spectrogramme.
      const apercu = document.createElement("canvas");
      apercu.title = "Analyse en cours…";
      apercu.style.cursor = "pointer";
      apercu.style.background = "rgba(255,255,255,0.03)";
      apercu.style.borderRadius = "3px";
      apercu.width = 140;
      apercu.height = 26;
      apercu.style.width = "140px";
      apercu.style.height = "26px";
      apercu.style.flex = "0 0 auto";
      rangee.appendChild(apercu);
      bloc.appendChild(rangee);

      const resume = document.createElement("div");
      resume.style.fontSize = "11px";
      resume.style.opacity = "0.65";
      resume.style.margin = "1px 0 0 24px";
      bloc.appendChild(resume);

      const alertes = document.createElement("div");
      alertes.style.fontSize = "11px";
      alertes.style.color = "#ffc46b";
      alertes.style.margin = "2px 0 0 24px";
      bloc.appendChild(alertes);

      const detail = document.createElement("div");
      detail.style.display = "none";
      detail.style.margin = "6px 0 4px 24px";
      bloc.appendChild(detail);
      listeSons.appendChild(bloc);

      if (params.analyser) {
        apercus.push(async () => {
          const resultat = await params.analyser!(ip, nom);
          if (gen !== generation) return;
          if (!resultat.ok) {
            apercu.title = `Analyse impossible : ${resultat.error}`;
            alertes.style.color = "#ff9b9b";
            alertes.innerText = `analyse impossible : ${resultat.error}`;
            return;
          }
          const a = resultat.analyse;
          dessinerFormeOnde(apercu, a);
          apercu.title = "Cliquer pour le spectrogramme";
          resume.innerText = resumerAnalyse(a);
          alertes.innerText = a.avertissements.join(" · ");
          apercu.onclick = () => {
            const ouvert = detail.style.display !== "none";
            detail.style.display = ouvert ? "none" : "block";
            if (!ouvert && !detail.firstChild) {
              const spectre = document.createElement("canvas");
              dessinerSpectrogramme(spectre, a, 560, 140);
              spectre.style.maxWidth = "100%";
              spectre.style.borderRadius = "4px";
              const chiffres = document.createElement("div");
              chiffres.style.fontSize = "11px";
              chiffres.style.opacity = "0.8";
              chiffres.style.marginTop = "3px";
              chiffres.innerText = resumerAnalyse(a);
              detail.append(spectre, chiffres);
            }
          };
        });
      }
    }
    lancerApercus(gen);

    boutonToutCocher.disabled = false;
    boutonToutDecocher.disabled = false;
  };

  /** `garder` : un message à laisser affiché (le résultat d'un import), suivi du nombre de sons. */
  const chargerSons = async (garder = "") => {
    const ip = selectRaspberry.value;
    if (!ip || chargement) {
      return;
    }
    chargement = true;
    boutonActualiser.disabled = true;
    boutonImporter.disabled = true;
    boutonSupprimer.disabled = true;
    arreterEcoute();
    listeSons.innerText = "Chargement des fichiers sur le Pi...";
    statut.innerText = garder;
    mettreAJourInfoPiste();

    const resultat = await params.listerSons(ip);
    chargement = false;
    boutonActualiser.disabled = false;
    boutonImporter.disabled = false;
    boutonSupprimer.disabled = false;

    if (!resultat.ok) {
      listeSons.innerText = resultat.error;
      statut.innerText = resultat.error;
      cases = [];
      boutonToutCocher.disabled = true;
      boutonToutDecocher.disabled = true;
      return;
    }

    remplirListeSons(resultat.fichiers, ip);
    const nombre = `${resultat.fichiers.length} son(s) sur le Pi.`;
    statut.innerText = garder ? `${garder}\n${nombre}` : nombre;
  };

  selectRaspberry.addEventListener("change", () => {
    mettreAJourInfoPiste();
    void chargerSons();
  });
  boutonActualiser.addEventListener("click", () => {
    void chargerSons();
  });
  boutonToutCocher.addEventListener("click", () => {
    cases.forEach((item) => {
      item.checked = true;
    });
  });
  boutonToutDecocher.addEventListener("click", () => {
    cases.forEach((item) => {
      item.checked = false;
    });
  });

  boutonFermer.addEventListener("click", () => {
    arreterEcoute();
    fermerOverlay();
  });

  boutonSupprimer.addEventListener("click", async () => {
    const ip = selectRaspberry.value;
    const fichiers = lireFichiersCoches();
    if (!ip || !params.onSupprimer) return;
    if (fichiers.length === 0) {
      statut.innerText = "Cochez au moins un son à supprimer.";
      return;
    }
    const confirme = await demanderConfirmation(
      "Supprimer du Pi",
      `${fichiers.length} son(s) seront supprimés de ${ip} :\n${fichiers.join(", ")}\n\nC'est irréversible.`,
      "Supprimer",
      "Annuler",
      true
    );
    if (!confirme) return;
    arreterEcoute();
    boutonSupprimer.disabled = true;
    statut.innerText = `Suppression de ${fichiers.length} son(s)…`;
    const resultat = await params.onSupprimer({ ip, fichiers });
    boutonSupprimer.disabled = false;
    statut.innerText = resultat.message;
    if (resultat.ok) await chargerSons(resultat.message);
  });

  boutonImporter.addEventListener("click", async () => {
    const ip = selectRaspberry.value;
    const cible = lireCibleParIp(enLigne, ip);
    const fichiers = lireFichiersCoches();
    if (!ip || !cible) {
      statut.innerText = "Choisissez un Raspberry.";
      return;
    }
    if (fichiers.length === 0) {
      statut.innerText = "Cochez au moins un son a importer.";
      return;
    }

    boutonImporter.disabled = true;
    statut.innerText = `Import de ${fichiers.length} fichier(s) vers ${cible.nomPiste}...`;
    const resultat = await params.onImporter({
      ip,
      raspberryId: cible.raspberryId,
      fichiers,
    });
    boutonImporter.disabled = false;
    statut.innerText = resultat.message;
    if (resultat.ok) {
      await chargerSons(resultat.message);
    }
  });

  actions.appendChild(boutonFermer);
  actions.appendChild(boutonSupprimer);
  actions.appendChild(boutonImporter);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !boutonImporter.disabled) {
      fermerOverlay();
    }
  });
  monterFenetre(overlay);

  if (enLigne.length > 0) {
    mettreAJourInfoPiste();
    void chargerSons();
  }
}
