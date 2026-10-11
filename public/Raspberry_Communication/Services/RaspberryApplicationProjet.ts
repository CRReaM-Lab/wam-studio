/**
 * Un autre projet chargé : ses réglages des modules partent tout de suite aux modules en ligne,
 * au lieu d'attendre la prochaine lecture. Le synthé et ses réglages (`/instrument` reconstruit
 * les voix avec la fiche, puis `/synth tous`), la SoundFont et le programme, et le limiteur
 * (valeurs par défaut quand le projet n'en dit rien, sinon l'ancien projet resterait). La
 * composition, elle, part à la lecture (le serveur la charge, puis attend qu'elle soit prête).
 */
import { lireAffectationCompositions, type AffectationCompositions } from "./RaspberryCompositionsStore";
import { evenementsInstruments } from "./RaspberryLectureServeur";

/** Le limiteur de `plafond~` quand le projet n'en dit rien (resources/faust/plafond). */
export const LIMITEUR_PAR_DEFAUT = { plafond: -1, relache: 0.2 };

/** Les messages qui donnent à chaque module en ligne les réglages du projet. Pur. */
export function messagesProjet(
  affectation: AffectationCompositions,
  modules: { numero: number; ip: string }[],
  instruments: (ipDuModule: (numero: number) => string | undefined) => { ip: string; adresse: string; valeur: string }[],
): { ip: string; adresse: string; valeur: string }[] {
  const ips = new Map(modules.map((m) => [m.numero, m.ip]));
  const messages = instruments((n) => ips.get(n)).map(({ ip, adresse, valeur }) => ({ ip, adresse, valeur }));
  for (const m of modules) {
    const l = affectation.limiteurs?.[String(m.numero)] ?? {};
    messages.push(
      { ip: m.ip, adresse: "/limiteur", valeur: `plafond ${l.plafond ?? LIMITEUR_PAR_DEFAUT.plafond}` },
      { ip: m.ip, adresse: "/limiteur", valeur: `relache ${l.relache ?? LIMITEUR_PAR_DEFAUT.relache}` },
    );
  }
  return messages;
}

export function demarrerApplicationProjet(params: {
  lireIdProjet: () => string;
  modulesEnLigne: () => { numero: number; ip: string }[];
  envoyer: (ip: string, adresse: string, valeur: string) => boolean;
  /** Appelé au changement de projet, avant l'envoi (fermer ce qui montre l'ancien). */
  surChangement?: () => void;
}): void {
  let projet = params.lireIdProjet();
  window.setInterval(() => {
    const id = params.lireIdProjet();
    if (id === projet) return;
    projet = id;
    params.surChangement?.();
    // Le chargeur a déjà écrit l'affectation du nouveau projet.
    const messages = messagesProjet(lireAffectationCompositions(), params.modulesEnLigne(), (ipDe) => evenementsInstruments(0, ipDe));
    for (const m of messages) params.envoyer(m.ip, m.adresse, m.valeur);
    if (messages.length) console.info(`[raspberry] projet ${id} : ${messages.length} réglage(s) envoyé(s) aux modules en ligne`);
  }, 1000);
}
