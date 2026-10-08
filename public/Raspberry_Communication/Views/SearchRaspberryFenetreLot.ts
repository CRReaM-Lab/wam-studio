/**
 * Ouvrir un lot de sons dont le nom dit le destinataire : `son<son>-<Pi>.wav` (le protocole de
 * `_update_sounds.sh` de modulePre). Le serveur lit les noms et rend le plan (quel Pi, quel nom
 * sur le Pi, ce qui bloque, ce qui écrase) ; WAM l'affiche, puis envoie les fichiers prêts un par
 * un. WAM ne lit pas les noms lui-même : le serveur décide (Lot.fs).
 */
import type {
  EvenementTransfertUi,
  LignePlanLot,
  ResultatPlanLot,
} from "../Controllers/agent-transfert/AgentTransfertClient";
import { appliquerStyleModal, appliquerStyleOverlay } from "./SearchRaspberryFenetreImportAudio";
import { monterFenetre } from "./PanneauPiSon";

const ID_OVERLAY = "raspberry-lot-overlay";

const COULEURS: Record<LignePlanLot["gravite"], string> = {
  ok: "#7bd88f",
  attention: "#f0b44c",
  erreur: "#ff6b6b",
};

function bouton(libelle: string, classe = "btn btn-sm btn-secondary"): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = classe;
  b.innerText = libelle;
  return b;
}

