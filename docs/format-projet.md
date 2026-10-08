# Le format des projets WAM (branche `crream`)

Un projet est un fichier JSON (`project.json` dans la banque) et, à côté, un fichier par région
(le contenu audio ou MIDI). Code : `public/src/Loader/Loader.ts` (sauvegarde, chargement) et
`public/src/Loader/ProjectFormat.ts` (version, migrations). **Ce document se met à jour avec
`ProjectFormat.ts`** : une version qui change sans être décrite ici est un défaut.

## La version

`version` : `[majeure, mineure]`.

- **Mineure** : un ajout qu'un WAM plus ancien ignore — mais qu'il **perdrait en resauvant** ;
- **majeure** : un changement qu'un WAM plus ancien lirait de travers.

Au chargement (`migrerProjet`) : version invalide, majeure différente, ou mineure plus récente que
ce WAM → **refusé**, avec un message. Plus ancienne → **migrée pas à pas**, chaque migration
consignée dans `meta.migrations` et sauvée avec le projet à la sauvegarde suivante.

| Version | Ajout | Migration depuis la précédente |
|---|---|---|
| 1.0 | format d'origine de WAM Studio | — |
| 1.1 | `tracks[].raspberry` : la piste liée à un Pi son | rien à convertir (le champ existait déjà en 1.0, ajouté sans changer la version) |
| 1.2 | `marqueurs` | absents : ceux du navigateur (`localStorage`) sont repris |
| 1.3 | `regionsSons` (lien région → son du Pi) ; `meta` | absent : repris du navigateur |
| 1.4 | marqueurs de type `repere` (touche M, comme REAPER : pour naviguer, rien n'est envoyé aux Pi) | rien à convertir ; un WAM 1.3 les perdrait en resauvant |

**Compatibilité avec le WAM de Jauris (format 1.0)** : il refuse un projet 1.3 (« trop récent »).
C'est voulu : sinon il ouvrirait le projet, puis effacerait marqueurs et numéros de son en le
resauvant. Même chose d'un WAM 1.3 face à un projet 1.4 (les repères).

## Les champs

```jsonc
{
  "version": [1, 4],
  "host": {
    "playhead": 0,                    // position de lecture (ms) à la sauvegarde
    "tempo": 120,
    "time_signature": [4, 4],
    "volume": 1,
    "plugin": { "name": "…", "state": {} }   // plugin de la piste maître, facultatif
  },
  "tracks": [
    {
      "name": "rasp 98",
      "muted": false, "solo": false, "balance": 0, "volume": 1, "color": "#…",
      "plugin": { "name": "…", "state": {} },          // facultatif
      "automations": [ { "param": "…", "state": {} } ],
      "regions": [
        {
          "type": "SAMPLE",                            // ou "MIDI"
          "content_name": "track-1-region-3.wav",      // le fichier du contenu, à côté du projet
          "start": 2000                                // ms
        }
      ],
      "raspberry": {                                   // 1.1 — piste liée à un Pi son
        "ip": "192.168.1.98", "raspberryId": 98,
        "sonNumber": 500                                // numéro de départ des sons de la piste
      }
    }
  ],
  "marqueurs": [                                       // 1.2
    { "id": "marqueur-…", "type": "osc", "tempsMs": 4800,
      "libelle": "Stop", "oscAdresse": "/stop", "oscValeur": "508" },
    { "id": "marqueur-…", "type": "cue", "tempsMs": 1000,
      "libelle": "Entrée chœur", "oscAdresse": "", "oscValeur": "" },
    { "id": "marqueur-…", "type": "repere", "tempsMs": 2000,             // 1.4
      "libelle": "Repère 1", "oscAdresse": "", "oscValeur": "" }
  ],
  "regionsSons": {                                     // 1.3 — clé : content_name de la région
    "track-1-region-3.wav": {
      "raspberryId": 98, "startMs": 2000, "durationMs": 1500,
      "sonNumber": 501, "nomFichier": "son501.wav", "nomAffiche": "son501",
      "indexOrdre": 1                                  // rang de la région sur sa piste
    }
  },
  "meta": {                                            // 1.3
    "creeLe": "2026-10-07T21:00:03Z",
    "formatInitial": "1.0",                            // format du projet à sa création
    "sauveLe": "2026-10-07T21:12:40Z",
    "migrations": [
      { "de": "1.0", "vers": "1.1", "le": "2026-10-07T21:05:00Z",
        "note": "pistes liées aux Raspberry (tracks[].raspberry) : 1 piste(s) déjà liée(s), rien à convertir" }
    ]
  }
}
```

- Un **marqueur** `osc` envoie son adresse à tous les Pi en ligne ; un `cue` arrête la lecture
  jusqu'à Espace (`notes/vocabulaire.md` dans CRReaM-dev-root : ce modèle est à repenser).
- **`regionsSons`** dit quel son du Pi une région joue (`/play <sonNumber>`). Le serveur s'en sert
  pour vérifier qu'un projet est jouable par les Pi tels qu'ils sont (`GET /agent/coherence`,
  `michel projet check`).

## Ajouter un champ

1. Le champ dans `ProjectData` (`Loader.ts`), sauvé et rechargé.
2. La version mineure de `CURRENT_PROJECT_VERSION` (`ProjectFormat.ts`) : +1.
3. Une entrée dans `MIGRATIONS` : ce qu'on fait d'un projet qui ne l'a pas (et ce qu'on consigne).
4. Une ligne dans le tableau ci-dessus, et le champ dans l'exemple.
