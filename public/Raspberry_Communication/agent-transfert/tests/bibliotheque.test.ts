import { afterEach, describe, expect, it, vi } from "vitest";
import { nomDepuisFichier, nomValide } from "../../Services/RaspberryBibliotheque";
import { lireAffectationBrute } from "../../Services/RaspberryCompositionsStore";
import { evenementsInstruments } from "../../Services/RaspberryLectureServeur";

describe("nom d'un instrument de la bibliothèque", () => {
  it("tiré du nom du fichier : sans extension ni accents, le reste en _", () => {
    expect(nomDepuisFichier("Piano à queue.sf2")).toBe("Piano_a_queue");
    expect(nomDepuisFichier("GeneralUser_GS.sf3")).toBe("GeneralUser_GS");
    expect(nomDepuisFichier("  ../batterie (909).sf2")).toBe("batterie_909");
    expect(nomDepuisFichier("éé.sf2")).toBe("ee");
    expect(nomDepuisFichier("###.sf2")).toBe("instrument");
  });

  it("un nom tiré d'un fichier est toujours accepté par le serveur", () => {
    for (const f of ["Piano à queue.sf2", "../x.sf3", "a".repeat(100) + ".sf2", "-_-.sf2"]) {
      expect(nomValide(nomDepuisFichier(f))).toBe(true);
    }
    expect(nomValide("../x")).toBe(false);
    expect(nomValide("_x")).toBe(false);
  });
});

describe("la SoundFont d'un module, gardée avec le projet", () => {
  it("lue avec le programme ; un nom que le module ne pourrait pas ouvrir est écarté", () => {
    const a = lireAffectationBrute({
      instruments: { "33": { programme: 0, banque: 0, soundfont: "kit-909" }, "34": { programme: 5, banque: 0, soundfont: "../x" } },
    });
    expect(a.instruments["33"]).toEqual({ programme: 0, banque: 0, soundfont: "kit-909" });
    expect(a.instruments["34"]).toEqual({ programme: 5, banque: 0 });
  });
});

describe("au départ de la lecture", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("/soundfont avant /bank et /pgm, rien pour la SoundFont de la fiche", () => {
    const stockage = new Map<string, string>([
      ["wam-compositions-projet", JSON.stringify({ instruments: { "33": { programme: 3, banque: 1, soundfont: "perso" }, "34": { programme: 40, banque: 0 } } })],
    ]);
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => stockage.get(k) ?? null } });
    const ips: Record<number, string> = { 33: "192.168.1.33", 34: "192.168.1.34" };
    const evenements = evenementsInstruments(0, (n) => ips[n]);
    expect(evenements.filter((e) => e.ip === "192.168.1.33").map((e) => `${e.adresse} ${e.valeur}`)).toEqual(["/soundfont perso", "/bank 1", "/pgm 3"]);
    expect(evenements.filter((e) => e.ip === "192.168.1.34").map((e) => `${e.adresse} ${e.valeur}`)).toEqual(["/pgm 40"]);
  });
});
