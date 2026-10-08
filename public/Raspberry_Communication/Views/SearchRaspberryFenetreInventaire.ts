import { monterFenetre } from "./PanneauPiSon";
/**
 * Fenêtre « Inventaire » : les sons présents sur chaque Pi son, composition par composition,
 * avec leur format, ce que Pd jouera mal (fréquence, canaux), et les écarts entre Pi.
 * Les données viennent du serveur (`GET <agent>/inventaire`) ; « Relire » le fait repasser.
 */
const ID_OVERLAY = "raspberry-inventaire-overlay";

export type SonInventaire = {
  fichier: string;
  taille: number;
  empreinte: string;
  ok: boolean;
  erreur: string;
  canaux: number;
  frequence: number;
  bits: number;
  duree: number;
  avertissements: string[];
  /** La fiche du son (`sonN.json` sur le Pi) : origine, effets appliqués ; null : inconnue. */
  fiche?: { origine?: string; effets?: { nom: string; wamId: string }[] } | null;
};

export type PiInventaire = {
  ip: string;
  ageMs: number;
  erreur: string;
  frequencePd: number;
  compositions: { nom: string; sons: SonInventaire[] }[];
};

export type EcartInventaire = {
  composition: string;
  fichier: string;
  absentSur: string[];
  variantes: { empreinte: string; pis: string[] }[];
};

export type Inventaire = { pis: PiInventaire[]; ecarts: EcartInventaire[] };

export type ResultatInventaire = { ok: true; inventaire: Inventaire } | { ok: false; error: string };

const ORANGE = "#ffc46b";
const ROUGE = "#ff9b9b";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  texte = "",
  style: Partial<CSSStyleDeclaration> = {}
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (texte) e.innerText = texte;
  Object.assign(e.style, style);
  return e;
}

