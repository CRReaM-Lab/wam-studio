import { describe, expect, it } from "vitest";
import { encoderWav, estWav, KIT_909, PERCUSSIONS_GM } from "../../Services/RaspberrySons";
import { lireResultats, nomLicence } from "../../Services/RaspberryFreesound";

describe("un son décodé réécrit en WAV", () => {
  it("en-tête PCM 16 bits, deux canaux au plus, valeurs bornées", async () => {
    const g = new Float32Array([0, 0.5, -1, 1.5]);
    const d = new Float32Array([1, -0.5, 0, -2]);
    const wav = encoderWav({ numberOfChannels: 3, sampleRate: 48000, length: 4, getChannelData: (c) => (c === 0 ? g : d) });
    const v = new DataView(await wav.arrayBuffer());
    const texte = (a: number) => String.fromCharCode(...new Uint8Array(v.buffer, a, 4));
    expect([texte(0), texte(8), texte(12), texte(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(16);
    const ech = Array.from({ length: 8 }, (_, i) => v.getInt16(44 + 2 * i, true));
    expect(ech).toEqual([0, 32767, 16384, -16384, -32768, 0, 32767, -32768]);
    expect(estWav(new Uint8Array(await wav.arrayBuffer()).slice(0, 12))).toBe(true);
    expect(estWav(new TextEncoder().encode("ID3........."))).toBe(false);
  });
});

describe("le kit 909 du drumsampler", () => {
  it("une note par son, charleston fermé et ouvert dans le même groupe", () => {
    expect(new Set(KIT_909.map((s) => s.note)).size).toBe(KIT_909.length);
    expect(KIT_909.find((s) => s.nom === "CH")?.groupe).toBe(KIT_909.find((s) => s.nom === "OH")?.groupe);
    expect(PERCUSSIONS_GM[36]).toBe("Grosse caisse");
  });
});

describe("freesound", () => {
  it("les licences en clair", () => {
    expect(nomLicence("http://creativecommons.org/licenses/by/4.0/")).toBe("CC BY 4.0");
    expect(nomLicence("https://creativecommons.org/licenses/by-nc/3.0/")).toBe("CC BY-NC 3.0");
    expect(nomLicence("http://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0");
  });

  it("une réponse de recherche en sons ; un son sans aperçu est écarté", () => {
    const r = lireResultats({
      count: 42,
      results: [
        { id: 1, name: "kick", username: "a", license: "x", duration: 0.5, url: "u", previews: { "preview-hq-mp3": "https://cdn/1.mp3" } },
        { id: 2, name: "sans", previews: {} },
      ],
    });
    expect(r.total).toBe(42);
    expect(r.sons).toEqual([{ id: 1, nom: "kick", auteur: "a", licence: "x", duree: 0.5, url: "u", apercu: "https://cdn/1.mp3" }]);
  });
});
