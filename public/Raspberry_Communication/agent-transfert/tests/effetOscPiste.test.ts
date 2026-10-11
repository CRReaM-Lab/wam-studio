import { describe, expect, it } from "vitest";
import { gainOscVersVolumePiste, volumePisteVersNiveauPd } from "../../utils/osc/CommandesOscMarqueur";
import { effetOscVersPiste } from "../../utils/osc/EffetOscPiste";

describe("effetOscVersPiste", () => {
  it("traduit /level en volume WAM (dbtorms : 100 = 0 dB, 0 = silence)", () => {
    expect(effetOscVersPiste("/level", "0")).toEqual({ type: "volume", volume01: 0 });
    expect(effetOscVersPiste("/level", "100")).toEqual({ type: "volume", volume01: 1 });
    expect(effetOscVersPiste("/level", "104")).toEqual({ type: "volume", volume01: 1 });
    expect(gainOscVersVolumePiste("80")).toBeCloseTo(0.1, 5);
  });

  it("traduit le volume WAM en niveau Pd, aller-retour", () => {
    expect(volumePisteVersNiveauPd(1)).toBe(100);
    expect(volumePisteVersNiveauPd(0.1)).toBe(80);
    expect(volumePisteVersNiveauPd(0)).toBe(0);
    expect(volumePisteVersNiveauPd(0.5)).toBe(94);
    expect(gainOscVersVolumePiste(String(volumePisteVersNiveauPd(0.3)))).toBeCloseTo(0.3, 2);
  });

  it("traduit /stop et /stop -1 en mute", () => {
    expect(effetOscVersPiste("/stop", "1")).toEqual({ type: "mute", mute: true, son: 1 });
    expect(effetOscVersPiste("/stop", "-1")).toEqual({ type: "mute", mute: true });
    expect(effetOscVersPiste("/stop", "1 4000")).toEqual({
      type: "fade-mute",
      dureeMs: 4000,
      son: 1,
    });
  });

  it("traduit /play et /attenuation en volume d'un son", () => {
    expect(effetOscVersPiste("/play", "1 90")).toEqual({
      type: "volume",
      volume01: Math.pow(10, -10 / 20),
      son: 1,
    });
    expect(effetOscVersPiste("/attenuation", "1 0")).toEqual({
      type: "volume",
      volume01: 0,
      son: 1,
    });
  });

  it("ignore /loop cote piste WAM", () => {
    expect(effetOscVersPiste("/loop", "1 1")).toEqual({ type: "aucun" });
  });
});