export function ouvrirFenetreLot(params: {
  planifier: (noms: string[]) => Promise<ResultatPlanLot>;
  envoyer: (
    fichier: File,
    surEvenement: (event: EvenementTransfertUi) => void
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}): void {
  document.getElementById(ID_OVERLAY)?.remove();
  const overlay = document.createElement("div");
  overlay.id = ID_OVERLAY;
  appliquerStyleOverlay(overlay);
  const modal = document.createElement("div");
  appliquerStyleModal(modal);
  modal.style.width = "760px";

  const titre = document.createElement("h3");
  titre.style.margin = "0 0 8px";
  titre.innerText = "Envoyer un lot";
  modal.appendChild(titre);

  const aide = document.createElement("div");
  aide.style.fontSize = "12px";
  aide.style.opacity = "0.8";
  aide.style.marginBottom = "12px";
  aide.innerText =
    "Fichiers nommés son<son>-<Pi>.wav : son012-098.wav va au Pi 98 sous son12.wav " +
    "(zéros en tête facultatifs). Le serveur vérifie chaque fichier avant l'envoi.";
  modal.appendChild(aide);

  // Fichiers ou dossier entier.
  const choixFichiers = document.createElement("input");
  choixFichiers.type = "file";
  choixFichiers.accept = ".wav,audio/wav";
  choixFichiers.multiple = true;
  choixFichiers.style.display = "none";
  const choixDossier = document.createElement("input");
  choixDossier.type = "file";
  choixDossier.multiple = true;
  choixDossier.setAttribute("webkitdirectory", "");
  choixDossier.style.display = "none";
  const boutonFichiers = bouton("Choisir des fichiers…");
  const boutonDossier = bouton("Choisir un dossier…");
  boutonFichiers.onclick = () => choixFichiers.click();
  boutonDossier.onclick = () => choixDossier.click();
  const actionsChoix = document.createElement("div");
  actionsChoix.style.display = "flex";
  actionsChoix.style.gap = "8px";
  actionsChoix.style.marginBottom = "10px";
  actionsChoix.append(boutonFichiers, boutonDossier, choixFichiers, choixDossier);
  modal.appendChild(actionsChoix);

  const statut = document.createElement("div");
  statut.style.fontSize = "13px";
  statut.style.margin = "4px 0 8px";
  modal.appendChild(statut);

  // Seule la liste défile.
  const liste = document.createElement("div");
  liste.style.flex = "1";
  liste.style.minHeight = "120px";
  liste.style.overflow = "auto";
  liste.style.border = "1px solid #3b4046";
  liste.style.borderRadius = "6px";
  liste.style.padding = "6px";
  modal.appendChild(liste);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.gap = "8px";
  actions.style.marginTop = "12px";
  const boutonEnvoyer = bouton("Envoyer", "btn btn-sm btn-primary");
  boutonEnvoyer.disabled = true;
  const boutonFermer = bouton("Fermer");
  actions.append(boutonEnvoyer, boutonFermer);
  modal.appendChild(actions);

  let fichiers: File[] = [];
  let plan: LignePlanLot[] = [];
  let enCours = false;
  /** Par fichier : la ligne affichée, pour y écrire l'avancée de l'envoi. */
  const etatsEnvoi = new Map<string, HTMLDivElement>();

  const fermer = () => {
    if (!enCours) overlay.remove();
  };
  boutonFermer.onclick = fermer;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) fermer();
  });

  function afficherPlan(): void {
    liste.replaceChildren();
    etatsEnvoi.clear();
    // Groupé par Pi, les fichiers refusés sans Pi à la fin.
    const groupes = new Map<string, LignePlanLot[]>();
    for (const ligne of plan) {
      const cle = ligne.pi !== null && ligne.ip ? `rasp ${ligne.pi} (${ligne.ip})` : ligne.pi !== null ? `${ligne.pi} : pas un Pi son` : "Noms hors protocole";
      groupes.set(cle, [...(groupes.get(cle) ?? []), ligne]);
    }
    for (const [cle, lignes] of groupes) {
      const entete = document.createElement("div");
      entete.style.fontWeight = "600";
      entete.style.margin = "8px 0 4px";
      entete.innerText = cle;
      liste.appendChild(entete);
      for (const ligne of lignes) {
        const rangee = document.createElement("div");
        rangee.style.display = "grid";
        rangee.style.gridTemplateColumns = "200px 110px 1fr";
        rangee.style.gap = "8px";
        rangee.style.padding = "3px 4px";
        rangee.style.borderLeft = `3px solid ${COULEURS[ligne.gravite]}`;
        rangee.style.marginBottom = "2px";
        const nom = document.createElement("div");
        nom.innerText = ligne.fichier;
        nom.style.overflow = "hidden";
        nom.style.textOverflow = "ellipsis";
        const dest = document.createElement("div");
        dest.innerText = ligne.destination ? `→ ${ligne.destination}` : "";
        dest.style.opacity = "0.85";
        const infos = document.createElement("div");
        infos.style.fontSize = "12px";
        const messages = document.createElement("div");
        messages.style.color = COULEURS[ligne.gravite];
        messages.innerText = ligne.messages.length ? ligne.messages.join(" · ") : "prêt";
        const envoi = document.createElement("div");
        infos.append(messages, envoi);
        etatsEnvoi.set(ligne.fichier, envoi);
        rangee.append(nom, dest, infos);
        liste.appendChild(rangee);
      }
    }
  }

  async function charger(choisis: File[]): Promise<void> {
    // Un dossier peut contenir autre chose : on ne garde que les .wav, sans fichiers cachés.
    fichiers = choisis.filter((f) => /\.wav$/i.test(f.name) && !f.name.startsWith("."));
    plan = [];
    afficherPlan();
    boutonEnvoyer.disabled = true;
    if (fichiers.length === 0) {
      statut.innerText = "Aucun fichier .wav choisi.";
      return;
    }
    statut.innerText = `Vérification de ${fichiers.length} fichier(s) par le serveur…`;
    const resultat = await params.planifier(fichiers.map((f) => f.name));
    if (!resultat.ok) {
      statut.innerText = `Plan impossible : ${resultat.error}`;
      return;
    }
    plan = resultat.lignes;
    afficherPlan();
    const refuses = plan.length - resultat.prets;
    const attentions = plan.filter((l) => l.gravite === "attention").length;
    statut.innerText =
      `${resultat.prets} prêt(s) à partir` +
      (attentions ? `, dont ${attentions} avec un avertissement` : "") +
      (refuses ? ` ; ${refuses} refusé(s), ils ne partiront pas` : "") +
      ".";
    boutonEnvoyer.disabled = resultat.prets === 0;
    boutonEnvoyer.innerText = `Envoyer ${resultat.prets} fichier(s)`;
  }

  choixFichiers.onchange = () => void charger(Array.from(choixFichiers.files ?? []));
  choixDossier.onchange = () => void charger(Array.from(choixDossier.files ?? []));

  boutonEnvoyer.onclick = async () => {
    const aEnvoyer = plan.filter((l) => l.gravite !== "erreur");
    enCours = true;
    boutonEnvoyer.disabled = true;
    boutonFermer.disabled = true;
    boutonFichiers.disabled = true;
    boutonDossier.disabled = true;
    let reussis = 0;
    for (const [index, ligne] of aEnvoyer.entries()) {
      const fichier = fichiers.find((f) => f.name === ligne.fichier);
      const zone = etatsEnvoi.get(ligne.fichier);
      if (!fichier || !zone) continue;
      statut.innerText = `Envoi ${index + 1}/${aEnvoyer.length} : ${ligne.fichier}`;
      zone.style.opacity = "0.85";
      zone.innerText = "envoi…";
      const avertissements: string[] = [];
      const resultat = await params.envoyer(fichier, (event) => {
        if (event.type === "warning" && event.message) avertissements.push(event.message);
        else if (event.type === "progress" && typeof event.percent === "number") {
          zone.innerText = `envoi… ${Math.round(event.percent)} %`;
        }
      });
      if (resultat.ok) {
        reussis++;
        zone.style.color = COULEURS.ok;
        zone.innerText = `✓ déposé${avertissements.length ? " — " + avertissements.join(" · ") : ""}`;
      } else {
        zone.style.color = COULEURS.erreur;
        zone.innerText = `✗ ${resultat.error}`;
      }
    }
    enCours = false;
    boutonFermer.disabled = false;
    boutonFichiers.disabled = false;
    boutonDossier.disabled = false;
    statut.innerText = `${reussis}/${aEnvoyer.length} fichier(s) déposé(s).`;
  };

  overlay.appendChild(modal);
  monterFenetre(overlay);
}
