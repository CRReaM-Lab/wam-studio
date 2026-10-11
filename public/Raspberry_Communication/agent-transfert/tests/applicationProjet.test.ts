import { describe, expect, it } from "vitest";
import { messagesProjet } from "../../Services/RaspberryApplicationProjet";
import { affectationVide } from "../../Services/RaspberryCompositionsStore";

describe("un autre projet chargé", () => {
  it("chaque module en ligne reçoit les instruments du projet et son limiteur (défaut sinon)", () => {
    const a = { ...affectationVide(), limiteurs: { "33": { plafond: -6 } } };
    const instruments = (ipDe: (n: number) => string | undefined) =>
      [{ ip: ipDe(33)!, adresse: "/instrument", valeur: "juno6v2" }, { ip: ipDe(33)!, adresse: "/synth", valeur: "tous /J/VCF/FREQ 0.4" }];
    const m = messagesProjet(a, [{ numero: 33, ip: "192.168.1.33" }, { numero: 34, ip: "192.168.1.34" }], instruments);
    expect(m.map((x) => `${x.ip} ${x.adresse} ${x.valeur}`)).toEqual([
      "192.168.1.33 /instrument juno6v2",
      "192.168.1.33 /synth tous /J/VCF/FREQ 0.4",
      "192.168.1.33 /limiteur plafond -6",
      "192.168.1.33 /limiteur relache 0.2",
      "192.168.1.34 /limiteur plafond -1",
      "192.168.1.34 /limiteur relache 0.2",
    ]);
  });
});
