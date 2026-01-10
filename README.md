# 🎮 LobbyBot 2.0 - Discord Manager

Le cœur du système de gestion de bots Fortnite. Ce projet permet de gérer des centaines de LobbyBots depuis une seule instance Node.js, connectée à une base de données et un dashboard web.

## 🚀 Fonctionnalités
*   **Multi-Comptes** : Gère illimité de bots simultanément.
*   **Load Balancing Intelligent** : Sélectionne automatiquement le bot le moins chargé (<900 amis) pour ajouter de nouveaux amis.
*   **Système d'Utilisateurs** : Permet aux utilisateurs de se connecter via `/login` pour autoriser les bots à les ajouter automatiquement.
*   **Architecture Modulaire** : Nouvelle structure de commandes (`src/commands/`) pour une maintenance facile.
*   **Base de Données** : PostgreSQL pour stocker les comptes, utilisateurs et préférences (langue).
*   **Internationalisation (i18n)** : Support FR/EN/ES/DE.
*   **Admin Tools** : Commandes sécurisées pour ajouter des bots à chaud.
*   **Dockerisé** : Déploiement facile avec `docker-compose`.

## 🛠️ Installation & Démarrage (Docker)

C'est la méthode recommandée.

1.  **Pré-requis** : Avoir Docker et Docker Compose installés.
2.  **Configuration** :
    *   Créez un fichier `.env` avec votre `DISCORD_TOKEN` et `DATABASE_URL`.
    *   (Optionnel) Placez votre `accounts.csv` à la racine pour l'import initial.
3.  **Lancer** :

```bash
docker-compose up -d --build
```

Cela lancera :
*   Le Manager
*   Le Dashboard (port 3000)
*   La Base de Données PostgreSQL

## 📂 Structure du Projet

*   `src/managers/` : Gestionnaires principaux (Bots, Database, User, API, Discord).
*   `src/commands/` : Commandes Discord individuelles.
*   `src/actions/` : Logique des actions Fortnite (Skin, Party, Friends).
*   `src/utils/` : Utilitaires (Locales, etc.).
*   `.env` : Variables d'environnement.

## 🤝 Commandes Discord

### 👤 Commandes Utilisateur
*   `/login <code>` : Se connecter avec un code d'autorisation Epic Games (pour l'auto-add).
*   `/logout` : Se déconnecter et supprimer ses données.
*   `/add [pseudo]` : Ajoute un bot en ami (Automatique si connecté, sinon spécifier pseudo).
*   `/list` : Affiche votre liste d'amis (avec pagination).
*   `/locker` : Affiche un résumé de votre casier (Skins, Pioches, ... + Légendaires).
*   `/shop` : Affiche la boutique du jour (Items à la une).
*   `/map` : Affiche la carte actuelle du Chapitre.
*   `/news` : Affiche les actualités du jeu.
*   `/sac <code>` : Définit votre code créateur (Support-A-Creator).
*   `/setlangage <lang>` : Change la langue du bot (fr/en/es/de).

### 🤖 Commandes Bot
*   `/listbots` : Affiche la liste des bots connectés et leur nombre d'amis.
*   `/info` : Statistiques globales du service.
*   `/status` : État des services Fortnite.

### 🛡️ Commandes Admin
*   `/admin addbot ...` : Ajoute un nouveau bot à la base de données et le lance immédiatement (réservé admin).

