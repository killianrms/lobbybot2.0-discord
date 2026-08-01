# 🎮 LobbyBot 2.0 - Discord Manager

Le cœur du système de gestion de bots Fortnite. Ce projet permet de gérer des centaines de LobbyBots depuis une seule instance Node.js, connectée à une base de données et un dashboard web.

## 🚀 Fonctionnalités

*   **Multi-Comptes** : gère un nombre illimité de bots simultanément (reconnexion auto, health check, alertes).
*   **Recherche cosmétique intelligente** : plus de 10 000 cosmétiques indexés en mémoire, tolérance aux fautes de frappe et styles compris directement dans la commande (`!skin ghoul rose` → Ghoul Trooper Pink, `!skin skull violet` → Purple Glow, `!skin drift 4` → Stage 4).
*   **Copie complète (`!copy`)** : le bot copie le skin, les styles **et rejoue les danses du joueur en direct** (mode mimic).
*   **Défilé des nouveautés (`!new`)** : le bot équipe un par un les cosmétiques ajoutés par la dernière MAJ — souvent avant leur sortie en boutique.
*   **Lobby exclusif** : dès qu'un joueur rejoint un bot, sa party passe en privé et il refuse les autres invitations ; il redevient disponible quand il est seul (`EXCLUSIVE_LOBBY=false` pour désactiver). Un joueur AFK est libéré après `EXCLUSIVE_IDLE_MINUTES` (défaut 5) pour éviter les trolls.
*   **Bot lobby (`/control`)** : le bot promeut le joueur chef ; le joueur lance la partie depuis son propre client Fortnite (le vrai matchmaking, qui possède le droit « PLAY »), le compte bot **bas niveau** tire le lobby vers des bots, puis quitte au démarrage. Aucune API non officielle. ⚠️ Ne fonctionne que si le compte bot est récent / bas niveau.
*   **Load Balancing Intelligent** : sélectionne automatiquement le bot le moins chargé (<900 amis) pour les nouveaux amis.
*   **LobbyBot Premium** : flotte de bots perso via les abonnements Discord natifs (`/premium`, `/squad`, `/emote-all`, `/preset`).
*   **Internationalisation (i18n)** : anglais par défaut, FR/ES/DE via `/setlangage` (les noms de commandes slash restent en anglais, seules les descriptions/réponses changent).
*   **Base de Données partagée** : SQLite commune avec le dashboard web (`lobbybot2.0-website`).
*   **Admin Tools** : ajout de bots à chaud, backup/restore, grant premium, générateur de comptes.

## 🕹️ Commandes In-Game (chat du lobby Fortnite ou MP Epic)

> Liste complète avec alias et exemples sur la page **/commands** du dashboard, ou via `/commands` sur Discord.

### 👗 Cosmétiques
*   `!skin <nom>` — change le skin (fautes tolérées, styles inline : `!skin ghoul rose`, `!skin drift 4`) *(alias `!outfit`)*
*   `!style <style>` — applique un style au skin actuel (`!style rose`, `!style gold`, `!style stage 3`) *(alias `!variant`)*
*   `!pinkghoul` / `!purpleskull` — raccourcis instantanés
*   `!backpack <nom|none>` *(alias `!bag`, `!sac`)* · `!pickaxe <nom>` *(`!pioche`)* · `!glider <nom>` *(`!planeur`)* · `!shoes <nom|none>` *(`!kicks`)*
*   `!emote <nom>` *(alias `!dance`, `!danse`)* · `!stopdanse`
*   `!copy [pseudo]` — copie skin + styles + **danses en direct** · `!stopcopy`
*   `!new [skins|emotes|sacs|pioches]` — défilé des nouveautés de la MAJ · `!stop`
*   `!random [skin|emote|pioche|sac|planeur]` *(alias `!rdm`)*
*   `!level <n>` *(alias `!niveau`)*

### 🎮 Lobby
*   `!hide [me]` / `!show` — cache tout le monde sauf le bot (screens 😏, bot chef requis)
*   `!ready` / `!unready` · `!sitout` / `!sitin`
*   `!invite [pseudo]` — le bot t'invite dans son groupe
*   `!partyinfo` · `!fc` (nombre d'amis du bot)
*   Admin (pseudos `LOBBY_ADMIN_PSEUDOS`) : `!kick`, `!promote`, `!privacy`, `!leave`, `!add`
*   `!help` / `!ping`

## 🤝 Commandes Discord

### 👤 Utilisateur
*   `/login` / `/logout` : lier son compte Epic Games (device flow 1 clic).
*   `/add [pseudo]` : un bot envoie une demande d'ami (auto si connecté).
*   `/skin <bot> <nom>` : fait porter un skin à un de ses bots amis.
*   `/invite [bot]` : un bot t'invite dans son groupe.
*   `/remove` · `/list` · `/locker` · `/shop` · `/map` · `/news` · `/status`
*   `/sac [code]` : code créateur (défaut **aeroz**).
*   `/setlangage <lang>` : EN (défaut) / FR / ES / DE.
*   `/commands` : aide paginée complète (in-game + Discord + premium), localisée.

### 💎 Premium (abonnement Discord natif)
*   `/premium` : découvrir / gérer son abonnement.
*   `/control` : **bot lobby** — le bot te passe le lead, tu lances la partie, il quitte → lobby de bots.
*   `/squad` : ses bots perso rejoignent son groupe Fortnite.
*   `/emote-all <nom>` : tous ses bots dansent la même emote en même temps.
*   `/preset save|apply|list` : loadouts complets sauvegardés et appliqués à toute la flotte.

### 🛡️ Admin
*   `/admin addbot|sac-all|backup|restore|createbot|config|premium` (réservé `ADMIN_IDS`).

## 🛠️ Installation & Démarrage

1.  **Pré-requis** : Node.js 20+ (ou Docker).
2.  **Configuration** : copiez `.env.example` → `.env` (`DISCORD_TOKEN`, `DB_PATH`, `MANAGER_SECRET`…).
3.  **Lancer** :

```bash
npm install
npm start          # build + node dist/index.js
# ou avec Docker :
docker-compose up -d --build
```

## 📂 Structure du Projet

*   `src/managers/` : gestionnaires principaux (BotManager, CommandManager in-game, Database, Discord, Generator…).
*   `src/commands/` : commandes slash Discord individuelles.
*   `src/actions/` : logique des actions Fortnite (Cosmetics, Party, Social).
*   `src/services/` : `CosmeticSearchService` (index fuzzy + variantes), FortniteAPI.
*   `src/utils/` : `ModernParty` (meta party moderne : loadout, variantes, mimic, hide…), EOSPresence, SecureChat, locales.
*   `src/cosmetics/` : données héritées.

## ⚙️ Variables d'environnement notables

| Variable | Rôle |
|---|---|
| `EXCLUSIVE_LOBBY` | `true` (défaut) : bot occupé = party privée + invitations refusées |
| `EXCLUSIVE_IDLE_MINUTES` | libération auto d'un joueur AFK (défaut 5) |
| `BOTLOBBY_LEAVE_DELAY_MS` | délai avant que le bot quitte au lancement d'un bot lobby (défaut 2500) |
| `LOBBY_ADMIN_PSEUDOS` | pseudos Epic autorisés aux commandes admin in-game |
| `DEFAULT_SKIN` / `DEFAULT_LEVEL` | loadout appliqué à chaque nouvelle party |
| `PREMIUM_BOT_QUOTA` / `PREMIUM_SKU_ID` | config LobbyBot Premium |
| `MIN_ACTIVE_BOTS_ALERT` | seuil d'alerte bots actifs |

Fait par @Killianrms !
