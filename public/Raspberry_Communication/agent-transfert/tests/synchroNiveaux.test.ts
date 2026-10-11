import { describe, expect, it } from "vitest";
import { messagesGeneral, niveauModule, niveauxParModule } from "../../Services/RaspberrySynchroNiveaux";
import { lireAffectationBrute } from "../../Services/RaspberryCompositionsStore";
import { creerBinding } from "../../Models/RaspberryTrackBinding";

describe("niveaux des modules depuis les faders de piste", () => {
  it("rien tant que le fader n'a pas été touché", () => {
    expect(niveauModule(creerBinding(1, "192.168.1.33", 33, 1))).toBeNull();
  });

  it("le niveau retenu, 0 si la piste est coupée, rien si elle est déliée", () => {
    const b = { ...creerBinding(1, "192.168.1.33", 33, 1), niveau: 88 };
    expect(niveauModule(b)).toBe(88);
    expect(niveauModule({ ...b, muet: true })).toBe(0);
    expect(niveauModule({ ...b, liee: false })).toBeNull();
  });

  it("une valeur par module : la première piste touchée", () => {
    const niveaux = niveauxParModule([
      creerBinding(1, "192.168.1.33", 33, 1),
      { ...creerBinding(2, "192.168.1.33", 33, 2), niveau: 90 },
      { ...creerBinding(3, "192.168.1.33", 33, 3), niveau: 70 },
      { ...creerBinding(4, "192.168.1.34", 34, 1), niveau: 100, muet: true },
    ]);
    expect([...niveaux]).toEqual([["192.168.1.33", 90], ["192.168.1.34", 0]]);
  });
});

describe("master de WAM vers tous les modules", () => {
  it("rien tant que le master n'a pas été touché", () => {
    expect(messagesGeneral(undefined)).toEqual([]);
    expect(messagesGeneral({})).toEqual([]);
  });

  it("/volume pour le niveau, /mute pour le M", () => {
    expect(messagesGeneral({ niveau: 94 })).toEqual([{ adresse: "/volume", valeur: "94" }]);
    expect(messagesGeneral({ niveau: 94, muet: true })).toEqual([
      { adresse: "/volume", valeur: "94" },
      { adresse: "/mute", valeur: "1" },
    ]);
    expect(messagesGeneral({ muet: false })).toEqual([{ adresse: "/mute", valeur: "0" }]);
  });

  it("gardé avec le projet, relu tel quel", () => {
    expect(lireAffectationBrute({ general: { niveau: 90, muet: true } }).general).toEqual({ niveau: 90, muet: true });
    expect(lireAffectationBrute({ general: { niveau: 300 } }).general).toEqual({ niveau: 127 });
    expect(lireAffectationBrute({}).general).toBeUndefined();
  });
});
