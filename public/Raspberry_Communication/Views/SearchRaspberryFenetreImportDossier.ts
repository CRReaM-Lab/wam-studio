import { monterFenetre } from "./PanneauPiSon";
import { ouvrirOngletPlan } from "./SearchRaspberryFenetrePlan";
import { ouvrirEditeurKit } from "./SearchRaspberryFenetreKit";
import {
  deposerFichier,
  fabriquerKit,
  importerSfz,
  importerSoundfont,
  lireBibliotheque,
  nomDepuisFichier,
  type CaseKit,
} from "../Services/RaspberryBibliotheque";
import { notesDuKit, planifier } from "../Services/RaspberryImportDossier";
import { enWav } from "../Services/RaspberrySons";

/**
 * L'import d'un dossier dans la bibliothèque du serveur, et son compte rendu : chaque SoundFont,
 * chaque SFZ (converti par le serveur), chaque dossier de sons (un kit, notes devinées d'après les
 * noms, à revoir dans l'éditeur). Rien n'est écrasé : un nom déjà pris reçoit un suffixe.
 */
const ID_OVERLAY = "raspberry-import-dossier-overlay";

type Ligne = { titre: string; etat: string; kit?: { nom: string; cases: (CaseKit & { libelleSon: string })[] } };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, texte = "", classe = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (texte) e.textContent = texte;
  if (classe) e.className = classe;
  return e;
}

const texteErreur = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ouvrirImportDossier(fichiers: File[]): void {
  document.getElementById(ID_OVERLAY)?.remove();
  const overlay = el("div");
  overlay.id = ID_OVERLAY;
  const fenetre = el("div");
  Object.assign(fenetre.style, { padding: "12px 16px 24px", color: "#e6e8eb", fontSize: "13px", lineHeight: "1.5" });
  overlay.appendChild(fenetre);
  const corps = el("div");
  fenetre.appendChild(corps);
  monterFenetre(overlay);

  const lignes: Ligne[] = [];
  let enCours = true;
  let resume = `${fichiers.length} fichier(s) lus…`;

  const rendre = () => {
    corps.replaceChildren();
    const retour = el("button", "← Plan");
    retour.type = "button";
    Object.assign(retour.style, { minHeight: "44px", marginBottom: "8px" });
    retour.onclick = () => ouvrirOngletPlan();
    corps.append(retour, el("div", resume));
    for (const l of lignes) {
      const boite = el("div");
      Object.assign(boite.style, { padding: "8px 0", borderTop: "1px solid #2a3038" });
      boite.append(el("strong", l.titre), el("div", l.etat));
      if (l.kit && !enCours) {
        const ouvrir = el("button", "Ouvrir dans l'éditeur");
        ouvrir.type = "button";
        ouvrir.style.minHeight = "44px";
        const k = l.kit;
        ouvrir.onclick = () => ouvrirEditeurKit({ nom: k.nom, cases: k.cases, remplacer: true });
        boite.append(ouvrir);
      }
      corps.append(boite);
    }
  };

  const ajouter = (titre: string): Ligne => {
    const l = { titre, etat: "en attente" };
    lignes.push(l);
    return l;
  };

  void (async () => {
    rendre();
    const plan = await planifier(fichiers);
    const pris = new Set((await lireBibliotheque().catch(() => ({ instruments: [] }))).instruments.map((i) => i.nom.toLowerCase()));
    /** Un nom libre dans la bibliothèque, sans rien écraser. */
    const nomLibre = (souhaite: string) => {
      let n = souhaite.slice(0, 60);
      for (let i = 2; pris.has(n.toLowerCase()); i++) n = `${souhaite.slice(0, 60)}-${i}`;
      pris.add(n.toLowerCase());
      return n;
    };
    const aFaire = plan.soundfonts.length + plan.sfz.length + plan.kits.length;
    resume = aFaire
      ? `${plan.soundfonts.length} SoundFont(s), ${plan.sfz.length} SFZ, ${plan.kits.length} dossier(s) de sons en kit(s).`
      : "Rien à importer : ni .sf2/.sf3, ni .sfz, ni sons.";
    let reussis = 0;

    for (const f of plan.soundfonts) {
      const l = ajouter(`SoundFont ${f.name}`);
      l.etat = "envoi…";
      rendre();
      try {
        const i = await importerSoundfont(f, nomLibre(nomDepuisFichier(f.name)));
        l.etat = `→ « ${i.nom} » (${(i.taille / 1e6).toFixed(1)} Mo)`;
        reussis++;
      } catch (e) {
        l.etat = `échec : ${texteErreur(e)}`;
      }
      rendre();
    }

    for (const s of plan.sfz) {
      const l = ajouter(`SFZ ${s.fichier.name} (${s.sons.length} son(s))`);
      l.etat = s.manquants.length ? `sons absents du dossier : ${s.manquants.join(", ")}` : "conversion…";
      rendre();
      if (s.manquants.length) continue;
      try {
        const i = await importerSfz(nomLibre(nomDepuisFichier(s.fichier.name)), s.fichier, s.sons, enWav);
        l.etat = `→ « ${i.nom} » (${(i.taille / 1e6).toFixed(1)} Mo) — ${i.avertissements.join(" ; ")}`;
        reussis++;
      } catch (e) {
        l.etat = `échec : ${texteErreur(e)}`;
      }
      rendre();
    }

    for (const k of plan.kits) {
      const nomDossier = k.dossier.split("/").pop() || "kit";
      const l = ajouter(`Kit ${k.dossier || "(racine)"} (${k.sons.length} son(s))`);
      l.etat = "dépôt des sons…";
      rendre();
      try {
        const notes = notesDuKit(k.sons.map((s) => s.name));
        const cases = [];
        for (const [i, son] of k.sons.entries()) {
          const depot = await deposerFichier(await enWav(son, son.name));
          cases.push({ nom: son.name.replace(/\.[^.]*$/, "").slice(0, 32), empreinte: depot.empreinte, note: notes[i], gain: 1, pan: 0, timbre: 0,
            groupe: notes[i] === 42 || notes[i] === 44 || notes[i] === 46 ? 1 : 0, libelleSon: `${son.name} (${depot.description})` });
        }
        const nom = nomLibre(nomDepuisFichier(nomDossier));
        const i = await fabriquerKit(nom, cases.map(({ libelleSon: _, ...c }) => c));
        l.etat = `→ « ${i.nom} » : ${cases.map((c) => `${c.nom} ${c.note}`).join(", ")}`;
        l.kit = { nom: i.nom, cases };
        reussis++;
      } catch (e) {
        l.etat = `échec : ${texteErreur(e)}`;
      }
      rendre();
    }
    enCours = false;
    if (aFaire) resume += ` ${reussis} sur ${aFaire} importé(s) dans la bibliothèque : les choisir pour un module dans le Plan.`;
    rendre();
  })();
}
