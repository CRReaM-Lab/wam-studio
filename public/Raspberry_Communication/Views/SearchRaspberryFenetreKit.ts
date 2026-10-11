import { monterFenetre } from "./PanneauPiSon";
import { ouvrirOngletPlan } from "./SearchRaspberryFenetrePlan";
import { affecterInstrument } from "../Services/RaspberryCompositionsStore";
import { deposerFichier, fabriquerKit, nomValide, urlFichier, type CaseKit } from "../Services/RaspberryBibliotheque";
import { chercher, ecrireCle, lireCle, nomLicence, telechargerApercu, type SonFreesound } from "../Services/RaspberryFreesound";
import { enWav, KIT_909, PERCUSSIONS_GM } from "../Services/RaspberrySons";

/**
 * Un kit de batterie pour les modules : des cases (un son sur une note, avec gain, pan, timbre et
 * groupe, comme le drumsampler de WAM), dont le serveur fabrique la SoundFont jouée par la
 * composition soundfont. Les sons viennent d'un fichier, du kit 909 du drumsampler, ou de
 * freesound ; ils entrent dans la bibliothèque du serveur (qui n'a pas Internet), et s'écoutent
 * ensuite depuis lui.
 */
const ID_OVERLAY = "raspberry-kit-overlay";

type Case = CaseKit & { /** D'où vient le son, pour l'afficher. */ libelleSon: string };

