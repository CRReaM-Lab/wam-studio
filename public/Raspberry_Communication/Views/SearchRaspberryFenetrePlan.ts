import { monterFenetre } from "./PanneauPiSon";
import { FAMILLES_GM, nomGeneralMidi } from "../Services/GeneralMidi";
import {
  envoyerAuxModules,
  importerSoundfont,
  lireBibliotheque,
  nomDepuisFichier,
  type ListeBibliotheque,
} from "../Services/RaspberryBibliotheque";
import {
  affecterComposition,
  affecterInstrument,
  affecterSynthe,
  compositionDuModule,
  EVENEMENT_COMPOSITIONS,
  lireAffectationCompositions,
} from "../Services/RaspberryCompositionsStore";
/**
 * Onglet « Plan » : le plan de salle de l'implantation active (où sont les modules, dessiné dans
 * la maintenance) et ce que chaque module joue dans ce projet. Toucher un module ou le nom d'une
 * section : choisir sa composition. La lettre sur chaque point est celle de sa composition.
 *
 * Les places ne se changent pas ici : l'implantation est partagée par les projets, elle se
 * modifie dans la maintenance (« Plan de salle »). Les compositions sont celles du projet
 * (RaspberryCompositionsStore), envoyées au serveur à chaque lecture.
 */
const ID_OVERLAY = "raspberry-plan-overlay";
const GRIS = "#9a9893";

/** Une section : son identifiant fixe (`s1`…, Implantation.fs du serveur), son nom affiché. */
type Section = { id: string; nom: string; couleur: string; zone: { x: number; y: number; l: number; h: number } };
type Implantation = { nom?: string; sections: Section[]; modules: Record<string, { x?: number; y?: number; section?: string }> };
type ModuleParc = {
  numero: number;
  ip: string;
  enLigne: boolean;
  /** L'état envoyé par le module : ses réglages audio en cours (crates/module, audio.rs). */
  etat?: { pd?: { audio?: { tampon: number; frequence: number; bloc: number } } } | null;
};

/** Les tampons proposés pour Pd (ms) : 10 ms ne craque pas sur le module 33, 5 ms si. */
const TAMPONS = [5, 10, 20, 50];
type Cible =
  | { type: "module"; numero: number; section: { id: string; nom: string } | null }
  | { type: "section"; id: string; nom: string };

