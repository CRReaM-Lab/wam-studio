/**
 * Les sons d'un kit, avant leur dépôt dans la bibliothèque du serveur (qui ne lit que le WAV) :
 * un WAV passe tel quel, au bit près ; un mp3, ogg, flac… est décodé par le navigateur et réécrit
 * en WAV 16 bits, à la fréquence de décodage.
 */

/** Ce qu'il faut d'un AudioBuffer pour l'écrire (un vrai AudioBuffer convient). */
export type Echantillons = {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(canal: number): Float32Array;
};

/** Un WAV PCM 16 bits, deux canaux au plus. */
export function encoderWav(son: Echantillons): Blob {
  const canaux = Math.min(2, Math.max(1, son.numberOfChannels));
  const octetsDonnees = son.length * canaux * 2;
  const tampon = new ArrayBuffer(44 + octetsDonnees);
  const v = new DataView(tampon);
  const ascii = (position: number, texte: string) => {
    for (let i = 0; i < texte.length; i++) v.setUint8(position + i, texte.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + octetsDonnees, true);
  ascii(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM entier
  v.setUint16(22, canaux, true);
  v.setUint32(24, son.sampleRate, true);
  v.setUint32(28, son.sampleRate * canaux * 2, true);
  v.setUint16(32, canaux * 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, octetsDonnees, true);
  const donnees = Array.from({ length: canaux }, (_, c) => son.getChannelData(c));
  let position = 44;
  for (let n = 0; n < son.length; n++) {
    for (let c = 0; c < canaux; c++) {
      const x = Math.max(-1, Math.min(1, donnees[c][n]));
      v.setInt16(position, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
      position += 2;
    }
  }
  return new Blob([tampon], { type: "audio/wav" });
}

/** Les premiers octets disent-ils un WAV (RIFF … WAVE) ? */
export function estWav(debut: Uint8Array): boolean {
  const texte = (a: number) => String.fromCharCode(...debut.slice(a, a + 4));
  return debut.length >= 12 && texte(0) === "RIFF" && texte(8) === "WAVE";
}

/** Le son prêt à déposer : un WAV tel quel, sinon décodé puis réécrit en WAV. */
export async function enWav(son: Blob, nom: string): Promise<File> {
  const octets = new Uint8Array(await son.arrayBuffer());
  const base = nom.replace(/\.[^.]*$/, "") || "son";
  if (estWav(octets.slice(0, 12))) return new File([octets], `${base}.wav`, { type: "audio/wav" });
  // decodeAudioData rééchantillonne à la fréquence du contexte : 48 kHz, celle des modules.
  const contexte = new OfflineAudioContext(1, 1, 48000);
  const decode = await contexte.decodeAudioData(octets.buffer.slice(0));
  return new File([encoderWav(decode)], `${base}.wav`, { type: "audio/wav" });
}

/**
 * Les notes General MIDI des percussions (canal 10) : de quoi nommer les cases d'un kit.
 */
export const PERCUSSIONS_GM: Record<number, string> = {
  35: "Grosse caisse 2", 36: "Grosse caisse", 37: "Rimshot", 38: "Caisse claire", 39: "Clap",
  40: "Caisse claire 2", 41: "Tom basse grave", 42: "Charley fermé", 43: "Tom basse", 44: "Charley pédale",
  45: "Tom grave", 46: "Charley ouvert", 47: "Tom médium grave", 48: "Tom médium aigu", 49: "Crash",
  50: "Tom aigu", 51: "Ride", 52: "Chinese", 53: "Cloche de ride", 54: "Tambourin", 55: "Splash",
  56: "Cloche", 57: "Crash 2", 58: "Vibraslap", 59: "Ride 2", 60: "Bongo aigu", 61: "Bongo grave",
  62: "Conga aiguë étouffée", 63: "Conga aiguë", 64: "Conga grave", 65: "Timbale aiguë", 66: "Timbale grave",
  67: "Agogo aigu", 68: "Agogo grave", 69: "Cabasa", 70: "Maracas", 75: "Claves", 76: "Wood-block aigu",
  77: "Wood-block grave", 80: "Triangle étouffé", 81: "Triangle",
};

/**
 * Le kit par défaut du drumsampler de WAM (burns-audio) : une 909, servie par burns.ca. Il faut
 * Internet pour l'importer ; ensuite, ses sons sont dans la bibliothèque du serveur.
 */
export const KIT_909: { nom: string; url: string; note: number; groupe?: number }[] = [
  { nom: "Kick", url: "https://burns.ca/static/909/kick.wav", note: 36 },
  { nom: "Rimshot", url: "https://burns.ca/static/909/rimshot.wav", note: 37 },
  { nom: "Snare", url: "https://burns.ca/static/909/snare.wav", note: 38 },
  { nom: "Clap", url: "https://burns.ca/static/909/clap.wav", note: 39 },
  { nom: "Low Tom", url: "https://burns.ca/static/909/low_tom.wav", note: 41 },
  { nom: "CH", url: "https://burns.ca/static/909/ch.wav", note: 42, groupe: 1 },
  { nom: "High Tom", url: "https://burns.ca/static/909/hi_tom.wav", note: 43 },
  { nom: "OH", url: "https://burns.ca/static/909/oh.wav", note: 46, groupe: 1 },
  { nom: "Mid Tom", url: "https://burns.ca/static/909/mid_tom.wav", note: 47 },
  { nom: "Crash", url: "https://burns.ca/static/909/crash.wav", note: 49 },
  { nom: "Ride", url: "https://burns.ca/static/909/ride.wav", note: 51 },
];
