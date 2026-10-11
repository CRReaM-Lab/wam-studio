/**
 * Les 128 instruments General MIDI (programmes 0 à 127, banque 0), en 16 familles de 8 : ceux de
 * GeneralUser_GS, la soundfont par défaut du contexte soundfont des modules.
 */
export const FAMILLES_GM: { famille: string; instruments: string[] }[] = [
  { famille: "Pianos", instruments: ["Piano acoustique", "Piano brillant", "Piano électrique à queue", "Piano bastringue", "Piano électrique 1", "Piano électrique 2", "Clavecin", "Clavinet"] },
  { famille: "Percussions chromatiques", instruments: ["Célesta", "Glockenspiel", "Boîte à musique", "Vibraphone", "Marimba", "Xylophone", "Cloches tubulaires", "Dulcimer"] },
  { famille: "Orgues", instruments: ["Orgue Hammond", "Orgue percussif", "Orgue rock", "Orgue d'église", "Harmonium", "Accordéon", "Harmonica", "Bandonéon"] },
  { famille: "Guitares", instruments: ["Guitare nylon", "Guitare acier", "Guitare jazz", "Guitare électrique claire", "Guitare étouffée", "Guitare saturée", "Guitare distorsion", "Harmoniques de guitare"] },
  { famille: "Basses", instruments: ["Contrebasse", "Basse électrique (doigts)", "Basse électrique (médiator)", "Basse fretless", "Basse slap 1", "Basse slap 2", "Basse synthé 1", "Basse synthé 2"] },
  { famille: "Cordes", instruments: ["Violon", "Alto", "Violoncelle", "Contrebasse (archet)", "Cordes en trémolo", "Cordes en pizzicato", "Harpe", "Timbales"] },
  { famille: "Ensembles", instruments: ["Ensemble de cordes 1", "Ensemble de cordes 2", "Cordes synthé 1", "Cordes synthé 2", "Chœur « aah »", "Voix « ooh »", "Voix synthé", "Coup d'orchestre"] },
  { famille: "Cuivres", instruments: ["Trompette", "Trombone", "Tuba", "Trompette bouchée", "Cor", "Section de cuivres", "Cuivres synthé 1", "Cuivres synthé 2"] },
  { famille: "Anches", instruments: ["Saxophone soprano", "Saxophone alto", "Saxophone ténor", "Saxophone baryton", "Hautbois", "Cor anglais", "Basson", "Clarinette"] },
  { famille: "Flûtes", instruments: ["Piccolo", "Flûte", "Flûte à bec", "Flûte de Pan", "Bouteille soufflée", "Shakuhachi", "Sifflement", "Ocarina"] },
  { famille: "Synthés solistes", instruments: ["Solo carré", "Solo dent de scie", "Solo calliope", "Solo chiff", "Solo charang", "Solo voix", "Solo quintes", "Solo basse et solo"] },
  { famille: "Nappes", instruments: ["Nappe new age", "Nappe chaude", "Nappe polysynthé", "Nappe chœur", "Nappe archet", "Nappe métallique", "Nappe halo", "Nappe balayage"] },
  { famille: "Effets synthé", instruments: ["Pluie", "Bande originale", "Cristal", "Atmosphère", "Brillance", "Gobelins", "Échos", "Science-fiction"] },
  { famille: "Instruments du monde", instruments: ["Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Cornemuse", "Fiddle", "Shehnai"] },
  { famille: "Percussions", instruments: ["Clochette", "Agogo", "Steel drum", "Woodblock", "Taiko", "Tom mélodique", "Tom synthé", "Cymbale inversée"] },
  { famille: "Bruitages", instruments: ["Frisement de guitare", "Respiration", "Vagues", "Oiseau", "Téléphone", "Hélicoptère", "Applaudissements", "Coup de feu"] },
];

/** Le nom d'un programme General MIDI (0 à 127). */
export function nomGeneralMidi(programme: number): string {
  return FAMILLES_GM[Math.floor(programme / 8)]?.instruments[programme % 8] ?? `Programme ${programme}`;
}
