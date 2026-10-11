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

import { pedaleRetenue } from "../../Services/PedalesPd";
import { texteBarre } from "../../Services/RaspberryEffetsFenetreUi";

describe("seules les pédales installées sur les modules ont un équivalent", () => {
  it("dans la liste du serveur, ou sans liste (serveur ancien)", () => {
    const installees = new Set(["greyhole", "owlshimmer"]);
    expect(pedaleRetenue("greyhole", installees)).toBe("greyhole");
    expect(pedaleRetenue("kbverb", installees)).toBeNull();
    expect(pedaleRetenue("kbverb", null)).toBe("kbverb");
    expect(pedaleRetenue(undefined, installees)).toBeNull();
  });
});

describe("la barre de la fenêtre des effets", () => {
  it("cachée pour une piste non liée ; coupée, suivie, ou avec des pédales sans équivalent", () => {
    expect(texteBarre({ liee: false, actif: false, sansEquivalent: [] }).visible).toBe(false);
    expect(texteBarre({ liee: true, raspberryId: 33, actif: false, sansEquivalent: [] })).toMatchObject({ visible: true, libelle: "Jouer ces effets sur rasp 33", alerte: false });
    expect(texteBarre({ liee: true, raspberryId: 33, actif: true, sansEquivalent: [] }).detail).toMatch(/Suivi en direct/);
    const t = texteBarre({ liee: true, raspberryId: 33, actif: true, sansEquivalent: ["WAMfreeverbMB"] });
    expect(t.alerte).toBe(true);
    expect(t.detail).toMatch(/WAMfreeverbMB/);
  });
});

import { adressesPedale } from "../../Services/PedalesPd";

describe("le descripteur d'une pédale de la bibliothèque, comme le pedalboard", () => {
  it("à côté de son index.js, ou dans son dossier", () => {
    const lib = "https://192.168.1.2/bank/crream_library.json";
    expect(adressesPedale("https://192.168.1.2/bank/plugins/greyhole/index.js", lib).descripteur).toBe("https://192.168.1.2/bank/plugins/greyhole/descriptor.json");
    expect(adressesPedale("https://mainline.i3s.unice.fr/WAMChorusMB/", lib).descripteur).toBe("https://mainline.i3s.unice.fr/WAMChorusMB/descriptor.json");
    expect(adressesPedale("plugins/disto_machine/src/index.js", lib).descripteur).toBe("https://192.168.1.2/bank/plugins/disto_machine/src/descriptor.json");
    expect(dossierDepuisAdresse(adressesPedale("https://192.168.1.2/bank/plugins/greyhole/index.js", lib).classe, "https://192.168.1.2")).toBe("greyhole");
  });
});
