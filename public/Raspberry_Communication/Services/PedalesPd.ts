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

/** Le dossier d'une pédale d'après son adresse : `…/plugins/sweetWah/index.js` → `sweetWah`. */
function dossierDepuisAdresse(adresse: string): string | null {
  const segments = new URL(adresse).pathname.split("/").filter(Boolean);
  const i = segments.lastIndexOf("plugins");
  return i >= 0 && segments[i + 1] ? segments[i + 1] : null;
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
          // Comme le pedalboard : l'adresse de la classe, puis descriptor.json à côté.
          const classe = new URL(chemin, urlBibliotheque).href;
          const adresseClasse = classe.endsWith("/") ? classe : classe + "/";
          try {
            const d = (await fetch(new URL("descriptor.json", adresseClasse).href).then((r) => r.json())) as {
              identifier?: string;
              vendor?: string;
              name?: string;
            };
            const dossier = dossierDepuisAdresse(adresseClasse);
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

/** Le nom de la pédale Pd d'une pédale du pedalboard ; null si elle n'est pas dans la banque. */
export async function pedalePd(bibliotheque: string | undefined, wamId: string): Promise<string | null> {
  if (!bibliotheque) return null;
  try {
    return (await table(bibliotheque)).get(wamId) ?? null;
  } catch {
    return null;
  }
}
