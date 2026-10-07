/**
 * L'aperçu d'un son analysé par le serveur (POST <agent>/analyse) : ce que le haut-parleur du
 * module pré jouera mal (il coupe sous 80 Hz), les mauvais découpages, et deux vues dessinées
 * depuis la même grille fréquences × temps :
 *  - la forme d'onde colorée par les fréquences (grave orangé, médium jaune-vert, aigu
 *    bleu-cyan), la part sous la coupure en gris ;
 *  - le spectrogramme en bandes logarithmiques, la zone sous la coupure voilée.
 */
export type AnalyseSon = {
  empreinte: string;
  duree: number;
  canaux: number;
  frequence: number;
  bits: number;
  crete: number;
  rmsDb: number;
  sousCoupure: number;
  coupureHz: number;
  departDb: number;
  finDb: number;
  satures: number;
  nbBandes: number;
  pasMs: number;
  colonnes: number;
  bornes: number[];
  /** colonnes × bandes, un octet par case (0 = -90 dBFS, 255 = 0 dBFS), en base64 */
  grille: string;
  /** crête par colonne (0-255), en base64 */
  formeOnde: string;
  avertissements: string[];
};

export type ResultatAnalyse = { ok: true; analyse: AnalyseSon } | { ok: false; error: string };

type Grille = { cases: Uint8Array; onde: Uint8Array };
const grilles = new WeakMap<AnalyseSon, Grille>();

function decoder(analyse: AnalyseSon): Grille {
  const connue = grilles.get(analyse);
  if (connue) return connue;
  const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const g = { cases: b64(analyse.grille), onde: b64(analyse.formeOnde) };
  grilles.set(analyse, g);
  return g;
}

/** Énergie linéaire d'une case (l'octet code -90…0 dB). */
function energie(octet: number): number {
  return Math.pow(10, ((octet / 255) * 90 - 90) / 10);
}

