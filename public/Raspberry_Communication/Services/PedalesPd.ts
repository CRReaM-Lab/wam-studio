/**
 * La pédale Pd (objet Faust compilé pour les modules) qui correspond à une pédale du pedalboard
 * de WAM. La règle est celle de `michel module install` (crates/michel/src/module.rs,
 * `nom_pedale`) : le nom du dossier de la pédale dans la banque, en minuscules
 * (`…/plugins/sweetWah/index.js` → `[sweetwah~]`, envoyé en `/fx <n> charge sweetwah`).
 *
 * Le pedalboard ne garde que l'identifiant WAM de chaque pédale (`wam_id`) ; sa bibliothèque
 * (`library`) liste les adresses des pédales, et le `descriptor.json` de chacune donne son
 * identifiant. La table est lue une fois par bibliothèque.
 */

/** `sweetWah` → `sweetwah` (lettres, chiffres et `_` seulement, comme michel). */
export function nomPedalePd(dossier: string): string {
  return dossier.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

/**
 * Le dossier d'une pédale de la banque du serveur d'après son adresse :
 * `<serveur>/bank/plugins/sweetWah/index.js` → `sweetWah`. Une pédale servie ailleurs (un plugin
 * en ligne : mainline, webaudiomodules.com) n'a pas d'équivalent sur les modules, qui ne reçoivent
 * que celles de la banque (`michel module install`) : null. Avant, `…/community/plugins/wimmics/
 * csoundPitchShifter/…` donnait le nom du fabricant (`wimmics`).
 */
export function dossierDepuisAdresse(adresse: string, origine: string = window.location.origin): string | null {
  const url = new URL(adresse, origine);
  if (url.origin !== new URL(origine).origin) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const i = segments.indexOf("bank");
  return i >= 0 && segments[i + 1] === "plugins" && segments[i + 2] ? segments[i + 2] : null;
}

/**
 * L'adresse de la classe d'une pédale de la bibliothèque, et celle de son descriptor.json, comme
 * le pedalboard (Pedalboard2Library : `new URL("descriptor.json", classURL)`) :
 * `…/plugins/greyhole/index.js` → `…/plugins/greyhole/descriptor.json`. Ajouter un `/` à une
 * adresse de fichier cherchait `…/index.js/descriptor.json` (404) : aucune pédale n'avait
 * d'équivalent.
 */
export function adressesPedale(chemin: string, urlBibliotheque: string): { classe: string; descripteur: string } {
  const classe = new URL(chemin, urlBibliotheque).href;
  return { classe, descripteur: new URL("descriptor.json", classe).href };
}

const tables = new Map<string, Promise<Map<string, string>>>();

/** Identifiant WAM → nom de la pédale Pd, pour une bibliothèque du pedalboard. */
function table(bibliotheque: string): Promise<Map<string, string>> {
  let t = tables.get(bibliotheque);
  if (!t) {
    t = (async () => {
      const resultat = new Map<string, string>();
      const urlBibliotheque = new URL(bibliotheque, window.location.href).href;
      const descripteur = (await fetch(urlBibliotheque).then((r) => r.json())) as { plugins?: string[] };
      await Promise.all(
        (descripteur.plugins ?? []).map(async (chemin) => {
          const { classe, descripteur: adresseDescripteur } = adressesPedale(chemin, urlBibliotheque);
          try {
            const d = (await fetch(adresseDescripteur).then((r) => r.json())) as {
              identifier?: string;
              vendor?: string;
              name?: string;
            };
            const dossier = dossierDepuisAdresse(classe);
            if (dossier) resultat.set(d.identifier ?? `${d.vendor}.${d.name}`, nomPedalePd(dossier));
          } catch {
            /* pédale sans descripteur : pas de pédale Pd */
          }
        })
      );
      return resultat;
    })();
    tables.set(bibliotheque, t);
    t.catch(() => tables.delete(bibliotheque));
  }
  return t;
}

/**
 * Les pédales installées sur les modules (`pedalesFaust` de `/api/compositions`, posé par
 * `michel module install`) ; null : le serveur ne le dit pas, on ne filtre pas. Relu toutes les
 * minutes (une installation pendant la séance).
 */
let installees: { quand: number; liste: Promise<Set<string> | null> } | null = null;
function pedalesInstallees(): Promise<Set<string> | null> {
  if (!installees || Date.now() - installees.quand > 60000) {
    installees = {
      quand: Date.now(),
      liste: fetch("/api/compositions")
        .then((r) => r.json())
        .then((j: { pedalesFaust?: string[] | null }) => (Array.isArray(j.pedalesFaust) ? new Set(j.pedalesFaust) : null))
        .catch(() => null),
    };
  }
  return installees.liste;
}

/** La pédale Pd retenue : dans la banque, et installée sur les modules si on le sait. */
export function pedaleRetenue(nom: string | undefined, installees: Set<string> | null): string | null {
  if (!nom) return null;
  return installees && !installees.has(nom) ? null : nom;
}

/**
 * Le nom de la pédale Pd d'une pédale du pedalboard ; null si elle n'est pas dans la banque, ou
 * si les modules ne l'ont pas (non compilée : kbverb).
 */
export async function pedalePd(bibliotheque: string | undefined, wamId: string): Promise<string | null> {
  if (!bibliotheque) return null;
  try {
    return pedaleRetenue((await table(bibliotheque)).get(wamId), await pedalesInstallees());
  } catch {
    return null;
  }
}
