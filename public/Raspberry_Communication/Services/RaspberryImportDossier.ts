/**
 * Un dossier entier vers la bibliothèque du serveur : les SoundFonts (`.sf2`, `.sf3`) telles
 * quelles, chaque SFZ avec les sons qu'il nomme (converti par le serveur), et les sons qui
 * restent, regroupés par dossier, en kits dont les notes sont devinées d'après les noms.
 */

const EXTENSIONS_SON = /\.(wav|wave|aif|aiff|mp3|ogg|oga|flac|m4a)$/i;

/** Un chemin dans le dossier choisi (`webkitRelativePath`, ou le nom seul). */
export function cheminDe(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
}

/** Comme le serveur (Sfz.normaliser) : `/`, sans `./`, `..` résolus, en minuscules. */
export function normaliser(chemin: string): string {
  const parties: string[] = [];
  for (const p of chemin.replace(/\\/g, "/").split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") parties.pop();
    else parties.push(p);
  }
  return parties.join("/").toLowerCase();
}

function dossierDe(chemin: string): string {
  const i = chemin.lastIndexOf("/");
  return i < 0 ? "" : chemin.slice(0, i);
}

/**
 * Les sons qu'un SFZ nomme (`sample=`), relatifs à son dossier, `default_path` et `#define`
 * appliqués, normalisés. Les sons générés (`*sine`…) n'en sont pas.
 */
