# 📋 CHANGELOG - LobbyBot 2.0

## [2.1.0] - 2026-07-07

### 🔥 Corrections Critiques

#### Authentification Epic Games (FIX MAJEUR)
- **Problème corrigé:** L'URL d'activation Epic Games ne pré-remplissait pas automatiquement le code
- **Solution:** Utilisation de `verification_uri_complete` fourni par l'API Device Code Flow d'Epic
- **Impact:** Les utilisateurs peuvent maintenant se connecter en 1 clic sans copier/coller de code manuellement
- **Fichiers modifiés:** `src/managers/UserManager.ts`

#### Sécurité - Credentials exposés
- **Problème corrigé:** Le fichier `.env` avec les credentials était tracké par Git
- **Solution:** Ajout de `.env` au `.gitignore` et création de `.env.example`
- **Impact:** Protection des tokens Discord et credentials de base de données

### ✨ Nouvelles Fonctionnalités

#### Commande /ping
- Nouvelle commande pour vérifier la latence du bot
- Affiche la latence bot et la latence API Discord
- **Fichier créé:** `src/commands/PingCommand.ts`

#### Système de Rate Limiting
- Protection anti-spam avec cooldown de 3 secondes entre commandes
- Exceptions pour `/ping` et `/help`
- Messages d'erreur bilingues (FR/EN)
- **Fichier modifié:** `src/managers/DiscordManager.ts`

#### Cache API Fortnite
- Cache en mémoire avec TTL de 5 minutes pour `/shop`, `/map`, `/news`
- Réduit la charge sur l'API Fortnite-API.com
- Améliore les temps de réponse des commandes
- **Fichier modifié:** `src/managers/APIManager.ts`

### 🔧 Améliorations

#### Auto-Reconnexion des Bots
- Les bots se reconnectent automatiquement en cas de déconnexion
- Retry automatique toutes les 30 secondes puis 1 minute
- Gestion des événements `disconnected` et `session:close`
- **Fichier modifié:** `src/managers/BotManager.ts`

#### Robustesse Base de Données
- Retry automatique (3 tentatives) sur les queries critiques
- Délai exponentiel entre les tentatives (1s, 2s, 3s)
- Meilleure gestion des erreurs de connexion
- **Fichier modifié:** `src/managers/DatabaseManager.ts`

#### Optimisation Base de Données
- Ajout d'index sur `discord_id` dans la table `users`
- Ajout d'index sur `email` dans la table `epic_accounts`
- Amélioration des performances des queries
- **Fichier modifié:** `src/managers/DatabaseManager.ts`

#### Messages d'Erreur Améliorés
- Messages d'erreur traduits en français et anglais
- Messages plus explicites et utiles
- **Fichier modifié:** `src/managers/DiscordManager.ts`

#### Timeout getUserLang Augmenté
- Timeout passé de 1.5s à 3s pour éviter les timeouts sous charge
- Meilleure stabilité lors de pics d'utilisation
- **Fichier modifié:** `src/managers/DiscordManager.ts`

### 📝 Documentation

- Création du rapport d'audit (`AUDIT_RAPPORT.md`)
- Création de ce CHANGELOG
- Ajout de `.env.example` pour faciliter la configuration

---

## [2.0.0] - 2026-01-10

### Fonctionnalités Initiales
- Architecture multi-comptes avec gestion illimitée de bots
- Load balancing intelligent (<900 amis par bot)
- Système d'utilisateurs avec Device Code Flow Epic Games
- Base de données PostgreSQL
- Internationalisation (FR/EN/ES/DE)
- Dashboard web avec Socket.io
- Commandes Discord complètes (/login, /add, /shop, /map, etc.)
- Admin tools pour gestion à chaud