function age(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `lu il y a ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `lu il y a ${m} min` : `lu il y a ${Math.round(m / 60)} h`;
}

function format(son: SonInventaire): string {
  if (!son.ok) return "illisible";
  const canaux = son.canaux === 1 ? "mono" : son.canaux === 2 ? "stéréo" : `${son.canaux} canaux`;
  return `${canaux}, ${son.frequence} Hz, ${son.bits} bits`;
}

export function ouvrirFenetreInventaire(params: {
  /** Les Pi connus de WAM (pour montrer aussi ceux pas encore lus). */
  pisConnus: { ip: string; nom: string; enLigne: boolean }[];
  charger: () => Promise<ResultatInventaire>;
  /** Relit un Pi, ou tous si `ip` est absent. */
  relire: (ip?: string) => Promise<ResultatInventaire>;
}): void {
  document.getElementById(ID_OVERLAY)?.remove();
  const overlay = el("div", "", {
    position: "fixed",
    inset: "0",
    background: "rgba(0, 0, 0, 0.45)",
    zIndex: "2000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });
  overlay.id = ID_OVERLAY;
  const modal = el("div", "", {
    background: "#1f252b",
    color: "#f1f1f1",
    padding: "20px",
    border: "1px solid #3b4046",
    borderRadius: "8px",
    width: "720px",
    maxWidth: "95vw",
    maxHeight: "85vh",
    overflow: "auto",
    fontSize: "13px",
  });
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const entete = el("div", "", { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" });
  const titre = el("h3", "Inventaire des sons", { margin: "0", flex: "1" });
  const relireTout = el("button", "Relire tout");
  relireTout.className = "btn btn-sm btn-secondary";
  const fermer = el("button", "Fermer");
  fermer.className = "btn btn-sm btn-secondary";
  fermer.onclick = () => overlay.remove();
  entete.append(titre, relireTout, fermer);
  modal.appendChild(entete);
  modal.appendChild(
    el(
      "div",
      "Les sons de chaque composition sur chaque Pi, lus par le serveur quand un Pi se déclare et après chaque envoi. « Relire » refait la lecture (fichiers copiés à la main, mise à jour de modulePre…).",
      { fontSize: "12px", opacity: "0.8", marginBottom: "12px" }
    )
  );
  const corps = el("div");
  modal.appendChild(corps);

  const rendre = (resultat: ResultatInventaire) => {
    corps.replaceChildren();
    if (!resultat.ok) {
      corps.appendChild(el("div", `Inventaire indisponible : ${resultat.error}`, { color: ROUGE }));
      return;
    }
    const { pis, ecarts } = resultat.inventaire;

    // Les écarts entre Pi d'abord : c'est ce qui empêche une pièce d'être jouée partout pareil.
    const blocEcarts = el("div", "", { marginBottom: "14px" });
    blocEcarts.appendChild(el("div", "Écarts entre Pi", { fontWeight: "bold", marginBottom: "4px" }));
    if (ecarts.length === 0) {
      blocEcarts.appendChild(el("div", pis.length > 1 ? "Aucun : les Pi lus ont les mêmes sons." : "Un seul Pi lu : rien à comparer.", { opacity: "0.8" }));
    }
    for (const ecart of ecarts) {
      const morceaux = [`${ecart.composition}/${ecart.fichier}`];
      if (ecart.absentSur.length > 0) morceaux.push(`absent sur ${ecart.absentSur.join(", ")}`);
      if (ecart.variantes.length > 1) {
        morceaux.push(`contenus différents : ${ecart.variantes.map((v) => v.pis.join(", ")).join(" | ")}`);
      }
      blocEcarts.appendChild(el("div", morceaux.join(" — "), { color: ORANGE }));
    }
    corps.appendChild(blocEcarts);

    const parIp = new Map(pis.map((pi) => [pi.ip, pi]));
    const ips = [...new Set([...params.pisConnus.map((p) => p.ip), ...pis.map((p) => p.ip)])];
    for (const ip of ips) {
      const pi = parIp.get(ip);
      const connu = params.pisConnus.find((p) => p.ip === ip);
      const bloc = el("details", "", { borderTop: "1px solid #3b4046", padding: "6px 0" });
      const resume = el("summary", "", { cursor: "pointer" });
      const sons = pi?.compositions.flatMap((c) => c.sons) ?? [];
      const avertis = sons.filter((s) => s.avertissements.length > 0).length;
      const nom = connu ? `${connu.nom} (${ip})` : ip;
      const etat = !pi
        ? "pas encore lu"
        : pi.erreur
          ? pi.erreur
          : `Pd ${pi.frequencePd || "?"} Hz · ${sons.length} sons${avertis ? ` · ${avertis} avertissement(s)` : ""} · ${age(pi.ageMs)}`;
      resume.appendChild(el("span", `${nom} — `));
      resume.appendChild(el("span", etat, { color: pi?.erreur ? ROUGE : avertis ? ORANGE : "" }));
      const relirePi = el("button", "Relire", { marginLeft: "8px" });
      relirePi.className = "btn btn-sm btn-outline-secondary";
      relirePi.onclick = async (e) => {
        e.preventDefault();
        relirePi.disabled = true;
        relirePi.innerText = "Lecture…";
        rendre(await params.relire(ip));
      };
      resume.appendChild(relirePi);
      bloc.appendChild(resume);

      for (const composition of pi?.compositions ?? []) {
        const avertisCompo = composition.sons.filter((s) => s.avertissements.length > 0).length;
        const blocCompo = el("details", "", { margin: "4px 0 4px 16px" });
        blocCompo.appendChild(
          el(
            "summary",
            `${composition.nom} — ${composition.sons.length} sons${avertisCompo ? ` (${avertisCompo} avertis)` : ""}`,
            { cursor: "pointer", color: avertisCompo ? ORANGE : "" }
          )
        );
        const table = el("table", "", { width: "100%", fontSize: "12px", marginTop: "4px", borderCollapse: "collapse" });
        for (const son of composition.sons) {
          const ligne = el("tr");
          const couleur = !son.ok ? ROUGE : son.avertissements.length ? ORANGE : "";
          ligne.append(
            el("td", son.fichier, { padding: "1px 6px" }),
            el("td", format(son), { padding: "1px 6px", opacity: "0.85" }),
            el("td", son.ok ? `${son.duree.toFixed(2)} s` : "", { padding: "1px 6px", textAlign: "right" }),
            el("td", son.avertissements.join(" ; "), { padding: "1px 6px", color: couleur })
          );
          table.appendChild(ligne);
        }
        blocCompo.appendChild(table);
        bloc.appendChild(blocCompo);
      }
      corps.appendChild(bloc);
    }
  };

  relireTout.onclick = async () => {
    relireTout.disabled = true;
    relireTout.innerText = "Lecture…";
    rendre(await params.relire());
    relireTout.disabled = false;
    relireTout.innerText = "Relire tout";
  };

  corps.appendChild(el("div", "Chargement…", { opacity: "0.8" }));
  monterFenetre(overlay);
  void params.charger().then(rendre);
}
