/**
 * Un projet chargé (un autre, ou le même rouvert) : ses réglages des modules partent tout de suite aux modules en ligne,
 * au lieu d'attendre la prochaine lecture. Le synthé et ses réglages (`/instrument` reconstruit
 * les voix avec la fiche, puis `/synth tous`), la SoundFont et le programme, et le limiteur
 * (valeurs par défaut quand le projet n'en dit rien, sinon l'ancien projet resterait). La
 * composition part d'abord (même règle que la lecture : celle du module, de sa section, du projet,
 * du parc), puis le reste une fois qu'elle est chargée.
 */
import { compositionDuModule, lireAffectationCompositions, type AffectationCompositions } from "./RaspberryCompositionsStore";
import { evenementsInstruments } from "./RaspberryLectureServeur";

/** Le limiteur de `plafond~` quand le projet n'en dit rien (resources/faust/plafond). */
export const LIMITEUR_PAR_DEFAUT = { plafond: -1, relache: 0.2 };

/** Le temps qu'une composition se charge sur le module avant d'en recevoir les réglages. */
export const DELAI_APRES_COMPOSITION_MS = 1500;

/** La `/composition <rang>` de chaque module en ligne d'après le projet. Pur. */
export function compositionsProjet(
  affectation: AffectationCompositions,
  modules: { numero: number; ip: string }[],
  parc: { sections: { id: string; nom: string }[]; sectionDe: Record<string, string | undefined>; compositions: string[]; defaut: string },
): { ip: string; adresse: string; valeur: string }[] {
  const messages: { ip: string; adresse: string; valeur: string }[] = [];
  for (const m of modules) {
    const section = parc.sections.find((s) => s.id === parc.sectionDe[String(m.numero)]) ?? null;
    const rang = parc.compositions.indexOf(compositionDuModule(affectation, m.numero, section, parc.defaut).nom);
    if (rang >= 0) messages.push({ ip: m.ip, adresse: "/composition", valeur: String(rang) });
  }
  return messages;
}

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

/** Émis par le chargeur (Loader) à la fin du chargement d'un projet. */
export const EVENEMENT_PROJET_CHARGE = "wam-projet-charge";

export function demarrerApplicationProjet(params: {
  modulesEnLigne: () => { numero: number; ip: string }[];
  envoyer: (ip: string, adresse: string, valeur: string) => boolean;
  /** Appelé au chargement, avant l'envoi (fermer ce qui montre l'ancien). */
  surChangement?: () => void;
}): void {
  // À chaque chargement, même du projet déjà ouvert (rouvert après des réglages faits à la main).
  window.addEventListener(EVENEMENT_PROJET_CHARGE, async () => {
    params.surChangement?.();
    // Le chargeur a déjà écrit l'affectation du projet.
    const affectation = lireAffectationCompositions();
    const modules = params.modulesEnLigne();
    let partis = 0;
    // 1. Les compositions (le parc : sections, liste et défaut, lus sur le serveur).
    try {
      const [impl, c] = await Promise.all([
        fetch("/api/implantations/active").then((r) => r.json()) as Promise<{ sections?: { id: string; nom: string }[]; modules?: Record<string, { section?: string }> }>,
        fetch("/api/compositions").then((r) => r.json()) as Promise<{ compositions?: string[]; defaut?: string }>,
      ]);
      const compositions = compositionsProjet(affectation, modules, {
        sections: impl.sections ?? [],
        sectionDe: Object.fromEntries(Object.entries(impl.modules ?? {}).map(([n, v]) => [n, v.section])),
        compositions: c.compositions ?? [],
        defaut: c.defaut || "skini",
      });
      for (const m of compositions) if (params.envoyer(m.ip, m.adresse, m.valeur)) partis++;
      if (compositions.length) await new Promise((r) => window.setTimeout(r, DELAI_APRES_COMPOSITION_MS));
    } catch {
      console.warn("[raspberry] projet chargé : compositions non envoyées (serveur injoignable)");
    }
    // 2. Le reste, une fois les compositions chargées.
    const messages = messagesProjet(lireAffectationCompositions(), modules, (ipDe) => evenementsInstruments(0, ipDe));
    for (const m of messages) if (params.envoyer(m.ip, m.adresse, m.valeur)) partis++;
    console.info(`[raspberry] projet chargé : ${partis} réglage(s) envoyé(s) aux modules en ligne`);
  });
}