/** Un canvas net sur écran haute densité. */
function preparer(canvas: HTMLCanvasElement, largeur: number, hauteur: number): CanvasRenderingContext2D {
  const r = window.devicePixelRatio || 1;
  canvas.width = Math.round(largeur * r);
  canvas.height = Math.round(hauteur * r);
  canvas.style.width = `${largeur}px`;
  canvas.style.height = `${hauteur}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(r, r);
  return ctx;
}

/** La forme d'onde colorée par les fréquences ; la part sous la coupure en gris. */
export function dessinerFormeOnde(canvas: HTMLCanvasElement, analyse: AnalyseSon, largeur = 180, hauteur = 30): void {
  const ctx = preparer(canvas, largeur, hauteur);
  const { cases, onde } = decoder(analyse);
  const nb = analyse.nbBandes;
  const milieu = hauteur / 2;
  ctx.clearRect(0, 0, largeur, hauteur);
  for (let x = 0; x < largeur; x++) {
    const c = Math.min(analyse.colonnes - 1, Math.floor((x / largeur) * analyse.colonnes));
    if (c < 0) break;
    let sous = 0, grave = 0, medium = 0, aigu = 0;
    for (let b = 0; b < nb; b++) {
      const e = energie(cases[c * nb + b]);
      const centre = Math.sqrt(analyse.bornes[b] * analyse.bornes[b + 1]);
      if (centre < analyse.coupureHz) sous += e;
      else if (centre < 250) grave += e;
      else if (centre < 2500) medium += e;
      else aigu += e;
    }
    const total = sous + grave + medium + aigu || 1;
    const amplitude = (onde[c] / 255) * milieu;
    // Couleur : mélange orangé / jaune-vert / bleu-cyan selon où est l'énergie audible.
    const audible = grave + medium + aigu || 1;
    const r = Math.round((grave * 245 + medium * 200 + aigu * 70) / audible);
    const v = Math.round((grave * 120 + medium * 215 + aigu * 190) / audible);
    const bl = Math.round((grave * 40 + medium * 60 + aigu * 245) / audible);
    const partSous = sous / total;
    ctx.fillStyle = `rgb(${r},${v},${bl})`;
    ctx.fillRect(x, milieu - amplitude, 1, amplitude * 2);
    if (partSous > 0.02) {
      // Le gris au cœur de la barre : ce que le haut-parleur ne jouera pas.
      const h = amplitude * partSous;
      ctx.fillStyle = "rgba(150,150,150,0.85)";
      ctx.fillRect(x, milieu - h, 1, h * 2);
    }
  }
}

/** Dégradé perceptuellement régulier, sombre → violet → orange → jaune pâle (genre « magma »). */
function couleurMagma(t: number): string {
  const arrets = [
    [0.0, 8, 6, 30], [0.25, 80, 18, 123], [0.5, 182, 54, 121],
    [0.75, 251, 136, 97], [1.0, 252, 253, 191],
  ];
  const v = Math.min(1, Math.max(0, t));
  for (let i = 1; i < arrets.length; i++) {
    const [t1, r1, g1, b1] = arrets[i];
    const [t0, r0, g0, b0] = arrets[i - 1];
    if (v <= t1) {
      const k = (v - t0) / (t1 - t0);
      return `rgb(${Math.round(r0 + (r1 - r0) * k)},${Math.round(g0 + (g1 - g0) * k)},${Math.round(b0 + (b1 - b0) * k)})`;
    }
  }
  return "rgb(252,253,191)";
}

/** Le spectrogramme : temps en largeur, bandes logarithmiques en hauteur, intensité en couleur. */
export function dessinerSpectrogramme(canvas: HTMLCanvasElement, analyse: AnalyseSon, largeur = 560, hauteur = 150): void {
  const ctx = preparer(canvas, largeur, hauteur);
  const { cases } = decoder(analyse);
  const nb = analyse.nbBandes;
  const hBande = hauteur / nb;
  // Contraste : du plancher à la case la plus forte du son.
  let max = 1;
  for (let i = 0; i < cases.length; i++) max = Math.max(max, cases[i]);
  const plancher = Math.max(0, max - 170);
  for (let x = 0; x < largeur; x++) {
    const c = Math.min(analyse.colonnes - 1, Math.floor((x / largeur) * analyse.colonnes));
    for (let b = 0; b < nb; b++) {
      ctx.fillStyle = couleurMagma((cases[c * nb + b] - plancher) / (max - plancher));
      ctx.fillRect(x, hauteur - (b + 1) * hBande, 1, Math.ceil(hBande));
    }
  }
  // La zone sous la coupure du module : voilée et hachurée.
  const bCoupure = analyse.bornes.findIndex((f) => f >= analyse.coupureHz);
  if (bCoupure > 0) {
    const y = hauteur - bCoupure * hBande;
    ctx.fillStyle = "rgba(20,20,20,0.55)";
    ctx.fillRect(0, y, largeur, hauteur - y);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    for (let x = -hauteur; x < largeur; x += 8) {
      ctx.moveTo(x, hauteur);
      ctx.lineTo(x + (hauteur - y), y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(largeur, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "10px sans-serif";
    ctx.fillText(`coupure du module, ${analyse.coupureHz} Hz`, 4, y - 3);
  }
  // Les bords brusques : un trait rouge.
  ctx.fillStyle = "#ff5c5c";
  if (analyse.departDb > -40) ctx.fillRect(0, 0, 2, hauteur);
  if (analyse.finDb > -40) ctx.fillRect(largeur - 2, 0, 2, hauteur);
  // Repères de fréquence.
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "9px sans-serif";
  for (const f of [100, 1000, 10000]) {
    const b = analyse.bornes.findIndex((x) => x >= f);
    if (b > 0) ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, largeur - 22, hauteur - b * hBande + 3);
  }
}

/** Une ligne de chiffres : durée, format, niveau, part sous la coupure. */
export function resumerAnalyse(a: AnalyseSon): string {
  const canaux = a.canaux === 1 ? "mono" : a.canaux === 2 ? "stéréo" : `${a.canaux} canaux`;
  return `${a.duree.toFixed(2)} s · ${canaux} ${a.frequence} Hz ${a.bits} bits · RMS ${a.rmsDb} dB · ` +
    `${Math.round(a.sousCoupure * 100)} % sous ${a.coupureHz} Hz`;
}
