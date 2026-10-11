import { describe, expect, it } from "vitest";
import { noteDepuisNom, normaliser, notesDuKit, planifier, sonsDuSfz } from "../../Services/RaspberryImportDossier";

const fichier = (chemin: string, contenu = "") => {
  const f = new File([contenu], chemin.split("/").pop()!);
  Object.defineProperty(f, "webkitRelativePath", { value: chemin });
  return f;
};

describe("la note d'un son d'après son nom", () => {
  it("les mots connus, avant tout numéro d'ordre", () => {
    expect(noteDepuisNom("01 Kick.wav")).toBe(36);
    expect(noteDepuisNom("909_kick_hard.wav")).toBe(36);
    expect(noteDepuisNom("Grosse caisse.wav")).toBe(36);
    expect(noteDepuisNom("Snare 02.wav")).toBe(38);
    expect(noteDepuisNom("HH Open.wav")).toBe(46);
    expect(noteDepuisNom("hihat_closed.wav")).toBe(42);
    expect(noteDepuisNom("OH.wav")).toBe(46);
    expect(noteDepuisNom("CH.wav")).toBe(42);
    expect(noteDepuisNom("Tom Low.wav")).toBe(41);
    expect(noteDepuisNom("Ride Bell.wav")).toBe(51);
    expect(noteDepuisNom("Crash.flac")).toBe(49);
  });

  it("un nom de note (c4 = 60), un numéro en tête de 21 à 127, sinon rien", () => {
    expect(noteDepuisNom("piano_C4.wav")).toBe(60);
    expect(noteDepuisNom("pad F#2.wav")).toBe(42);
    expect(noteDepuisNom("60 bruit.wav")).toBe(60);
    expect(noteDepuisNom("01 bruit.wav")).toBeNull();
    expect(noteDepuisNom("texture.wav")).toBeNull();
  });

  it("un kit : les notes devinées d'abord, les autres à la suite à partir de 36, sans doublon", () => {
    expect(notesDuKit(["texture.wav", "kick.wav", "kick 2.wav", "snare.wav"])).toEqual([37, 36, 39, 38]);
  });
});

describe("les sons nommés par un SFZ", () => {
  it("default_path, #define, chemins Windows, sons générés écartés", () => {
    const texte = `
      // commentaire sample=faux.wav
      <control> default_path=Samples\\Drums/
      #define $N kick
      <region> sample=$N.wav key=36
      <region> sample=snare 1.wav key=38 /* bloc sample=faux2.wav */
      <region> sample=*sine key=60
      <region> sample=../autre/ride.flac key=51`;
    expect(sonsDuSfz(texte)).toEqual(["samples/drums/kick.wav", "samples/drums/snare 1.wav", "samples/autre/ride.flac"]);
  });

  it("normaliser comme le serveur", () => {
    expect(normaliser("A/./b\\..\\C.WAV")).toBe("a/c.wav");
  });
});

describe("le plan d'import d'un dossier", () => {
  it("SoundFonts, SFZ et leurs sons, kits avec les sons restants, par dossier", async () => {
    const plan = await planifier([
      fichier("banque/piano.sf2"),
      fichier("banque/orgue/orgue.sfz", "<control> default_path=s/ <region> sample=Do.wav key=60 <region> sample=absent.wav key=62"),
      fichier("banque/orgue/s/do.wav"),
      fichier("banque/909/kick.wav"),
      fichier("banque/909/snare.wav"),
      fichier("banque/909/lisez-moi.txt"),
      fichier("banque/vrac.wav"),
    ]);
    expect(plan.soundfonts.map((f) => f.name)).toEqual(["piano.sf2"]);
    expect(plan.sfz).toHaveLength(1);
    expect(plan.sfz[0].sons.map((s) => s.chemin)).toEqual(["s/do.wav"]);
    expect(plan.sfz[0].manquants).toEqual(["s/absent.wav"]);
    expect(plan.kits.map((k) => [k.dossier, k.sons.map((s) => s.name)])).toEqual([
      ["banque/909", ["kick.wav", "snare.wav"]],
      ["banque", ["vrac.wav"]],
    ]);
  });
});
