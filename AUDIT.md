# AUDIT — Les Toiles Noires Predictor

**Objectif** : rendre l'app pleinement fonctionnelle pour **France – Sénégal (lundi, en direct)**.
**Méthode** : audit complet du flux temps réel (DB → providers live → sync → SSE → UI).
**Format** : chaque point a une **priorité**, le **fichier:ligne**, le **problème**, et le **correctif exact** à appliquer.

Priorités : 🔴 BLOQUANT · 🟠 MAJEUR · 🟡 MINEUR · 🔒 SÉCURITÉ · ⚙️ OPÉRATIONNEL (procédure jour J).

---

## ✅ DÉJÀ APPLIQUÉ — Refonte des sources live (free tier)

> Implémenté le 2026-06-11. Typecheck OK.

Nouvelle répartition des données (l'app recalcule ses propres cotes → odds-api inutile en live) :
- **Cotes (base)** : odds-api.io, **uniquement à la création de session** (inchangé).
- **Score + statut + buteurs + score mi-temps** : **Football-Data.org en PRIMAIRE** (gratuit, ~10 req/min, CdM couverte).
- **Stats détaillées** (possession, tirs, corners, cartes) : **API-Football**, seule source, cache **3 min** (~30 appels/match, sous le quota 100/jour).
- **Backups score** : API-Football complet → odds-api.io (dernier recours).

Fichiers modifiés :
- `src/lib/live-provider.ts` — réécrit : Football-Data primaire, odds-api sorti de la boucle live, temps de jeu estimé depuis le coup d'envoi (FD ne donne pas de minute fiable).
- `src/app/api/admin/sync/route.ts` — `syncIntervalMs` → 15 s en direct / 60 s mi-temps.
- `src/lib/api-football-provider.ts` — `STATS_TTL` 5 min → 3 min.
- `scripts/test-live-sources.mjs` — **nouveau** : test du matching d'équipes avant le match.

**⚠️ À FAIRE avant lundi** : lancer le test sur un match EN COURS pour confirmer le matching :
```
node --env-file=.env.local scripts/test-live-sources.mjs "France" "Senegal" 2026-06-15
```
(remplacer par la vraie date ; lancer pendant un match live quelconque pour voir aussi les stats).

---

## 🔴 BLOQUANT 1 — Le match reste figé à la mi-temps (le live ne reprend jamais en 2e période)

> ✅ **APPLIQUÉ (2026-06-11, typecheck OK)** — Condition de poll élargie à `half_time` dans `screen/page.tsx:113` et `ranking/page.tsx:142`. Le ticker de secondes a été laissé intact. La 2e période reprend désormais automatiquement.

**Cause** : le déclenchement de `/api/admin/sync` est piloté **par le polling des pages** `screen` et `ranking`, mais ce polling ne tourne **que si `match.status === 'live'`**. Dès que le sync passe le match en `half_time`, les pages **arrêtent de poller** → plus aucun appel sync → le match ne repasse jamais en `live` automatiquement pour la 2e mi-temps. Le serveur, lui, accepte pourtant de sync en `half_time` (`['live','half_time']` dans `sync/route.ts:300`).

**Emplacements** :
- `src/app/screen/page.tsx:113` → `if (match.status !== 'live') return;`
- `src/app/ranking/page.tsx:142` → `if (match.status !== 'live') return;`

**Correctif** (les deux fichiers) — élargir la condition à `half_time` :
```ts
// AVANT
if (match.status !== 'live') return;
// APRÈS
if (match.status !== 'live' && match.status !== 'half_time') return;
```
> Le serveur reprendra alors la transition `half_time → live` tout seul dès que le vrai match repart.

**Optionnel mais recommandé** : `screen/page.tsx:114` et `ranking/page.tsx:149` pollent à **15 s**. Pour un suivi but-par-but plus réactif, passer à **8 000 ms** (le rate-limit serveur odds-api est déjà à 14 s, le surplus est ignoré sans risque de quota).

---

## 🔴 BLOQUANT 2 — En déploiement Docker, les scores et cotes ne fonctionnent pas

> ✅ **APPLIQUÉ (2026-06-11)** — Déploiement VPS confirmé (Docker).
> - `docker-compose.yml` : `env_file: .env.local` injecte désormais toutes les clés dans le conteneur (⚠️ copier `.env.local` à côté du compose sur le VPS).
> - `Dockerfile` : `node:20-alpine` → **`node:20-slim`** (les 2 étapes). Raison : `better-sqlite3` (module natif) n'a pas toujours de binaire musl → `npm ci` échouait sur Alpine. Debian/glibc a des prebuilds → build fiable, libs runtime présentes.
> - **À vérifier sur le VPS** : `docker compose build` doit réussir et les logs sync doivent montrer `sources: ['football-data:...','api-football:stats']`.

**Cause** : `docker-compose.yml` ne transmet au conteneur que `FOOTBALL_API_KEY` et `PORT`. Les clés **odds-api.io** (`ODDS_API_IO_KEY`, bookmakers) et **Football-Data** (`FOOTBALL_DATA_ORG_KEY`) ne sont **pas** passées.

**Conséquence** : un match créé via la recherche a un `id` `oai-...` donc `odds_event_id` est défini → dans `live-provider.ts`, `hasOai = true` → API-Football est mis en `statsOnly` (stats seulement, **pas de score**), et odds-api + Football-Data n'ont pas de clé → **le score ne se met jamais à jour**.

**Emplacement** : `docker-compose.yml`

**Correctif** — charger tout le `.env.local` :
```yaml
services:
  app:
    # ...
    env_file:
      - .env.local
    environment:
      - PORT=3000
```
> Si l'app tourne en local via `npm run start` / `next dev` (et **non** Docker), `.env.local` est déjà lu automatiquement : ce point ne bloque alors pas. **À trancher avant lundi : lance-t-on en local ou en Docker ?** (voir checklist ⚙️).

---

## 🟠 MAJEUR 3 — « Terminer le match » (bouton) et le passage manuel à « Terminé » ne résolvent PAS les paris

**Cause** : la résolution automatique des marchés (score exact, résultat, BTTS, +2.5, corners…) vit **uniquement** dans le chemin de **sync live** (`sync/route.ts:370` `resolveFulltimeMarkets`). Les actions manuelles ne l'appellent pas :
- `op: 'end_match'` (`db/route.ts:339`) → met `status='finished'`, ne résout rien.
- `op: 'update_match'` avec `status='finished'` (sélecteur admin, `db/route.ts:309`) → met `finished_at`, ne résout rien.

**Conséquence** : si l'admin clôt le match « à la main », tous les paris restent `pending` et **aucun joueur n'est payé** tant que l'admin ne résout pas chaque marché un par un dans le panneau « RÉSOLUTION DES PARIS ».

**Deux options :**

- **Option A (procédure, zéro code)** : laisser le **sync live détecter la fin** (le statut `finished` viendra d'odds-api/API-Football) → résolution auto. Ne PAS utiliser le bouton « Terminer le match » avant que le score final soit confirmé. Résoudre manuellement seulement « Premier Buteur » (non auto-résoluble).

- **Option B (code)** : faire que `end_match` résolve les marchés full-time. Extraire la logique de résolution de `sync/route.ts` (`resolveMarket`, `resolveFulltimeMarkets`, `resolveHalftimeMarkets`) dans un module partagé `src/lib/resolve.ts`, puis l'appeler depuis `end_match` avec le score courant du match. C'est l'option robuste si l'admin veut garder le contrôle manuel de la fin.

**Recommandation jour J** : Option A (plus simple, déjà câblée), Option B en post-événement.

---

## 🟠 MAJEUR 4 — Transition « Avant-match → Live » 100 % manuelle (à connaître absolument)

**Constat** (pas un bug, mais critique) : rien ne fait passer le match de `upcoming` à `live` automatiquement. Le sync serveur **ignore** tout match qui n'est pas déjà `live`/`half_time` (`sync/route.ts:300`), et les pages ne pollent pas en `upcoming`.

**Conséquence** : **au coup d'envoi, l'admin DOIT basculer le statut sur « En Cours / Live »** (sélecteur `admin/page.tsx:386`). Sans ça : aucun score, aucune stat, le chrono reste à 0.

**Action** : voir checklist ⚙️ (étape 4). Aucune modif de code requise.

---

## 🔒 SÉCURITÉ 5 — `/api/db` (POST) n'a aucune authentification

> ✅ **APPLIQUÉ (2026-06-11, typecheck OK)**
> - `db/route.ts` : set `ADMIN_OPS` (resolve_market, create_session, update_match, reset_all, attribute_reward, kick_*, game_event…) gardé par le header `x-admin-secret`. Nouvel op `admin_check` pour valider le déverrouillage. **Anti-lockout** : tant que `ADMIN_API_SECRET` n'est pas défini en env, rien n'est bloqué (repli mot de passe `toiles2024` pour la gate).
> - `store.ts` (`dbPost`) + `StartSessionModal.tsx` (`adminHeaders`) : joignent automatiquement le secret stocké en `sessionStorage` (les ops joueur l'ignorent).
> - `admin/page.tsx` : déverrouillage **validé côté serveur** (`admin_check`), secret stocké en `sessionStorage`, effacé au « Quitter ». L'ancienne constante en clair `ADMIN_PASSWORD = 'toiles2024'` du bundle est **supprimée**.
> - `.env.local` : `ADMIN_API_SECRET=LTN-Bar-2026` ajouté → **protection ACTIVE**. Ce mot de passe (à communiquer au barman) déverrouille `/admin` ET gate l'API.
>
> **⚠️ Actions** : (1) le **nouveau mot de passe admin est `LTN-Bar-2026`** (modifiable dans `.env.local`, redémarrage requis). (2) Sur le **VPS**, `ADMIN_API_SECRET` est chargé via `env_file: .env.local` (déjà en place). (3) Choisir une valeur **non publique** (l'ancien `toiles2024` est dans l'historique git).
>
> 🔧 **Correctif complémentaire (2026-06-11, build OK)** — `PresencePanel.tsx` lisait le secret depuis `process.env.NEXT_PUBLIC_ADMIN_API_SECRET`, **figé au build** : dans l'image Docker (build AVANT `env_file`), il serait **vide** → boutons « déconnecter » en 401. Corrigé pour lire `sessionStorage` (`adminHeaders()`), cohérent avec le reste. **Conséquence : `NEXT_PUBLIC_ADMIN_API_SECRET` n'est plus nécessaire** (peut être retiré de `.env.local`).

**Cause** : toutes les opérations sensibles passent par `POST /api/db` sans vérif d'identité : `reset_all`, `delete_session`, `resolve_market`, `create_session`, `kick_all`, `attribute_reward`, `toggle_double_gains`, `close_session`… Le mot de passe admin (`toiles2024`, `admin/page.tsx:8`) est **uniquement côté client** : il est lisible dans le bundle JS et ne protège **aucune** route serveur.

**Conséquence** : n'importe quel client (un joueur avec la console du navigateur) peut résoudre un marché en sa faveur, s'attribuer une récompense physique (bière offerte), ou réinitialiser la session en plein match.

**Correctif minimal (recommandé avant lundi)** : protéger les ops sensibles par un secret serveur.
1. Ajouter dans `.env.local` : `ADMIN_API_SECRET=<chaîne_longue_aléatoire>`.
2. Dans `db/route.ts`, en tête de `POST`, après avoir lu `op` :
```ts
const SENSITIVE = new Set([
  'resolve_market','create_session','preview_session','reset_all','delete_session',
  'close_session','end_match','update_match','create_flash_market','close_market',
  'delete_market','toggle_double_gains','attribute_reward','create_reward','claim_reward',
  'kick_player','kick_all','game_event',
]);
if (SENSITIVE.has(op) && req.headers.get('x-admin-secret') !== process.env.ADMIN_API_SECRET) {
  return json({ error: 'unauthorized' }, 401);
}
```
3. Faire envoyer ce header par les appels admin. Le plus simple : un petit helper côté admin qui ajoute `x-admin-secret` (valeur saisie au déverrouillage, stockée en `sessionStorage`). **Ne pas** committer le secret en clair côté client : le faire saisir dans le gate admin.

> Niveau de risque réel : modéré (bar, public de confiance, ToilesCoins sans valeur monétaire) — mais les **récompenses physiques** et la résolution de marchés rendent l'exploit concret. À arbitrer selon le contexte.

---

## 🟠 MAJEUR 6 — Pari accepté côté serveur sur une issue suspendue (cote = 0)

> ✅ **APPLIQUÉ (2026-06-11, typecheck OK)** — Garde-fou ajouté dans `place_bet` ([db/route.ts](src/app/api/db/route.ts)) : `if (Number(outcome.current_odds) <= 1) return ...` juste après le check `!outcome`.

**Cause** : `suspendImpossibleOutcomes` (`db.ts:257`) met `current_odds = 0` pour les issues devenues impossibles. L'UI désactive bien ces boutons (`page.tsx:345`), mais le serveur `place_bet` (`db/route.ts:224`) ne rejette **pas** une issue à cote 0.

**Conséquence** : un pari forcé (hors UI) sur une issue à 0 est accepté → gain nul même « gagné », ou mise perdue d'office. Incohérent.

**Correctif** — `db/route.ts`, après avoir chargé `outcome` (vers la ligne 241) :
```ts
if (!outcome) return json({ success: false, error: 'Option introuvable.' });
if (Number(outcome.current_odds) <= 1) return json({ success: false, error: 'Cote indisponible (issue suspendue).' });
```

---

## 🟡 MINEUR 7 — Stats « extérieur » codées en dur sur la page de paris

> ✅ **APPLIQUÉ (2026-06-11, typecheck OK)** — `page.tsx` : « TIRS CADRÉS » et « CORNERS » utilisent maintenant `match.shotsOnTargetAway` / `match.cornersAway` (division protégée `|| 1`).

**Cause** : `page.tsx:499` et `:506` affichent les valeurs adverses en dur (`right="2"`, `right="3"`) au lieu des vraies stats.

**Correctif** — `src/app/page.tsx`, bloc « STATS DU MATCH » :
```tsx
<StatBar label="TIRS CADRÉS" left={`${match.shotsOnTargetHome}`}
  right={`${match.shotsOnTargetAway}`}
  pct={(match.shotsOnTargetHome / ((match.shotsOnTargetHome + match.shotsOnTargetAway) || 1)) * 100} />
<StatBar label="CORNERS" left={`${match.cornersHome}`}
  right={`${match.cornersAway}`}
  pct={(match.cornersHome / ((match.cornersHome + match.cornersAway) || 1)) * 100} />
```

---

## 🟡 MINEUR 8 — Parsing de date mi-temps potentiellement invalide

> ✅ **APPLIQUÉ (2026-06-11, typecheck OK)** — `sync/route.ts` : `new Date(htEvent.created_at.replace(' ', 'T') + 'Z')`. NB : depuis la refonte des sources, ce bloc de grâce mi-temps ne se déclenche que pour un match sans `odds_event_id` (défensif).

**Cause** : `sync/route.ts:323` fait `new Date(htEvent.created_at + ' Z')`. `created_at` vient de SQLite `datetime('now')` au format `YYYY-MM-DD HH:MM:SS`. Le suffixe `' Z'` (avec espace) donne une chaîne dont le parsing n'est pas garanti (peut produire `NaN` → délai de grâce mi-temps cassé).

**Correctif** — `sync/route.ts:323` :
```ts
const htTime = new Date(htEvent.created_at.replace(' ', 'T') + 'Z').getTime();
```

---

## 🟡 MINEUR 9 — Fuite d'interval dans le flux SSE

> ✅ **APPLIQUÉ (2026-06-11)** — `hb` déclaré en amont et `clearInterval(hb)` ajouté dans le `catch` du `subscribe` ([api/events/route.ts](src/app/api/events/route.ts)).

**Cause** : `api/events/route.ts:11-13` — si `controller.enqueue` échoue dans le `subscribe`, on `unsub()` mais on ne `clearInterval(hb)` pas (le heartbeat continue de tenter d'écrire dans un stream mort). Fuite mineure sur déconnexions répétées (téléphones qui passent en veille).

**Correctif** — stocker `hb` plus haut et le nettoyer aussi dans le `catch` du subscribe :
```ts
let hb: ReturnType<typeof setInterval>;
const unsub = subscribe((data) => {
  try { controller.enqueue(enc.encode(data)); }
  catch { clearInterval(hb); unsub(); }
});
hb = setInterval(() => {
  try { controller.enqueue(enc.encode(': ping\n\n')); }
  catch { clearInterval(hb); unsub(); }
}, 25_000);
```

---

## 🟡 MINEUR 10 — Bots du classement désactivés (classement vide au démarrage)

**Constat** : le seed des bots est commenté (`db.ts:206-224`, « Desactive pour arreter d'inserer des bots »). C'est volontaire, mais conséquence : le **classement (ranking + écran TV) est vide** tant qu'aucun vrai joueur n'a rejoint/parié. Normal, juste à anticiper pour la démo (rien d'anormal si l'écran TV affiche un classement vide avant l'arrivée du public).

**Aucune action** sauf si on veut un classement « peuplé » dès l'ouverture (décommenter le bloc).

---

## ⚠️ À VÉRIFIER AVANT LUNDI (non confirmable sans live)

1. **Endpoint live odds-api.io** : `getLiveEvent` (`odds-provider.ts:132`) lit le score via `GET /v3/events?id=<id>`. À **tester en conditions réelles** sur un match en cours **avant** lundi : confirmer que cet endpoint renvoie bien `scores.home/away` et un `status` exploitables en direct. Si non, le fallback Football-Data prend le relais (clé requise — cf. Bloquant 2).
2. **Découverte API-Football** : `findFixtureId` matche par noms d'équipes + date. Vérifier que « France » / « Sénégal » (et leurs variantes API) matchent bien (`normTeam` + `teamsMatch`, `api-football-provider.ts:45`). Lancer la session et regarder les logs serveur (`[Sync] sources: [...]`) pour confirmer les sources actives.
3. **Quota API-Football** (~100 req/jour en gratuit) : avec odds-api présent, stats en `statsOnly` cache 5 min ≈ 18 appels/match → OK. Si odds-api tombe, surveiller le quota.

---

## ⚙️ CHECKLIST OPÉRATIONNELLE — JOUR J (France – Sénégal)

**Préparation (la veille / avant le public)**
- [ ] Décider du mode de lancement : **local** (`npm run build && npm run start`, `.env.local` lu auto) **ou Docker** (alors appliquer Bloquant 2).
- [ ] Appliquer au minimum **Bloquant 1** (stall mi-temps) — sinon la 2e période ne s'affichera pas.
- [ ] Vérifier que `.env.local` contient bien les 5 clés (FOOTBALL_API_KEY, ODDS_API_IO_KEY, ODDS_BOOKMAKER(+FALLBACK), FOOTBALL_DATA_ORG_KEY).
- [ ] Tester le sync sur un match live quelconque (point « À vérifier » n°1).
- [ ] Brancher la TV du bar sur `/screen` (c'est cette page qui pilote le polling sync + affiche QR code, score, classement).

**Avant le coup d'envoi**
- [ ] `/admin` → mot de passe → « Démarrer une session » → chercher **France – Sénégal** (filtre Coupe du Monde + date de lundi) → vérifier/éditer les cotes → « Valider & lancer ».
- [ ] Laisser le statut sur **Avant-Match** : les joueurs scannent le QR (`/join`), créent leur profil et **parient en pré-match** (les paris sont ouverts tant que `status ≠ finished`).

**Au coup d'envoi (MAJEUR 4 — étape la plus importante)**
- [ ] Dans `/admin`, passer « MODIFIER LE STATUT » → **En Cours / Live**. ⟵ déclenche tout le suivi live.
- [ ] Vérifier sur `/screen` que le chrono avance et que le score réagit (~15 s de latence, ou 8 s si optim. appliquée).
- [ ] **NE PAS** utiliser le bouton « +1 Minute (Sim) » ni le simulateur pendant le vrai match (corromprait le temps/score réels).

**Mi-temps / 2e période**
- [ ] Le passage en Mi-Temps puis le retour en Live doivent être **automatiques** (si Bloquant 1 appliqué). Sinon, repasser manuellement le statut sur **Live** au retour des vestiaires.

**Fin de match**
- [ ] Laisser le sync détecter la fin (résolution auto des marchés). Voir MAJEUR 3.
- [ ] Résoudre **manuellement** le marché « PREMIER BUTEUR » dans le panneau Résolution (non auto-résoluble).
- [ ] Distribuer les récompenses via « OFFRIR UN LOT », puis « Fermer & archiver » la session.

**Garde-fous utiles en direct**
- Bouton **GELER** sur un marché = fige les paris sans le résoudre (utile sur une action chaude).
- **Double Gains** = ×2 toutes les cotes (effet d'ambiance, à activer ponctuellement).
- **Pari Flash** = marché éphémère 5 min (« Mbappé marque de la tête », etc.).

---

## 🔬 SECOND PASSAGE — AUDIT AVANCÉ (concurrence, exploits, cas limites)

> Passage effectué le 2026-06-11 après application des correctifs ci-dessus.
> **`npm run build` : ✅ PASSE** (14 routes, zéro erreur) — le déploiement VPS est compilable.

### AV-0 ✅ (corrigé direct) — Collision d'ID d'événement badge
Mon propre câblage GAP A générait `'ge-badge-' + Date.now() + '-' + code` : deux gagnants débloquant le même badge dans la même milliseconde (boucle synchrone de résolution → probable à 50 joueurs) ⇒ violation de PK ⇒ **exception au milieu de la résolution** (paiements partiels). Corrigé : l'id inclut désormais l'`uid` (`ge-badge-<uid>-<code>-<ts>`) dans `db/route.ts` et `sync/route.ts`. Typecheck OK.

### AV-1 🟠 Prise de compte par pseudo (register = login sans aucun secret)

> ✅ **APPLIQUÉ (2026-06-11, typecheck + build OK)** — Jeton d'appareil : colonne `players.device_token`, généré à l'inscription et stocké en localStorage (`ltn_device_token`). `register` n'autorise la reprise d'un pseudo existant que si le token concorde (sinon `409 { taken: true }`). Comptes legacy sans token : adoptés par le 1er navigateur revenant. `registerUser` remonte l'erreur, la page `join` l'affiche. Fichiers : `db.ts`, `db/route.ts`, `store.ts`, `join/page.tsx`.
`op: 'register'` ([db/route.ts:199](src/app/api/db/route.ts#L199)) : si le pseudo existe, on **renvoie le compte existant** (et on écrase son avatar). N'importe quel client du bar peut taper le pseudo d'un rival → **récupère son compte, son solde, et peut dilapider ses TC sur un pari perdant**. À 50 inconnus dans un bar, l'exploit est trivial et invisible.
**Correctif minimal** (rapide) : à l'inscription, générer un `deviceToken` aléatoire stocké en localStorage et en DB ; au « re-login » par pseudo, exiger le token (sinon proposer « pseudo déjà pris »). **Correctif jour J sans code** : annoncer que le pseudo fait foi, surveiller les contestations au comptoir (faible enjeu, lots modestes).

### AV-2 🟠 Injection SQL par noms de colonnes dans `update_match`

> ✅ **APPLIQUÉ (2026-06-11)** — Whitelist `ALLOWED_MATCH_COLS` dans `update_match` ([db/route.ts](src/app/api/db/route.ts)) : seules les 17 colonnes de stats autorisées sont interpolées ; les autres clés sont ignorées. Garde aussi `if (!activeMatchId) return`.
[db/route.ts:312](src/app/api/db/route.ts#L312) : ``const cols = Object.keys(stats).map(k => `${k} = ?`)`` — les **clés** du JSON client sont interpolées telles quelles dans le SQL. Les *valeurs* sont paramétrées, mais une clé `"status = 'finished', home_score = (SELECT ...) --"` passe dans la requête. Depuis le fix 🔒 #5 l'op exige le secret admin (risque résiduel faible), mais défense en profondeur requise :
```ts
const ALLOWED_COLS = new Set(['home_score','away_score','status','elapsed_time','possession_home',
  'shots_on_target_home','corners_home','cards_home','shots_home','shots_away','shots_on_target_away',
  'corners_away','cards_away','fouls_home','fouls_away','passes_accuracy_home','passes_accuracy_away']);
const entries = Object.entries(stats).filter(([k]) => ALLOWED_COLS.has(k));
const cols = entries.map(([k]) => `${k} = ?`).join(', ');
db.prepare(`UPDATE matches SET ${cols} WHERE id = ?`).run(...entries.map(([,v]) => v), activeMatchId);
```

### AV-3 🟠 But annulé (VAR / erreur admin) → cotes suspendues À VIE

> ✅ **APPLIQUÉ (2026-06-11, typecheck OK)** — `suspendImpossibleOutcomes` ([db.ts](src/lib/db.ts)) rendue **symétrique** : restaure `base_odds` quand une issue suspendue redevient possible (but annulé VAR, correction de score). Bonus : la fonction **broadcaste désormais `outcomes_update`** pour chaque marché modifié → suspensions ET restaurations visibles **en direct** sur les téléphones (le 1er audit avait raté ce manque : avant, les grisages n'apparaissaient qu'au rechargement). Ne touche plus aux marchés `is_closed`.
`suspendImpossibleOutcomes` ([db.ts:257](src/lib/db.ts#L257)) met `current_odds = 0` mais **rien ne ré-active jamais** une issue. Scénario réel lundi : but refusé par la VAR, ou mis-clic sur « + » corrigé par « − » → les scores exacts (0-0, 1-0…) restent « Suspendu » pour tout le match alors qu'ils sont redevenus possibles. `base_odds` est préservée → la restauration est possible.
**Correctif** : rendre la fonction symétrique — pour chaque outcome, si la condition d'impossibilité n'est **plus** vraie et `current_odds = 0`, restaurer via `calculateDynamicOdds` du marché (ou `base_odds`). À défaut, **procédure** : en cas de but annulé, l'admin recrée les cotes à la main… impossible en l'état → ce correctif vaut le coup avant lundi (la VAR en Coupe du Monde, c'est fréquent).

### AV-4 🟡 Résolution sans annulation possible (opérationnel)
`resolve_market` paie immédiatement et les boutons se désactivent (`resolvedOutcomeId !== null`). **Aucun undo** : un mauvais clic = paiements crédités, irréversible sans SQL manuel. **Procédure jour J** : c'est le sync qui résout en auto ; ne résoudre à la main que « Premier Buteur » + paris flash, calmement, après confirmation du résultat.

### AV-5 🟡 La mission « Nostradamus en Herbe » (score exact) n'avance jamais

> ✅ **APPLIQUÉ (2026-06-11)** — Helper `progressExactScoreMission(userId)` ([db.ts](src/lib/db.ts)) appelé pour les gagnants d'un marché `exact_score` dans les 2 chemins de résolution. Touche uniquement `player_missions` (zéro impact paiements). NB : la barre se rafraîchit au prochain chargement du profil.
Le badge Visionnaire est désormais attribué (GAP A ✅), mais la **mission** `exact_score` reste figée à 0/1 dans le profil (rien n'appelle `update_mission_progress` avec ce type). Cosmétique. Correctif optionnel : à la résolution d'un marché `exact_score`, incrémenter la mission des gagnants côté serveur.

### AV-6 🟡 Paris « fantômes » dans le profil après suppression de session

> ✅ **APPLIQUÉ (2026-06-11)** — Le handler SSE `session_reset` ([store.ts](src/lib/store.ts)) purge `ltn_user_bets` + `myBets` (nouveau match ou suppression).
`delete_session` / `reset_all` effacent les `bets` en DB, mais le client garde `myBets` en localStorage (`ltn_user_bets`) → le profil affiche des paris « En attente » d'un match qui n'existe plus, jusqu'au prochain `initFromSupabase`. Correctif léger : dans le handler SSE `session_reset` ([store.ts:499](src/lib/store.ts#L499)), re-fetch `op=player` (ou vider `myBets` si `match === null`).

### AV-7 🟡 Après clôture, les actions admin retombent sur le DERNIER match archivé

> ✅ **APPLIQUÉ (2026-06-11)** — `getActiveMatchId()` ([db/route.ts](src/app/api/db/route.ts)) ne fait plus de repli sur le dernier match : renvoie `''` si aucun match actif. `update_match` court-circuite alors (`if (!activeMatchId) return`).
`getActiveMatchId()` ([db/route.ts:23](src/app/api/db/route.ts#L23)) : sans match actif, renvoie le **plus récent** match (clôturé). Un `update_match`, `game_event` ou `toggle_double_gains` lancé par une page admin restée ouverte après « Fermer & archiver » modifie silencieusement le match archivé. Correctif : faire retourner `''` et court-circuiter les ops quand aucun match actif.

### AV-8 ℹ️ Contraintes d'architecture temps réel (à respecter au déploiement)
- Le bus SSE ([sse-bus.ts](src/lib/sse-bus.ts)) et tous les caches/rate-limits sont **en mémoire d'un seul process**. C'est correct avec 1 conteneur (`next start` = 1 process Node). **Ne jamais** passer à 2 replicas / cluster mode sans bus externe (Redis pub/sub) — sinon la moitié des clients ne reçoit plus les événements.
- Au restart du conteneur (`restart: always`), les `EventSource` clients **se reconnectent automatiquement** (natif navigateur) et l'état est rechargé depuis SQLite → coupure de quelques secondes, pas de perte.
- Si un reverse-proxy nginx est mis devant sur le VPS : le header `X-Accel-Buffering: no` est déjà envoyé ✓, mais vérifier aussi `proxy_read_timeout` ≥ 60 s (heartbeat SSE = 25 s).

### AV-9 ℹ️ Dockerfile — points non bloquants
- `next.config.ts` n'est **pas copié** dans l'image runner. Aujourd'hui inoffensif (la config ne contient que `allowedDevOrigins`, ignoré en prod) — mais toute future option prod (headers, redirects) serait silencieusement perdue. Ajouter `COPY --from=builder /app/next.config.ts ./` par hygiène.
- L'image embarque les devDependencies (npm ci complet) : ~200 Mo de plus, sans risque.

### AV-10 🟡 Le chrono estimé dérive si le coup d'envoi est retardé
`estimateElapsed` ([live-provider.ts](src/lib/live-provider.ts)) calcule la minute depuis `starts_at` **planifié**. Coup d'envoi retardé de 10 min (cérémonies, courant en CdM) → chrono en avance de 10 min toute la 1re période. Sans gravité (aucune logique de jeu ne dépend de la minute — les résolutions se font sur les **statuts**), et l'admin peut corriger le champ temps manuellement. Post-event : ancrer l'estimation sur la détection du passage `upcoming → live`.

---

## 📕 ÉCARTS GUIDE ↔ CODE (vérifiés sur le user_guide officiel)

### 🟠 GAP A — 4 des 5 badges promis sont INATTEIGNABLES

> ✅ **APPLIQUÉ (2026-06-11, typecheck OK)**
> - `lib/db.ts` : nouvelle fonction exportée `awardEarnedBadges(userId)` (calcule oracle_bleu / visionnaire / roi_buteurs / nostradamus depuis les paris GAGNÉS ; règle anti-triche respectée). `legende` reste géré côté store.
> - `db/route.ts` (op `resolve_market`) **et** `sync/route.ts` (résolution auto live) : après marquage des paris gagnants, appel `awardEarnedBadges` pour chaque gagnant + `game_event` type `badge` (marquee écran) + `player_update`.
> - **Limite mineure connue** : en résolution AUTO (live), le `game_event` « NOUVEAU BADGE » s'affiche bien (overlay + marquee), mais la liste `myBadges` du profil du joueur ne se rafraîchit qu'au prochain chargement (le `player_update` SSE ne transporte pas la liste de badges). Le badge est bien persisté. Polish optionnel post-événement : diffuser la liste de badges dans `player_update` ou un event dédié.

Le guide (§2C) promet 5 badges. En réalité **seul « Légende des Toiles » peut être obtenu**.

**Preuve dans le code :**
- `updateMissionProgress` n'est appelé qu'avec `'bet_count'` et `'buteur_count'` ([store.ts:649-650](src/lib/store.ts#L649)). Il **n'est jamais appelé avec `'exact_score'`** → la mission « Nostradamus en Herbe » ne progresse jamais → le badge **`visionnaire` n'est jamais accordé**.
- Les badges **`nostradamus` (5 bons paris consécutifs)**, **`oracle_bleu` (10 bons paris au total)** et **`roi_buteurs` (5 buteurs trouvés)** n'ont **aucune logique** dans tout le code (aucune mission ne les octroie).
- L'op `unlock_badge` ([db/route.ts:492](src/app/api/db/route.ts#L492)) existe mais **n'a aucun appelant**.
- Seul `legende` est accordé (dans `store.updateLeaderboard`, quand l'utilisateur passe rang 1 avec ≥1 pari gagné).

**Correctif** — accorder les badges **au moment de la résolution** (serveur, source de vérité), à partir de la table `bets`. Ajouter un helper appelé depuis `resolve_market` (et la résolution du sync) après le marquage des paris gagnants :

```ts
// src/lib/db.ts — nouvelle fonction exportée
export function awardEarnedBadges(userId: string, matchId: string) {
  const won = db.prepare(
    "SELECT b.*, m.type as market_type FROM bets b JOIN markets m ON b.market_id = m.id " +
    "WHERE b.user_id = ? AND b.status = 'won' ORDER BY b.created_at"
  ).all(userId) as any[];
  const give = (code: string) =>
    db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_code) VALUES (?, ?)').run(userId, code);

  // Règle anti-triche déjà respectée : on ne traite que des paris GAGNÉS.
  if (won.length >= 10) give('oracle_bleu');                                  // 10 bons paris au total
  if (won.some(b => b.market_type === 'exact_score')) give('visionnaire');    // un score exact
  if (won.filter(b => b.market_type === 'first_scorer').length >= 5) give('roi_buteurs'); // 5 buteurs
  // nostradamus = 5 paris gagnés consécutifs (sur l'ordre chronologique de TOUS les paris du joueur)
  const all = db.prepare("SELECT status FROM bets WHERE user_id = ? ORDER BY created_at").all(userId) as {status:string}[];
  let streak = 0, best = 0;
  for (const b of all) { if (b.status === 'won') { streak++; best = Math.max(best, streak); } else if (b.status === 'lost') streak = 0; }
  if (best >= 5) give('nostradamus');
}
```
Puis dans `db/route.ts` (op `resolve_market`) **et** `sync/route.ts` (`resolveMarket`), après la boucle qui passe les paris à `won`, appeler `awardEarnedBadges(bet.user_id, matchId)` pour chaque gagnant, puis re-broadcaster `player_update`. Émettre aussi un `game_event` `badge` pour l'écran géant (le marquee les attend, §4).

> Sans ce correctif, la promesse « badges prestigieux » du guide ne tient pas : les joueurs ne décrocheront que « Légende » (le n°1).

### 🟡 GAP B — Montants de mise non conformes au guide

> ✅ **PARTIELLEMENT APPLIQUÉ (2026-06-11, typecheck OK)** — Puces de mise alignées sur le guide : `[50, 100, 250, 500]` dans `page.tsx` (`BetSlipBody`). **Reste optionnel** : ajouter un `<input type="number">` pour la « saisie d'un montant précis » (le slider step 10 fait déjà l'appoint) — à trancher ou corriger le guide.

Le guide (§2B) annonce des mises rapides **« 50, 100, 250, 500 TC »** et la possibilité de **« saisir un montant précis »**. Le code ([page.tsx:674](src/app/page.tsx#L674)) propose les puces **`[10, 50, 100, 250]`**, un slider plafonné à `min(solde, 500)`, et **aucun champ de saisie libre**.

**Correctif** (`src/app/page.tsx`, `BetSlipBody`) :
- Aligner les puces : `{[50, 100, 250, 500].map(...)}`.
- Ajouter un `<input type="number">` (min 10, max = solde) lié à `betAmount` pour la saisie précise, OU corriger le guide. **Décision produit à prendre** — le plus simple jour J : aligner le guide sur le code (10/50/100/250), sans toucher au code.

### 🟡 GAP C — Pari Flash : la limite de 5 minutes n'est pas appliquée

> ✅ **APPLIQUÉ (2026-06-11)** — `place_bet` ([db/route.ts](src/app/api/db/route.ts)) refuse un pari flash dont `closes_at` est dépassé (« Pari flash expiré. »). L'admin peut toujours geler manuellement. (Grisage UI live = polish optionnel.)

Le guide (§3B) dit « les joueurs ont **5 minutes** pour répondre ». Le code pose bien `closes_at = now + 5 min` ([db/route.ts:421](src/app/api/db/route.ts#L421)) mais **rien ne lit `closes_at`** pour fermer le marché : il reste ouvert jusqu'à ce que l'admin le **GÈLE** manuellement. Les paris flash ne sont pas non plus auto-résolus.

**Correctif (léger)** : dans `place_bet`, refuser si `market.is_flash` et `closes_at < now`. Idéalement, un effet d'UI sur `/screen` + `/` qui grise le marché flash passé `closes_at`. **Pour lundi** : l'admin gèle le pari flash à la main (acceptable).

### ℹ️ Inexactitudes de documentation (corriger le guide, pas le code)

- §3A : « recherche du match via l'intégration avec **API-Football** ». En réalité la recherche/sélection passe par **odds-api.io** ([matches/search/route.ts](src/app/api/admin/matches/search/route.ts)) ; API-Football ne sert qu'à enrichir stats/buteurs en direct.
- §4 : « les **logos** des équipes ». L'écran affiche en fait des **drapeaux** (`flagFor`, [screen/page.tsx:7](src/app/screen/page.tsx#L7)) — parfait pour une Coupe du Monde France/Sénégal, mais ce ne sont pas des logos de club.

### ✅ Conformités vérifiées (RAS)

- Inscription : pseudo 3–15 caractères + 1 000 TC offerts → conforme ([join/page.tsx:45-46](src/app/join/page.tsx#L45), [db/route.ts:208](src/app/api/db/route.ts#L208)).
- Marchés de paris listés (§2B) → tous présents dans le blueprint.
- Suspension auto des cotes impossibles → conforme (`suspendImpossibleOutcomes`).
- Règle anti-triche « pas de badge sans ≥1 pari gagné » → respectée (et à conserver dans le correctif GAP A).
- Heartbeat 20 s, présence écran 15 min, double gains ×2, registre de lots, archive JSON, marquee → conformes.

---

## Récapitulatif des correctifs code (par ordre d'application)

| # | Priorité | Fichier(s) | Nature |
|---|----------|-----------|--------|
| 1 | 🔴 | `screen/page.tsx:113`, `ranking/page.tsx:142` | Inclure `half_time` dans la condition de poll |
| 2 | 🔴 | `docker-compose.yml` | `env_file: .env.local` (si Docker) |
| 3 | 🟠 | `db/route.ts` (`end_match`) + `lib/resolve.ts` | Résolution auto à la fin manuelle (option B) |
| 5 | 🔒 | `db/route.ts` (POST), `.env.local` | Garde `x-admin-secret` sur ops sensibles |
| 6 | 🟠 | `db/route.ts:241` | Rejet pari si cote ≤ 1 |
| 7 | 🟡 | `page.tsx:499,506` | Vraies stats extérieur |
| 8 | 🟡 | `sync/route.ts:323` | Parsing date mi-temps |
| 9 | 🟡 | `api/events/route.ts` | `clearInterval(hb)` au catch |
| A | 🟠 | `lib/db.ts` + `db/route.ts` + `sync/route.ts` | Accorder les 4 badges manquants à la résolution |
| B | 🟡 | `page.tsx` (`BetSlipBody`) | Mises 50/100/250/500 + saisie libre (ou corriger le guide) |
| C | 🟡 | `db/route.ts` (`place_bet`) | Faire respecter la fermeture flash à 5 min |

**Minimum vital pour lundi** : **#1** (sinon 2e mi-temps invisible) + **#2 si Docker**. Le reste améliore robustesse/équité/sécurité.
**Pour tenir les promesses du guide** : **GAP A** (badges) est le plus visible côté joueurs — fortement recommandé.
