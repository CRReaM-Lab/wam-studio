import { describe, expect, it } from "vitest";
import { etatEffetsModule } from "../../Services/RaspberryEffetsModule";

describe("les réglages d'une pédale dits au module", () => {
  it("un nom avec espaces part avec des _ : l'adresse /fx n'est plus coupée", () => {
    const { emplacements } = etatEffetsModule([
      {
        nom: "SmoothDelay",
        wamId: "smoothdelay",
        objetPd: "smoothdelay",
        etat: { "/SmoothDelay/Super Wet": 0.2, "/Stone_Phaser/Dry/wet mix": 40, "/x/Makeup_Gain": 6 },
      },
    ]);
    expect(emplacements[0]).toEqual(["1 charge smoothdelay", "1 Super_Wet 0.2", "1 wet_mix 40", "1 Makeup_Gain 6"]);
    expect(emplacements[1]).toEqual(["2 vide"]);
  });
});
