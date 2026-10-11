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

describe("le marqueur gagne pendant la lecture", () => {
  it("hors lecture : renvoi toutes les 10 s ; en lecture : seulement un geste", async () => {
    const { vi } = await import("vitest");
    const { demarrerSynchroNiveaux } = await import("../../Services/RaspberrySynchroNiveaux");
    vi.useFakeTimers();
    (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
    const b = { ...creerBinding(1, "192.168.1.33", 33, 1), niveau: 90 };
    let lecture = false;
    const envois: string[] = [];
    demarrerSynchroNiveaux({
      liaisons: () => [b],
      general: () => undefined,
      modulesEnLigne: () => ["192.168.1.33"],
      envoyer: (ip, adresse, valeur) => (envois.push(`${adresse} ${valeur}`), true),
      enLecture: () => lecture,
    });
    vi.advanceTimersByTime(150);
    expect(envois).toEqual(["/level 90"]);
    vi.advanceTimersByTime(10_100);
    expect(envois).toEqual(["/level 90", "/level 90"]);
    lecture = true;
    vi.advanceTimersByTime(20_000);
    expect(envois.length).toBe(2);
    b.niveau = 80;
    vi.advanceTimersByTime(150);
    expect(envois.at(-1)).toBe("/level 80");
    vi.useRealTimers();
  });
});