const STYLE = `
#${ID_OVERLAY} .plan-wam { position: relative; width: 100%; aspect-ratio: 16 / 10; border: 1px solid #333a43;
  border-radius: 10px; background: #12151a; overflow: hidden; touch-action: manipulation; }
#${ID_OVERLAY} .scene { position: absolute; left: 30%; right: 30%; top: 0; height: 20px; border-radius: 0 0 8px 8px;
  background: #2a3038; color: #8a929d; font-size: 11px; text-align: center; line-height: 20px; }
#${ID_OVERLAY} .zone { position: absolute; border: 2px dashed; border-radius: 8px; box-sizing: border-box; }
#${ID_OVERLAY} .zone button { position: absolute; left: 0; bottom: 0; min-height: 36px; padding: 4px 8px; border: 0;
  background: transparent; color: inherit; font: 600 12px "IBM Plex Sans", system-ui, sans-serif; text-align: left; cursor: pointer; }
#${ID_OVERLAY} .zone button .compo { display: block; font-weight: 400; opacity: .85; }
#${ID_OVERLAY} .point { position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%;
  border: 0; color: #111; font: 600 13px "IBM Plex Sans", system-ui, sans-serif; cursor: pointer; padding: 0; }
#${ID_OVERLAY} .point.hors { opacity: .5; }
#${ID_OVERLAY} .point .lettre, #${ID_OVERLAY} .pastille .lettre { position: absolute; right: -6px; bottom: -4px; min-width: 18px;
  height: 18px; padding: 0 3px; box-sizing: border-box; border-radius: 9px; background: #e6e8eb; color: #111;
  font-size: 11px; line-height: 18px; text-align: center; }
#${ID_OVERLAY} .point .lettre.propre, #${ID_OVERLAY} .pastille .lettre.propre { background: #6fb6ff; }
#${ID_OVERLAY} .point.choisi, #${ID_OVERLAY} .pastille.choisi { outline: 3px solid #6fb6ff; outline-offset: 2px; }
#${ID_OVERLAY} .reserve { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; color: #8a929d; font-size: 12px; }
#${ID_OVERLAY} .reserve .deplier { min-height: 44px; padding: 0 12px; border-radius: 8px; border: 1px solid #3b4046;
  background: transparent; color: #cfd3d8; font: 13px "IBM Plex Sans", system-ui, sans-serif; cursor: pointer; }
#${ID_OVERLAY} .pastille { position: relative; width: 40px; height: 40px; border-radius: 8px; border: 1px solid #3b4046;
  background: #22272e; color: #e6e8eb; font: 600 13px "IBM Plex Sans", system-ui, sans-serif; cursor: pointer; padding: 0; }
#${ID_OVERLAY} .choix { margin-top: 12px; padding: 12px; border: 1px solid #333a43; border-radius: 10px; background: #1a1e24; }
#${ID_OVERLAY} .choix .titre { font-weight: 600; margin-bottom: 4px; }
#${ID_OVERLAY} .choix .aide { color: #9aa1ab; font-size: 12px; margin-bottom: 8px; }
#${ID_OVERLAY} .choix .liste { display: flex; flex-wrap: wrap; gap: 6px; }
#${ID_OVERLAY} .choix .liste button, #${ID_OVERLAY} .defaut select { min-height: 44px; padding: 0 12px; border-radius: 8px;
  border: 1px solid #3b4046; background: #22272e; color: #e6e8eb; font: 13px "IBM Plex Sans", system-ui, sans-serif; cursor: pointer; }
#${ID_OVERLAY} .choix .liste button[aria-pressed="true"] { border-color: #6fb6ff; background: #1f2a3a; }
#${ID_OVERLAY} .defaut { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
#${ID_OVERLAY} .legende { margin-top: 10px; color: #9aa1ab; font-size: 12px; line-height: 1.6; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, texte = "", classe = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (texte) e.textContent = texte;
  if (classe) e.className = classe;
  return e;
}

/**
 * Une abréviation par composition, dans l'ordre du parc : l'initiale, allongée tant qu'elle est
 * déjà prise (skini → S, skini-link → Sk).
 */
function abreviations(noms: string[]): Map<string, string> {
  const prises = new Set<string>();
  const resultat = new Map<string, string>();
  for (const nom of noms) {
    let n = 1;
    let a = nom.slice(0, 1).toUpperCase();
    while (prises.has(a) && n < nom.length) {
      n += 1;
      a = nom.slice(0, 1).toUpperCase() + nom.slice(1, n);
    }
    prises.add(a);
    resultat.set(nom, a);
  }
  return resultat;
}

async function lireJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
}

export function ouvrirOngletPlan(): void {
  document.getElementById(ID_OVERLAY)?.remove();
  const overlay = el("div");
  overlay.id = ID_OVERLAY;
  const fenetre = el("div");
  Object.assign(fenetre.style, { padding: "12px 16px 24px", color: "#e6e8eb", fontSize: "13px" });
  overlay.appendChild(fenetre);
  const style = el("style");
  style.textContent = STYLE;
  fenetre.appendChild(style);
  const corps = el("div", "Chargement du plan…");
  fenetre.appendChild(corps);
  monterFenetre(overlay);

  let impl: Implantation = { sections: [], modules: {} };
  let modules: ModuleParc[] = [];
  let compositions: string[] = [];
  let instrumentsFaust: string[] = [];
  let bibliotheque: ListeBibliotheque = { instruments: [], surLesPi: {} };
  let defautParc = "skini";
  let choisi: Cible | null = null;
  /** La réserve (modules hors de la salle) : repliée, elle tient sur une ligne. */
  let reserveDepliee = false;

  const rendre = () => {
    const affectation = lireAffectationCompositions();
    const abr = abreviations(compositions);
    const sectionPar = (id: string) => impl.sections.find((s) => s.id === id);
    const couleur = (id: string) => sectionPar(id)?.couleur ?? GRIS;
    corps.replaceChildren();

    // La composition par défaut du projet.
    const defaut = el("label", "", "defaut");
    defaut.append(el("span", "Par défaut dans ce projet :"));
    const select = el("select");
    select.append(new Option(`${defautParc} (celle du parc)`, ""));
    for (const c of compositions) select.append(new Option(c, c));
    select.value = affectation.defaut;
    select.onchange = () => appliquer(() => affecterComposition({ type: "defaut" }, select.value));
    defaut.append(select);
    corps.append(defaut);

    const plan = el("div", "", "plan-wam");
    plan.setAttribute("aria-label", `Plan de salle${impl.nom ? ` : ${impl.nom}` : ""}`);
    plan.append(el("div", "scène", "scene"));
    for (const s of impl.sections) {
      const z = el("div", "", "zone");
      Object.assign(z.style, {
        left: `${s.zone.x * 100}%`, top: `${s.zone.y * 100}%`, width: `${s.zone.l * 100}%`, height: `${s.zone.h * 100}%`,
        borderColor: s.couleur, color: s.couleur, background: `${s.couleur}14`,
      });
      if (choisi?.type === "section" && choisi.id === s.id) z.style.borderStyle = "solid";
      const b = el("button");
      b.type = "button";
      b.append(document.createTextNode(s.nom));
      const propre = affectation.sections[s.id] ?? affectation.sections[s.nom];
      b.append(el("span", propre ? `joue ${propre}` : "toucher : sa composition", "compo"));
      b.onclick = () => { choisi = { type: "section", id: s.id, nom: s.nom }; rendre(); };
      z.append(b);
      plan.append(z);
    }

    // Comme dans la maintenance : sa place, sinon en grille dans la zone de sa section, sinon la réserve.
    const reserve = el("div", "", "reserve");
    const deplier = el("button", "", "deplier");
    deplier.type = "button";
    deplier.onclick = () => { reserveDepliee = !reserveDepliee; rendre(); };
    reserve.append(deplier);
    let enReserve = 0;
    const lettresReserve = new Set<string>();
    const jouees = new Set<string>();
    const rangs: Record<string, number> = {};
    for (const m of modules) {
      const place = impl.modules[String(m.numero)];
      const section = place?.section ?? "";
      const sec = sectionPar(section);
      const c = compositionDuModule(affectation, m.numero, sec ? { id: sec.id, nom: sec.nom } : null, defautParc);
      jouees.add(c.nom);
      const lettre = el("span", abr.get(c.nom) ?? c.nom.slice(0, 2), c.origine === "module" ? "lettre propre" : "lettre");
      const titre = `Module ${m.numero} · ${sec?.nom || "sans section"} · joue ${c.nom}${c.origine === "module" ? "" : ` (${c.origine === "section" ? "par sa section" : c.origine === "projet" ? "par défaut du projet" : "par défaut du parc"})`}${m.enLigne ? "" : " · hors ligne"}`;
      const estChoisi = choisi?.type === "module" && choisi.numero === m.numero;
      const choisir = () => { choisi = { type: "module", numero: m.numero, section: sec ? { id: sec.id, nom: sec.nom } : null }; rendre(); };
      let x = place?.x, y = place?.y;
      if (x == null || y == null) {
        const zone = sec?.zone;
        if (zone) {
          rangs[section] = (rangs[section] ?? -1) + 1;
          const parLigne = Math.max(1, Math.floor(zone.l / 0.05));
          x = zone.x + 0.03 + (rangs[section] % parLigne) * 0.05;
          y = zone.y + 0.1 + Math.floor(rangs[section] / parLigne) * 0.08;
        }
      }
      const b = el("button", String(m.numero), x == null || y == null ? "pastille" : "point");
      b.type = "button";
      b.title = titre;
      b.setAttribute("aria-label", titre);
      b.append(lettre);
      b.onclick = choisir;
      if (estChoisi) b.classList.add("choisi");
      if (x == null || y == null) {
        enReserve += 1;
        lettresReserve.add(lettre.textContent ?? "");
        // Le module choisi reste visible même replié.
        if (reserveDepliee || estChoisi) reserve.append(b);
      } else {
        if (!m.enLigne) b.classList.add("hors");
        Object.assign(b.style, { left: `${x * 100}%`, top: `${y * 100}%`, background: section ? couleur(section) : GRIS });
        plan.append(b);
      }
    }
    corps.append(plan);
    deplier.textContent = `Réserve : ${enReserve} module${enReserve > 1 ? "s" : ""} (${[...lettresReserve].join(", ")}) ${reserveDepliee ? "▾" : "▸"}`;
    if (enReserve) corps.append(reserve);

    if (choisi) {
      const boite = panneauChoix(choisi, affectation);
      corps.append(boite);
      requestAnimationFrame(() => boite.scrollIntoView({ block: "nearest" }));
    }

    const utilisees = compositions.filter((c) => jouees.has(c));
    corps.append(
      el(
        "div",
        `${utilisees.map((c) => `${abr.get(c)} = ${c}`).join(" · ")}${utilisees.length ? ". " : ""}Lettre bleue : composition propre au module. Les places se changent dans la maintenance (Plan de salle) ; les compositions partent aux modules à la prochaine lecture.`,
        "legende"
      )
    );
  };

  /** Envoie un message OSC à un module par le serveur ; rend l'erreur, ou "" si c'est parti. */
  const osc = async (ip: string, adresse: string, valeur: string): Promise<string> => {
    try {
      const r = await fetch("/api/maintenance/osc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip, adresse, valeur }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      return j.ok ? "" : j.error || "refusé";
    } catch (erreur) {
      return erreur instanceof Error ? erreur.message : String(erreur);
    }
  };

  /** Le dernier message du réglage d'instrument de chaque module : il survit au redessin du Plan. */
  const messagesInstrument = new Map<number, string>();
  const dire = (numero: number, texte: string) => {
    messagesInstrument.set(numero, texte);
    rendre();
  };

  /**
   * L'instrument d'un module qui joue `soundfont` : sa SoundFont (celle de la fiche, GeneralUser_GS
   * en General MIDI, ou un instrument de la bibliothèque du serveur : SoundFont perso, kit) et son
   * programme. Gardé avec le projet, envoyé tout de suite au module (/soundfont, /pgm) et de nouveau
   * à chaque lecture. Une SoundFont de la bibliothèque doit être sur le module : « Envoyer au
   * module » la dépose (le serveur vérifie son empreinte).
   */
  const reglageInstrument = (numero: number, affectation: ReturnType<typeof lireAffectationCompositions>) => {
    const bloc = el("div");
    bloc.style.marginTop = "10px";
    const m = modules.find((x) => x.numero === numero);
    const choisi = affectation.instruments[String(numero)];
    const sf = choisi?.soundfont ?? "";
    const instrument = bibliotheque.instruments.find((i) => i.nom === sf);
    const surLeModule = !!m && (bibliotheque.surLesPi[sf] ?? []).includes(m.ip);
    const styleSelect = { minHeight: "44px", font: "inherit", fontSize: "14px", maxWidth: "100%" };

    // La SoundFont.
    bloc.append(el("div", `SoundFont : ${sf || "celle de la fiche du module (GeneralUser_GS, General MIDI)"}`, "aide"));
    const selectSf = el("select");
    Object.assign(selectSf.style, styleSelect);
    selectSf.append(new Option("Celle de la fiche (GeneralUser_GS, General MIDI)", ""));
    for (const i of bibliotheque.instruments) selectSf.append(new Option(`${i.nom} (${i.genre === "kit" ? "kit" : i.extension})`, i.nom));
    // Un choix d'un autre projet, que la bibliothèque n'a plus : montré, pour pouvoir le changer.
    if (sf && !instrument) selectSf.append(new Option(`${sf} (absente de la bibliothèque)`, sf));
    selectSf.value = sf;
    selectSf.onchange = async () => {
      const nom = selectSf.value;
      affecterInstrument(numero, nom ? { programme: 0, banque: 0, soundfont: nom } : { programme: 0, banque: 0 });
      const present = !!m && (bibliotheque.surLesPi[nom] ?? []).includes(m.ip);
      if (!m?.enLigne || !nom) return;
      if (!present) return dire(numero, `« ${nom} » n'est pas encore sur le module ${numero} : l'envoyer.`);
      const erreur = (await osc(m.ip, "/soundfont", nom)) || (await osc(m.ip, "/pgm", "0"));
      dire(numero, erreur ? `Échec : ${erreur}` : `Module ${numero} : ${nom}.`);
    };
    bloc.append(selectSf);

    // Sur le module ?
    if (sf && instrument) {
      const ligne = el("div", "", "liste");
      ligne.style.marginTop = "6px";
      ligne.append(el("div", surLeModule ? "Sur le module, à jour." : "Pas sur le module, ou pas à jour.", "aide"));
      if (!surLeModule) {
        const envoyer = el("button", "Envoyer au module");
        envoyer.type = "button";
        envoyer.disabled = !m?.enLigne;
        envoyer.onclick = async () => {
          envoyer.disabled = true;
          envoyer.textContent = "Envoi…";
          try {
            const [resultat] = await envoyerAuxModules(sf, [m!.ip]);
            if (!resultat?.ok) throw new Error(resultat?.erreur || "échec");
            bibliotheque = await lireBibliotheque();
            const erreur = (await osc(m!.ip, "/soundfont", sf)) || (await osc(m!.ip, "/pgm", String(choisi?.programme ?? 0)));
            dire(numero, erreur ? `Envoyée, mais : ${erreur}` : `« ${sf} » envoyée au module ${numero}, empreinte vérifiée.`);
          } catch (erreur) {
            dire(numero, `Échec de l'envoi : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
          }
        };
        ligne.append(envoyer);
      }
      bloc.append(ligne);
      if (instrument.avertissements.length) bloc.append(el("div", `Attention : ${instrument.avertissements.join(" ; ")}`, "aide"));
    }

    // Le programme : la liste General MIDI pour la SoundFont de la fiche, rien pour un kit (un seul
    // programme), un numéro pour une SoundFont perso.
    if (!sf) {
      bloc.append(el("div", `Instrument (General MIDI) : ${choisi ? `${nomGeneralMidi(choisi.programme)} (${choisi.programme})` : "Piano acoustique (0, par défaut)"}`, "aide"));
      const select = el("select");
      Object.assign(select.style, styleSelect);
      FAMILLES_GM.forEach((f, i) => {
        const groupe = document.createElement("optgroup");
        groupe.label = f.famille;
        f.instruments.forEach((nom, j) => groupe.append(new Option(`${i * 8 + j} · ${nom}`, String(i * 8 + j))));
        select.append(groupe);
      });
      select.value = String(choisi?.programme ?? 0);
      select.onchange = async () => {
        const programme = Number(select.value);
        affecterInstrument(numero, { programme, banque: 0 });
        if (!m?.enLigne) return;
        const erreur = await osc(m.ip, "/pgm", String(programme));
        dire(numero, erreur ? `Échec : ${erreur}` : `Envoyé au module ${numero}.`);
      };
      bloc.append(select);
    } else if (instrument?.genre !== "kit") {
      const ligne = el("div", "", "liste");
      ligne.style.marginTop = "6px";
      ligne.append(el("div", "Programme (0–127) :", "aide"));
      const champ = el("input");
      Object.assign(champ, { type: "number", min: "0", max: "127", step: "1", value: String(choisi?.programme ?? 0) });
      Object.assign(champ.style, { ...styleSelect, width: "90px" });
      champ.onchange = async () => {
        const programme = Math.min(127, Math.max(0, Math.round(Number(champ.value) || 0)));
        affecterInstrument(numero, { programme, banque: choisi?.banque ?? 0, soundfont: sf });
        if (!m?.enLigne || !surLeModule) return;
        const erreur = await osc(m.ip, "/pgm", String(programme));
        dire(numero, erreur ? `Échec : ${erreur}` : `Programme ${programme} envoyé au module ${numero}.`);
      };
      ligne.append(champ);
      bloc.append(ligne);
    }

    // Importer une SoundFont perso dans la bibliothèque, et la donner à ce module.
    const fichier = el("input");
    Object.assign(fichier, { type: "file", accept: ".sf2,.sf3" });
    fichier.style.display = "none";
    const importer = el("button", "Importer une SoundFont (.sf2, .sf3)…");
    importer.type = "button";
    Object.assign(importer.style, { minHeight: "44px", marginTop: "8px" });
    importer.onclick = () => fichier.click();
    fichier.onchange = async () => {
      const f = fichier.files?.[0];
      if (!f) return;
      const nom = nomDepuisFichier(f.name);
      dire(numero, `Import de ${f.name} (${(f.size / 1e6).toFixed(1)} Mo)…`);
      try {
        const i = await importerSoundfont(f, nom);
        bibliotheque = await lireBibliotheque();
        affecterInstrument(numero, { programme: 0, banque: 0, soundfont: i.nom });
        dire(numero, `« ${i.nom} » est dans la bibliothèque : l'envoyer au module.`);
      } catch (erreur) {
        dire(numero, `Échec de l'import : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    };
    bloc.append(importer, fichier);

    const message = messagesInstrument.get(numero);
    if (message) bloc.append(el("div", message, "aide"));
    return bloc;
  };

  /**
   * Le synthé Faust d'un module qui joue `faust` : parmi les instruments posés sur les modules
   * (`michel module install`), gardé avec le projet, envoyé tout de suite (/instrument) et à
   * chaque lecture. Sans choix, le module prend celui de sa fiche.
   */
  const reglageSynthe = (numero: number, affectation: ReturnType<typeof lireAffectationCompositions>) => {
    const bloc = el("div");
    bloc.style.marginTop = "10px";
    const m = modules.find((x) => x.numero === numero);
    const choisi = affectation.synthes[String(numero)] ?? "";
    bloc.append(el("div", instrumentsFaust.length
      ? `Instrument Faust : ${choisi || "celui de la fiche du module"}`
      : "Instrument Faust : aucun sur les modules (michel module install les compile depuis la banque)", "aide"));
    const select = el("select");
    Object.assign(select.style, { minHeight: "44px", font: "inherit", fontSize: "14px", maxWidth: "100%" });
    select.append(new Option("Celui de la fiche du module", ""));
    for (const nom of instrumentsFaust) select.append(new Option(nom, nom));
    // Un choix d'un autre projet, que les modules n'ont plus : montré, pour pouvoir le changer.
    if (choisi && !instrumentsFaust.includes(choisi)) select.append(new Option(`${choisi} (absent des modules)`, choisi));
    select.value = choisi;
    select.disabled = instrumentsFaust.length === 0 && !choisi;
    const etat = el("div", "", "aide");
    select.onchange = async () => {
      affecterSynthe(numero, select.value);
      if (!m?.enLigne || !select.value) return;
      try {
        const r = await fetch("/api/maintenance/osc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: m.ip, adresse: "/instrument", valeur: select.value }) });
        const j = (await r.json()) as { ok: boolean; error?: string };
        etat.textContent = j.ok ? `Envoyé au module ${numero}.` : `Échec : ${j.error}`;
      } catch (erreur) {
        etat.textContent = `Échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
      }
    };
    bloc.append(select, etat);
    return bloc;
  };

  /** Le tampon de Pd d'un module : changé sans relancer Pd (court silence), retenu par le module. */
  const reglageTampon = (numero: number) => {
    const bloc = el("div");
    bloc.style.marginTop = "10px";
    const m = modules.find((x) => x.numero === numero);
    const audio = m?.etat?.pd?.audio;
    bloc.append(el("div", audio ? `Tampon audio de Pd : ${audio.tampon} ms (${audio.frequence} Hz, bloc ${audio.bloc})` : "Tampon audio de Pd : inconnu (module hors ligne, ou sans le daemon module)", "aide"));
    const ligne = el("div", "", "liste");
    for (const t of TAMPONS) {
      const b = el("button", `${t} ms`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(audio?.tampon === t));
      b.disabled = !m?.enLigne || !audio;
      b.onclick = async () => {
        b.disabled = true;
        try {
          const r = await fetch("/api/maintenance/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: m!.ip, tampon: t }) });
          const j = (await r.json()) as { ok: boolean; error?: string };
          if (!j.ok) throw new Error(j.error);
          // L'état du module arrive avec son battement suivant (4 s) ; on montre le choix tout de suite.
          if (m?.etat?.pd?.audio) m.etat.pd.audio.tampon = t;
        } catch (erreur) {
          bloc.append(el("div", `Échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`, "aide"));
        }
        rendre();
      };
      ligne.append(b);
    }
    bloc.append(ligne);
    return bloc;
  };

  const panneauChoix = (cible: Cible, affectation: ReturnType<typeof lireAffectationCompositions>) => {
    const boite = el("div", "", "choix");
    const actuelle = cible.type === "module" ? affectation.modules[String(cible.numero)] ?? "" : affectation.sections[cible.id] ?? affectation.sections[cible.nom] ?? "";
    let heritage: string;
    if (cible.type === "module") {
      const sansPropre = compositionDuModule({ ...affectation, modules: {} }, cible.numero, cible.section, defautParc);
      heritage = sansPropre.origine === "section" ? `comme sa section (${sansPropre.nom})` : `par défaut (${sansPropre.nom})`;
      boite.append(el("div", `Module ${cible.numero}${cible.section ? ` · ${cible.section.nom}` : ""}`, "titre"));
    } else {
      heritage = `par défaut (${affectation.defaut || defautParc})`;
      boite.append(el("div", `Section ${cible.nom}`, "titre"));
      boite.append(el("div", "Tous ses modules, sauf ceux qui ont leur propre composition.", "aide"));
    }
    const liste = el("div", "", "liste");
    const bouton = (texte: string, valeur: string) => {
      const b = el("button", texte);
      b.type = "button";
      b.setAttribute("aria-pressed", String(actuelle === valeur));
      b.onclick = () => {
        appliquer(() => affecterComposition(cible.type === "module" ? { type: "module", numero: cible.numero } : { type: "section", id: cible.id, nom: cible.nom }, valeur));
      };
      return b;
    };
    liste.append(bouton(heritage, ""));
    for (const c of compositions) liste.append(bouton(c, c));
    const fermer = el("button", "Fermer");
    fermer.type = "button";
    fermer.onclick = () => { choisi = null; rendre(); };
    liste.append(fermer);
    boite.append(liste);
    if (cible.type === "module") {
      // L'instrument, pour un module qui joue le contexte soundfont.
      const joue = compositionDuModule(affectation, cible.numero, cible.section, defautParc).nom;
      if (joue === "soundfont") boite.append(reglageInstrument(cible.numero, affectation));
      if (joue === "faust") boite.append(reglageSynthe(cible.numero, affectation));
      boite.append(reglageTampon(cible.numero));
    }
    return boite;
  };

  /** La composition de chaque module en ligne, d'après l'affectation du projet. */
  const compositionsEnLigne = () => {
    const affectation = lireAffectationCompositions();
    const r = new Map<string, string>();
    for (const m of modules.filter((x) => x.enLigne)) {
      const sec = impl.sections.find((s) => s.id === impl.modules[String(m.numero)]?.section);
      r.set(m.ip, compositionDuModule(affectation, m.numero, sec ? { id: sec.id, nom: sec.nom } : null, defautParc).nom);
    }
    return r;
  };

  /**
   * Change l'affectation, puis charge tout de suite la nouvelle composition sur les modules en ligne
   * dont la composition change vraiment (`/composition N`, N : son rang dans la liste du parc), sans
   * attendre la lecture.
   */
  const appliquer = (changer: () => void) => {
    const avant = compositionsEnLigne();
    changer();
    for (const [ip, nom] of compositionsEnLigne()) {
      const rang = compositions.indexOf(nom);
      if (nom === avant.get(ip) || rang < 0) continue;
      void fetch("/api/maintenance/osc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip, adresse: "/composition", valeur: String(rang) }) });
    }
  };

  const surChangement = () => {
    if (!overlay.isConnected) {
      window.removeEventListener(EVENEMENT_COMPOSITIONS, surChangement);
      return;
    }
    rendre();
  };
  window.addEventListener(EVENEMENT_COMPOSITIONS, surChangement);

  void (async () => {
    try {
      const [i, m, c] = await Promise.all([
        lireJson<Implantation>("/api/implantations/active"),
        lireJson<{ modules: ModuleParc[] }>("/api/maintenance"),
        lireJson<{ compositions: string[]; defaut: string; instrumentsFaust?: string[] }>("/api/compositions"),
      ]);
      impl = { nom: i.nom, sections: i.sections ?? [], modules: i.modules ?? {} };
      modules = m.modules ?? [];
      compositions = c.compositions ?? [];
      instrumentsFaust = c.instrumentsFaust ?? [];
      // La bibliothèque : le Plan s'en passe si elle ne répond pas (serveur ancien).
      bibliotheque = await lireBibliotheque().catch(() => bibliotheque);
      defautParc = c.defaut || "skini";
      rendre();
    } catch (erreur) {
      corps.textContent = `Plan indisponible : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
    }
  })();
}
