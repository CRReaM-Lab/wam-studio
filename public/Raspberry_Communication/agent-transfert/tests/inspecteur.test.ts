import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
import { ongletsInspecteur, pasParametre, texteValeur } from "../../Views/RaspberryInspecteur";

describe("l'inspecteur de la piste", () => {
  it("les onglets suivent le signal : instrument, une pédale par onglet, sortie, MIDI", () => {
    const o = ongletsInspecteur([{ nom: "Greyhole", objetPd: "greyhole" }, { nom: "KBVerb", objetPd: null }]);
    expect(o.map((x) => x.cle)).toEqual(["instrument", "effet-0", "effet-1", "sortie", "midi"]);
    expect(o[1].libelle).toBe("1 · Greyhole");
    expect(o[2].sansEquivalent).toBe(true);
  });

  it("le pas d'un curseur et la valeur affichée", () => {
    expect(pasParametre({ min: 0, max: 1, discret: false })).toBeCloseTo(0.005);
    expect(pasParametre({ min: 0, max: 99, discret: true })).toBe(1);
    expect(texteValeur(0.123456)).toBe("0.12");
    expect(texteValeur(12.34)).toBe("12.3");
    expect(texteValeur(440)).toBe("440");
  });
});

describe("les noms courts des paramètres d'une pédale", () => {
  it("le plus court suffixe unique", async () => {
    const { nomsCourts } = await import("../../Views/RaspberryInspecteur");
    expect(nomsCourts(["/greyhole/Greyhole/Dry/Wet", "/greyhole/Greyhole/size", "/greyhole/bypass"])).toEqual(["Wet", "size", "bypass"]);
    expect(nomsCourts(["/c/3-gain/Makeup_Gain", "/c/Ratio"])).toEqual(["Makeup_Gain", "Ratio"]);
    expect(nomsCourts(["/s/a/level", "/s/b/level"])).toEqual(["a/level", "b/level"]);
    expect(nomsCourts(["Wet", "Dry"])).toEqual(["Wet", "Dry"]);
    expect(nomsCourts(["/sweetwah/freq"])).toEqual(["freq"]);
  });
});

describe("les réglages des instruments", () => {
  it("rangés par groupe Faust, ou par le premier mot du libellé (Cmajor)", async () => {
    const { groupesParametres } = await import("../../Views/RaspberryInspecteur");
    const p = (nom: string, libelle: string, groupe: string) =>
      ({ nom, libelle, groupe, genre: "curseur" as const, min: 0, max: 1, init: 0, pas: 0.01, choix: [] });
    expect(groupesParametres([p("/J/MAIN/VCF/FREQ", "FREQ", "MAIN/VCF"), p("/J/MAIN/ENV/A", "A", "MAIN/ENV"), p("/J/MAIN/VCF/RES", "RES", "MAIN/VCF")])
      .map((g) => [g.groupe, g.parametres.length])).toEqual([["VCF", 2], ["ENV", 1]]);
    expect(groupesParametres([p("FilterCutoff", "Filter Cutoff", ""), p("DelayTime", "Delay Effect Time", "")]).map((g) => g.groupe)).toEqual(["Filter", "Delay"]);
  });

  it("gardés avec le projet, sans nom à espace, et renvoyés après /instrument à la lecture", async () => {
    const store = await import("../../Services/RaspberryCompositionsStore");
    const a = store.lireAffectationBrute({ synthes: { "33": "juno6v2" }, reglagesSynthes: { "33": { juno6v2: { "/JUNO6v2/MAIN/VCF/FREQ": 0.6, "a b": 1, x: "y" } }, nope: {} } });
    expect(a.reglagesSynthes).toEqual({ "33": { juno6v2: { "/JUNO6v2/MAIN/VCF/FREQ": 0.6 } } });
    const stockage = new Map([["wam-compositions-projet", JSON.stringify(a)]]);
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => stockage.get(k) ?? null } });
    const { evenementsInstruments } = await import("../../Services/RaspberryLectureServeur");
    expect(evenementsInstruments(0, () => "192.168.1.33").map((e) => `${e.adresse} ${e.valeur}`)).toEqual([
      "/instrument juno6v2",
      "/synth tous /JUNO6v2/MAIN/VCF/FREQ 0.6",
    ]);
  });
});
