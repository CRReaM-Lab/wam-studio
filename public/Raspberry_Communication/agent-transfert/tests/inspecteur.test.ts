import { describe, expect, it } from "vitest";
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
