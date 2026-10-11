import { describe, expect, it } from "vitest";
import { dossierDepuisAdresse, nomPedalePd } from "../../Services/PedalesPd";

const serveur = "https://192.168.1.2";

describe("la pédale Pd d'une pédale du pedalboard", () => {
  it("une pédale de la banque du serveur : le nom de son dossier", () => {
    expect(dossierDepuisAdresse(`${serveur}/bank/plugins/sweetWah/index.js`, serveur)).toBe("sweetWah");
    expect(dossierDepuisAdresse("/bank/plugins/greyhole/index.js", serveur)).toBe("greyhole");
    expect(nomPedalePd("TS9_OverdriveFaustGenerated")).toBe("ts9_overdrivefaustgenerated");
  });

  it("une pédale en ligne n'a pas d'équivalent sur les modules (plus le nom du fabricant)", () => {
    expect(dossierDepuisAdresse("https://www.webaudiomodules.com/community/plugins/wimmics/csoundPitchShifter/dist/index.js", serveur)).toBeNull();
    expect(dossierDepuisAdresse("https://mainline.i3s.unice.fr/WAMfreeverbMB/index.js", serveur)).toBeNull();
    expect(dossierDepuisAdresse(`${serveur}/autre/plugins/x/index.js`, serveur)).toBeNull();
  });
});
