# LobbyBot Premium — Design

**Date:** 2026-07-14
**Statut:** en attente de validation utilisateur

## Concept

Abonnement optionnel payé via Discord (App Subscriptions). Le cœur du premium :
**« ta flotte perso »** — l'utilisateur a ses propres bots dédiés et les fait venir
dans son propre groupe Fortnite (vitrine de skins pour screenshots/vidéos), sans
partager avec personne.

Le modèle « bots perso » (vs pool premium partagé) élimine la contention : si N
premium lancent `/squad` en même temps, chacun invite SES bots, aucun conflit,
ça scale linéairement.

## Offre

**⭐ LobbyBot Premium — 4,99 €/mois** (palier unique ; réduction annuelle en fast-follow).

| Avantage | Détail |
|---|---|
| 🤖 Flotte perso | Jusqu'à **3 bots** dédiés à ton pseudo (au lancement ; extensible à 5) |
| 🎬 `/squad` | Tes bots rejoignent ton groupe en une commande |
| 💃 Emotes synchronisées | Tous tes bots jouent la même emote en même temps (clips) |
| 🎭 Presets de loadout | Sauvegarde/applique tes combos ; appliqués auto quand tes bots te rejoignent |
| 🚀 Génération prioritaire | File `/createbot` prioritaire + quota élevé |
| 👑 Statut | Rôle premium Discord (persistant) + salon VIP + support prioritaire |

## Découpage Gratuit / Premium

**🆓 Gratuit (le funnel — reste attractif) :**
- `/add` : 1 bot de la flotte commune
- `/skin`, `/invite` (dropdown des bots amis)
- Commandes `!` en jeu, **y compris `!hide` et `!copy`** (elles marchent déjà ;
  les gater par le premium côté in-game est trop fragile — elles restent l'appât)
- `/locker`, `/shop`, `/news`, `/status`, etc.
- Le status « USE CODE aeroz » tourne sur tous les bots (pub code créateur)

**⭐ Premium :** tout le tableau ci-dessus. Gaté par une entitlement Discord
vérifiable → pas d'ambiguïté.

## Monétisation

**Principal : Discord App Subscriptions (User Subscription).**
- SKU « LobbyBot Premium » créé dans le Developer Portal (type user subscription).
- Prérequis : app vérifiée, appartenant à une Team, propriétaire 18+/2FA, liens
  CU + PC (faits), infos de payout. (Checklist Discord en cours côté utilisateur.)
- Détection : `interaction.entitlements` à chaque interaction ; réponse
  `PremiumRequired` pour proposer l'abonnement sur une commande premium.
- Sync rôle : events `entitlementCreate` → donner le rôle premium ;
  `entitlementDelete` → le retirer.

**Plan B (résilience) :** garder une voie de paiement externe (Ko-fi/Stripe +
attribution manuelle/webhook du rôle) au cas où Discord coupe la monétisation
(automatiser Fortnite est en zone grise vis-à-vis d'Epic). Le code doit traiter le
statut premium comme **une donnée interne** (flag en base), alimentée SOIT par les
entitlements Discord SOIT par la voie externe — pas de couplage dur à Discord.

## Architecture technique

### Détection & stockage du statut premium
- Source de vérité interne : un flag premium par utilisateur (table `users` ou
  table dédiée `premium` avec `discord_id`, `source`, `expires_at`).
- Alimenté par : listener `entitlementCreate/Delete` (Discord) + éventuel webhook
  externe. Un helper `isPremium(discordId)` unique consulté partout.

### Quota de bots perso
- Colonne `owner_discord_id` existe déjà sur `epic_accounts`.
- `isPremium` → quota 3 ; gratuit → quota selon règle actuelle (`/createbot` gated).
- `GeneratorManager` : file prioritaire — les jobs premium passent devant. Ajouter
  une priorité au `QueueItem` et insérer en tête (ou file séparée servie d'abord).

### `/squad`
- Récupère les bots dont `owner_discord_id = user` ET connectés.
- Chacun invite/rejoint le groupe de l'utilisateur (réutilise le flux
  `party:invite` déjà géré + `BotManager.inviteToParty` déjà écrit).
- Applique le preset de loadout actif si défini.

### Emotes synchronisées
- `/emote-all <nom>` : sur chaque bot perso présent dans le groupe de l'user,
  `ModernParty.setEmote`. Gaté premium.

### Presets de loadout
- Table `loadout_presets` (`discord_id`, `name`, `outfit`, `backpack`, `pickaxe`,
  `emote`). Commandes `/preset save|apply|list`. Appliqué auto au join dans `/squad`.

### Rôle premium
- ID de rôle configurable en `.env`. Assigné/retiré via les events d'entitlement.

## Hors périmètre (plus tard)
- Skins OG rares réservés premium (nécessite d'acheter des comptes OG — coûteux).
- Facturation annuelle + réductions.
- Paliers multiples (light/pro).
- Gating premium des commandes in-game (`!hide`/`!copy`) — trop fragile pour l'instant.

## Pages légales
Faites et en ligne dans `lobbybot2.0-website/public/` :
`terms-of-service.html` (section Abonnements Premium) + `privacy-policy.html`
(données de paiement). Reste à les rendre **publiquement joignables** (GitHub Pages
en interim, puis domaine sur le VPS) pour les soumettre à Discord.