export function sonsDuSfz(texte: string): string[] {
  const sansCommentaires = texte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, " ");
  const variables = new Map<string, string>();
  for (const m of sansCommentaires.matchAll(/#define\s+(\$\w+)\s+(\S+)/g)) variables.set(m[1], m[2]);
  let corps = sansCommentaires.replace(/#define\s+\$\w+\s+\S+/g, " ");
  for (const k of [...variables.keys()].sort((a, b) => b.length - a.length)) corps = corps.split(k).join(variables.get(k)!);
  const valeur = (nom: string) =>
    [...corps.matchAll(new RegExp(`(?:^|\\s)${nom}=(.*?)(?=\\s+[A-Za-z0-9_]+=|\\s*<|\\s*$)`, "gs"))].map((m) => m[1].trim());
  const dossier = valeur("default_path")[0] ?? "";
  return [...new Set(valeur("sample").filter((s) => !s.startsWith("*")).map((s) => normaliser(`${dossier}/${s}`)))];
}

/** Une note d'après un nom de fichier, ou null : un mot connu, un nom de note, un numéro en tête. */
export function noteDepuisNom(nomFichier: string): number | null {
  const base = nomFichier.replace(/\.[^.]*$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const mots = base.split(/[^a-z0-9#]+/).filter(Boolean);
  const a = (...m: string[]) => mots.some((x) => m.includes(x)) || m.some((x) => x.length > 3 && base.includes(x));
  // Les mots d'abord : un « 01 Kick » est une grosse caisse, pas la note 1.
  if (a("kick", "bd", "bassdrum", "kik", "grosse")) return 36;
  if (a("rim", "rimshot", "rs", "sidestick")) return 37;
  if (a("snare", "sd", "sn", "caisse")) return 38;
  if (a("clap", "cp", "handclap")) return 39;
  const charley = a("hh", "hihat", "hat", "hats", "charley", "hihats");
  if (a("oh", "ohh", "openhat", "hho") || (charley && a("open", "ouvert"))) return 46;
  if (a("ph", "pedalhat", "phh") || (charley && a("pedal", "pied"))) return 44;
  if (a("ch", "chh", "closedhat", "hhc") || charley) return 42;
  const tom = a("tom", "toms", "floortom");
  if (a("lt", "lowtom") || (tom && a("low", "lo", "floor", "grave", "1"))) return 41;
  if (a("ht", "hightom", "hitom") || (tom && a("high", "hi", "aigu", "3"))) return 50;
  if (a("mt", "midtom") || (tom && a("mid", "medium", "2"))) return 47;
  if (tom) return 45;
  if (a("crash", "cr", "cymbal", "cym")) return 49;
  if (a("ride", "rd")) return 51;
  if (a("splash")) return 55;
  if (a("china", "chinese")) return 52;
  if (a("cowbell", "cb", "cloche")) return 56;
  if (a("tamb", "tambourine", "tambourin")) return 54;
  if (a("shaker", "maracas", "sh")) return 70;
  if (a("clave", "claves", "cl")) return 75;
  if (a("conga")) return 63;
  if (a("bongo")) return 60;
  // Un nom de note (convention SFZ : c4 = 60).
  for (const m of mots) {
    const n = /^([a-g])(#|b)?(-?\d)$/.exec(m);
    if (n) {
      const degre = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[n[1] as "c"];
      const note = degre + (n[2] === "#" ? 1 : n[2] === "b" ? -1 : 0) + 12 * (Number(n[3]) + 1);
      if (note >= 0 && note <= 127) return note;
    }
  }
  const tete = /^(\d{2,3})(?!\d)/.exec(base);
  if (tete && Number(tete[1]) >= 21 && Number(tete[1]) <= 127) return Number(tete[1]);
  return null;
}

/**
 * Les notes d'un kit : celle devinée pour chaque son, sinon (ou si elle est prise) la suivante
 * libre à partir de 36. Dans l'ordre des noms.
 */
export function notesDuKit(noms: string[]): number[] {
  const prises = new Set<number>();
  const notes: number[] = new Array(noms.length);
  const libre = (depart: number) => {
    let n = depart;
    while (prises.has(n) && n < 127) n += 1;
    return n;
  };
  // D'abord les sons dont la note est devinée, pour qu'ils l'aient avant les autres.
  noms.forEach((nom, i) => {
    const n = noteDepuisNom(nom);
    if (n !== null && !prises.has(n)) {
      notes[i] = n;
      prises.add(n);
    }
  });
  noms.forEach((_, i) => {
    if (notes[i] !== undefined) return;
    const n = libre(36);
    notes[i] = n;
    prises.add(n);
  });
  return notes;
}

export type PlanImport = {
  soundfonts: File[];
  /** Chaque SFZ, avec les sons qu'il nomme (chemin relatif à son dossier → fichier) et ceux qui manquent. */
  sfz: { fichier: File; sons: { chemin: string; fichier: File }[]; manquants: string[] }[];
  /** Les sons qu'aucun SFZ ne nomme, par dossier : un kit chacun. */
  kits: { dossier: string; sons: File[] }[];
};

/** Ce que deviendront les fichiers d'un dossier. */
export async function planifier(fichiers: File[]): Promise<PlanImport> {
  const parChemin = new Map(fichiers.map((f) => [normaliser(cheminDe(f)), f]));
  const pris = new Set<string>();
  const soundfonts = fichiers.filter((f) => /\.sf[23]$/i.test(f.name));
  const sfz: PlanImport["sfz"] = [];
  for (const f of fichiers.filter((x) => /\.sfz$/i.test(x.name))) {
    const dossier = dossierDe(normaliser(cheminDe(f)));
    const sons: { chemin: string; fichier: File }[] = [];
    const manquants: string[] = [];
    for (const relatif of sonsDuSfz(await f.text())) {
      const complet = normaliser(dossier ? `${dossier}/${relatif}` : relatif);
      const son = parChemin.get(complet);
      if (son) {
        sons.push({ chemin: relatif, fichier: son });
        pris.add(complet);
      } else manquants.push(relatif);
    }
    sfz.push({ fichier: f, sons, manquants });
  }
  const parDossier = new Map<string, File[]>();
  for (const f of fichiers) {
    const chemin = normaliser(cheminDe(f));
    if (!EXTENSIONS_SON.test(f.name) || pris.has(chemin)) continue;
    const d = dossierDe(cheminDe(f));
    parDossier.set(d, [...(parDossier.get(d) ?? []), f]);
  }
  const kits = [...parDossier].map(([dossier, sons]) => ({ dossier, sons: sons.sort((a, b) => a.name.localeCompare(b.name)) }));
  return { soundfonts, sfz, kits };
}
