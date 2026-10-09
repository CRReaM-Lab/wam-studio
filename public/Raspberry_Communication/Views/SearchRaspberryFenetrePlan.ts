import { monterFenetre } from "./PanneauPiSon";
import {
  affecterComposition,
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

type Section = { nom: string; couleur: string; zone: { x: number; y: number; l: number; h: number } };
type Implantation = { nom?: string; sections: Section[]; modules: Record<string, { x?: number; y?: number; section?: string }> };
type ModuleParc = { numero: number; enLigne: boolean };
type Cible = { type: "module"; numero: number; section: string } | { type: "section"; nom: string };

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
  let defautParc = "skini";
  let choisi: Cible | null = null;
  /** La réserve (modules hors de la salle) : repliée, elle tient sur une ligne. */
  let reserveDepliee = false;

  const rendre = () => {
    const affectation = lireAffectationCompositions();
    const abr = abreviations(compositions);
    const couleur = (section: string) => impl.sections.find((s) => s.nom === section)?.couleur ?? GRIS;
    corps.replaceChildren();

    // La composition par défaut du projet.
    const defaut = el("label", "", "defaut");
    defaut.append(el("span", "Par défaut dans ce projet :"));
    const select = el("select");
    select.append(new Option(`${defautParc} (celle du parc)`, ""));
    for (const c of compositions) select.append(new Option(c, c));
    select.value = affectation.defaut;
    select.onchange = () => affecterComposition({ type: "defaut" }, select.value);
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
      if (choisi?.type === "section" && choisi.nom === s.nom) z.style.borderStyle = "solid";
      const b = el("button");
      b.type = "button";
      b.append(document.createTextNode(s.nom));
      const propre = affectation.sections[s.nom];
      b.append(el("span", propre ? `joue ${propre}` : "toucher : sa composition", "compo"));
      b.onclick = () => { choisi = { type: "section", nom: s.nom }; rendre(); };
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
      const c = compositionDuModule(affectation, m.numero, section, defautParc);
      jouees.add(c.nom);
      const lettre = el("span", abr.get(c.nom) ?? c.nom.slice(0, 2), c.origine === "module" ? "lettre propre" : "lettre");
      const titre = `Module ${m.numero} · ${section || "sans section"} · joue ${c.nom}${c.origine === "module" ? "" : ` (${c.origine === "section" ? "par sa section" : c.origine === "projet" ? "par défaut du projet" : "par défaut du parc"})`}${m.enLigne ? "" : " · hors ligne"}`;
      const estChoisi = choisi?.type === "module" && choisi.numero === m.numero;
      const choisir = () => { choisi = { type: "module", numero: m.numero, section }; rendre(); };
      let x = place?.x, y = place?.y;
      if (x == null || y == null) {
        const zone = impl.sections.find((s) => s.nom === section)?.zone;
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

  const panneauChoix = (cible: Cible, affectation: ReturnType<typeof lireAffectationCompositions>) => {
    const boite = el("div", "", "choix");
    const actuelle = cible.type === "module" ? affectation.modules[String(cible.numero)] ?? "" : affectation.sections[cible.nom] ?? "";
    let heritage: string;
    if (cible.type === "module") {
      const sansPropre = compositionDuModule({ ...affectation, modules: {} }, cible.numero, cible.section, defautParc);
      heritage = sansPropre.origine === "section" ? `comme sa section (${sansPropre.nom})` : `par défaut (${sansPropre.nom})`;
      boite.append(el("div", `Module ${cible.numero}${cible.section ? ` · ${cible.section}` : ""}`, "titre"));
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
        affecterComposition(cible.type === "module" ? { type: "module", numero: cible.numero } : { type: "section", nom: cible.nom }, valeur);
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
    return boite;
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
        lireJson<{ compositions: string[]; defaut: string }>("/api/compositions"),
      ]);
      impl = { nom: i.nom, sections: i.sections ?? [], modules: i.modules ?? {} };
      modules = m.modules ?? [];
      compositions = c.compositions ?? [];
      defautParc = c.defaut || "skini";
      rendre();
    } catch (erreur) {
      corps.textContent = `Plan indisponible : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
    }
  })();
}