const STYLE = `
#${ID_OVERLAY} button, #${ID_OVERLAY} input, #${ID_OVERLAY} select { min-height: 44px; font: 13px "IBM Plex Sans", system-ui, sans-serif;
  border-radius: 8px; border: 1px solid #3b4046; background: #22272e; color: #e6e8eb; padding: 0 10px; box-sizing: border-box; }
#${ID_OVERLAY} button { cursor: pointer; }
#${ID_OVERLAY} button:disabled { opacity: .5; cursor: default; }
#${ID_OVERLAY} .ligne { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
#${ID_OVERLAY} .case { padding: 8px 10px; margin: 8px 0; border: 1px solid #333a43; border-radius: 10px; background: #1a1e24; }
#${ID_OVERLAY} .case .ligne { flex-wrap: nowrap; margin: 4px 0; }
#${ID_OVERLAY} .case .nomCase { flex: 1; min-width: 60px; }
#${ID_OVERLAY} .case .reglages { flex-wrap: wrap; }
#${ID_OVERLAY} .aide { color: #9aa1ab; font-size: 12px; }
#${ID_OVERLAY} .message { margin: 8px 0; color: #cfd3d8; }
#${ID_OVERLAY} label.reglage { display: inline-flex; flex-direction: column; gap: 2px; color: #9aa1ab; font-size: 12px; }
#${ID_OVERLAY} input[type=range] { min-height: 28px; width: 84px; padding: 0; }
#${ID_OVERLAY} audio { height: 36px; flex: 1; min-width: 100px; max-width: 200px; }
#${ID_OVERLAY} .case .note { width: 58px; }
#${ID_OVERLAY} .resultat { padding: 6px 0; border-top: 1px solid #2a3038; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, texte = "", classe = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (texte) e.textContent = texte;
  if (classe) e.className = classe;
  return e;
}

function bouton(texte: string, action: () => void | Promise<void>): HTMLButtonElement {
  const b = el("button", texte);
  b.type = "button";
  b.onclick = () => void action();
  return b;
}

const texteErreur = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Ouvre l'éditeur ; `pourModule` : le module qui jouera le kit une fois fabriqué ; `nom` et
 * `cases` : un kit à reprendre (import d'un dossier), `remplacer` : le refabriquer sous son nom.
 */
export function ouvrirEditeurKit(options: { pourModule?: number; nom?: string; cases?: Case[]; remplacer?: boolean } = {}): void {
  document.getElementById(ID_OVERLAY)?.remove();
  const overlay = el("div");
  overlay.id = ID_OVERLAY;
  const fenetre = el("div");
  Object.assign(fenetre.style, { padding: "12px 16px 24px", color: "#e6e8eb", fontSize: "13px" });
  overlay.appendChild(fenetre);
  const style = el("style");
  style.textContent = STYLE;
  fenetre.appendChild(style);
  const corps = el("div");
  fenetre.appendChild(corps);
  monterFenetre(overlay);

  let nom = options.nom ?? "kit-1";
  let cases: Case[] = (options.cases ?? []).map((c) => ({ ...c }));
  let message = "";
  let occupe = false;
  // La recherche freesound : pour quelle case, et ses résultats.
  let rechercheCase: number | null = null;
  let requete = "";
  let resultats: SonFreesound[] = [];
  let cle = lireCle();

  const dire = (texte: string) => {
    message = texte;
    rendre();
  };

  /** Dépose un son dans la bibliothèque et le met dans la case. */
  const prendreSon = async (index: number, donnees: Blob, nomFichier: string, libelle: string, origine?: Record<string, unknown>) => {
    const wav = await enWav(donnees, nomFichier);
    const depot = await deposerFichier(wav, origine);
    cases[index] = { ...cases[index], empreinte: depot.empreinte, libelleSon: `${libelle} (${depot.description})` };
  };

  const partirDu909 = async () => {
    occupe = true;
    dire("Téléchargement du kit 909 (burns.ca)…");
    const nouvelles: Case[] = KIT_909.map((s) => ({ nom: s.nom, empreinte: "", note: s.note, gain: 1, pan: 0, timbre: 0, groupe: s.groupe ?? 0, libelleSon: "" }));
    const echecs: string[] = [];
    cases = nouvelles;
    await Promise.all(KIT_909.map(async (s, i) => {
      try {
        const r = await fetch(s.url);
        if (!r.ok) throw new Error(String(r.status));
        await prendreSon(i, await r.blob(), `${s.nom}.wav`, `909 ${s.nom}`, { source: "drumsampler 909", url: s.url });
      } catch (e) {
        echecs.push(`${s.nom} (${texteErreur(e)})`);
      }
    }));
    occupe = false;
    dire(echecs.length ? `Kit 909 : ${echecs.length} son(s) non téléchargé(s) (Internet ?) : ${echecs.join(", ")}` : "Kit 909 importé : ses sons sont dans la bibliothèque du serveur.");
  };

  const fabriquer = async () => {
    const vides = cases.filter((c) => !c.empreinte).map((c) => c.nom || `note ${c.note}`);
    if (!cases.length) return dire("Aucune case.");
    if (vides.length) return dire(`Cases sans son : ${vides.join(", ")}.`);
    occupe = true;
    dire("Fabrication de la SoundFont…");
    try {
      const i = await fabriquerKit(nom, cases.map(({ libelleSon: _, ...c }) => c), options.remplacer === true && nom === options.nom);
      if (options.pourModule !== undefined) affecterInstrument(options.pourModule, { programme: 0, banque: 0, soundfont: i.nom });
      occupe = false;
      dire(`« ${i.nom} » fabriqué (${(i.taille / 1e6).toFixed(1)} Mo)${i.avertissements.length ? ` — attention : ${i.avertissements.join(" ; ")}` : ""}.`
        + (options.pourModule !== undefined ? ` Choisi pour le module ${options.pourModule} : l'envoyer depuis le Plan.` : ""));
    } catch (e) {
      occupe = false;
      dire(`Échec : ${texteErreur(e)}`);
    }
  };

  const ligneCase = (c: Case, index: number) => {
    const boite = el("div", "", "case");
    const tete = el("div", "", "ligne");
    const note = el("input");
    Object.assign(note, { type: "number", min: "0", max: "127", value: String(c.note), title: "note MIDI" });
    note.className = "note";
    const nomNote = el("span", PERCUSSIONS_GM[c.note] ?? "", "aide");
    note.oninput = () => {
      cases[index].note = Math.min(127, Math.max(0, Math.round(Number(note.value) || 0)));
      nomNote.textContent = PERCUSSIONS_GM[cases[index].note] ?? "";
    };
    const nomCase = el("input");
    Object.assign(nomCase, { type: "text", value: c.nom, placeholder: "nom", title: PERCUSSIONS_GM[c.note] ?? "" });
    nomCase.className = "nomCase";
    nomCase.oninput = () => { cases[index].nom = nomCase.value; };
    tete.append(note, nomNote, nomCase, bouton("Retirer", () => { cases.splice(index, 1); rendre(); }));
    boite.append(tete);

    boite.append(el("div", c.empreinte ? c.libelleSon : "pas de son", "aide"));
    const son = el("div", "", "ligne");
    if (c.empreinte) {
      const ecoute = el("audio");
      Object.assign(ecoute, { controls: true, preload: "none", src: urlFichier(c.empreinte) });
      son.append(ecoute);
    }
    const fichier = el("input");
    Object.assign(fichier, { type: "file", accept: "audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff" });
    fichier.style.display = "none";
    fichier.onchange = async () => {
      const f = fichier.files?.[0];
      if (!f) return;
      try {
        dire(`Dépôt de ${f.name}…`);
        await prendreSon(index, f, f.name, f.name);
        if (!cases[index].nom) cases[index].nom = f.name.replace(/\.[^.]*$/, "");
        dire(`${f.name} est dans la bibliothèque.`);
      } catch (e) {
        dire(`Échec pour ${f.name} : ${texteErreur(e)}`);
      }
    };
    son.append(bouton("Fichier…", () => fichier.click()), fichier,
      bouton("Freesound…", () => { rechercheCase = index; requete ||= c.nom; rendre(); }));
    boite.append(son);

    const reglages = el("div", "", "ligne reglages");
    const curseur = (libelle: string, cle: "gain" | "pan" | "timbre", min: number, max: number) => {
      const l = el("label", "", "reglage");
      const valeur = el("span", `${libelle} ${c[cle].toFixed(2)}`);
      const r = el("input");
      Object.assign(r, { type: "range", min: String(min), max: String(max), step: "0.01", value: String(c[cle]) });
      r.oninput = () => { cases[index][cle] = Number(r.value); valeur.textContent = `${libelle} ${Number(r.value).toFixed(2)}`; };
      l.append(valeur, r);
      return l;
    };
    const groupe = el("select");
    for (let g = 0; g <= 4; g++) groupe.append(new Option(g ? `groupe ${g}` : "sans groupe", String(g)));
    groupe.value = String(c.groupe);
    groupe.title = "Une case du même groupe coupe celles qui sonnent (charleston fermé / ouvert)";
    groupe.onchange = () => { cases[index].groupe = Number(groupe.value); };
    reglages.append(curseur("gain", "gain", 0, 1.5), curseur("pan", "pan", -1, 1), curseur("timbre", "timbre", -1, 1), groupe);
    boite.append(reglages);
    return boite;
  };

  const panneauFreesound = () => {
    const boite = el("div", "", "case");
    const index = rechercheCase!;
    boite.append(el("div", `Freesound, pour la case « ${cases[index]?.nom || `note ${cases[index]?.note}`} »`));
    boite.append(el("div", "Votre clé d'API freesound (freesound.org/apiv2/apply) : gardée dans ce navigateur, envoyée à freesound.org seulement. Les aperçus mp3 sont pris, avec l'auteur et la licence de chaque son.", "aide"));
    const ligneCle = el("div", "", "ligne");
    const champCle = el("input");
    Object.assign(champCle, { type: "password", value: cle, placeholder: "clé d'API freesound", autocomplete: "off" });
    ligneCle.append(champCle, bouton("Garder la clé", () => { cle = champCle.value.trim(); ecrireCle(cle); dire(cle ? "Clé gardée dans ce navigateur." : "Clé retirée."); }));
    boite.append(ligneCle);
    const ligneRecherche = el("div", "", "ligne");
    const champ = el("input");
    Object.assign(champ, { type: "search", value: requete, placeholder: "kick, snare, 909…" });
    champ.oninput = () => { requete = champ.value; };
    const lancer = async () => {
      try {
        dire(`Recherche « ${requete} »…`);
        const r = await chercher(cle, requete);
        resultats = r.sons;
        dire(`${r.total} son(s) sur freesound ; les ${r.sons.length} premiers (10 s au plus).`);
      } catch (e) {
        dire(`Freesound : ${texteErreur(e)}`);
      }
    };
    champ.onkeydown = (e) => { if (e.key === "Enter") void lancer(); };
    ligneRecherche.append(champ, bouton("Chercher", lancer), bouton("Fermer", () => { rechercheCase = null; resultats = []; rendre(); }));
    boite.append(ligneRecherche);
    for (const s of resultats) {
      const r = el("div", "", "resultat ligne");
      r.append(el("span", `${s.nom} — ${s.auteur} — ${nomLicence(s.licence)} — ${s.duree.toFixed(1)} s`));
      const ecoute = el("audio");
      Object.assign(ecoute, { controls: true, preload: "none", src: s.apercu });
      r.append(ecoute, bouton("Prendre", async () => {
        try {
          dire(`Téléchargement de ${s.nom}…`);
          const { donnees, origine } = await telechargerApercu(s);
          await prendreSon(index, donnees, `freesound-${s.id}.mp3`, `freesound ${s.id} · ${s.nom} · ${s.auteur} · ${nomLicence(s.licence)}`, origine);
          if (!cases[index].nom) cases[index].nom = s.nom.slice(0, 32);
          rechercheCase = null;
          resultats = [];
          dire(`${s.nom} (${s.auteur}, ${nomLicence(s.licence)}) est dans la bibliothèque.`);
        } catch (e) {
          dire(`Échec pour ${s.nom} : ${texteErreur(e)}`);
        }
      }));
      boite.append(r);
    }
    return boite;
  };

  const rendre = () => {
    corps.replaceChildren();
    const tete = el("div", "", "ligne");
    tete.append(bouton("← Plan", () => ouvrirOngletPlan()), el("strong", options.nom ? `Kit ${options.nom}` : "Nouveau kit"));
    corps.append(tete);
    corps.append(el("div", "Les sons entrent dans la bibliothèque du serveur ; il en fabrique une SoundFont, jouée par les modules dans la composition soundfont (programme 0). Le gain et le timbre sont intégrés aux sons.", "aide"));
    const ligneNom = el("div", "", "ligne");
    const champNom = el("input");
    Object.assign(champNom, { type: "text", value: nom, placeholder: "nom du kit" });
    const aideNom = el("span", nomValide(nom) ? "" : "lettres, chiffres, _ et - seulement", "aide");
    champNom.oninput = () => { nom = champNom.value.trim(); aideNom.textContent = nomValide(nom) ? "" : "lettres, chiffres, _ et - seulement"; };
    ligneNom.append(el("span", "Nom :"), champNom, aideNom);
    corps.append(ligneNom);
    const actions = el("div", "", "ligne");
    const b909 = bouton("Partir du kit 909 du drumsampler (Internet)", partirDu909);
    const ajouter = bouton("Ajouter une case", () => {
      const libres = Object.keys(PERCUSSIONS_GM).map(Number).filter((n) => !cases.some((c) => c.note === n));
      cases.push({ nom: "", empreinte: "", note: libres[0] ?? 60, gain: 1, pan: 0, timbre: 0, groupe: 0, libelleSon: "" });
      rendre();
    });
    const bFabriquer = bouton("Fabriquer le kit", fabriquer);
    for (const b of [b909, ajouter, bFabriquer]) b.disabled = occupe;
    actions.append(b909, ajouter, bFabriquer);
    corps.append(actions);
    if (message) corps.append(el("div", message, "message"));
    if (rechercheCase !== null && cases[rechercheCase]) corps.append(panneauFreesound());
    cases.forEach((c, i) => corps.append(ligneCase(c, i)));
  };

  rendre();
}
