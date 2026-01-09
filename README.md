# 🎮 LobbyBot 2.0 - Discord Manager

Le cœur du système de gestion de bots Fortnite. Ce projet permet de gérer des centaines de LobbyBots depuis une seule instance Node.js, connectée à une base de données et un dashboard web.

## 🚀 Fonctionnalités

*   **Multi-Comptes** : Gère illimité de bots simulanément.
*   **Architecture Monolithique** : Un seul processus Node.js pour tous les bots.
*   **Base de Données** : PostgreSQL pour stocker les comptes et les stats.
*   **Dockerisé** : Déploiement facile avec `docker-compose`.
*   **Intégration Discord** : Commandes slash (ex: `/add`) et chat.
*   **Connexion Dashboard** : Envoie les statuts en temps réel au Dashboard Web.

## 🛠️ Installation & Démarrage (Docker)

C'est la méthode recommandée.

1.  **Pré-requis** : Avoir Docker et Docker Compose installés.
2.  **Configuration** :
    *   Créez un fichier `.env` avec votre `DISCORD_TOKEN`.
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

*   `src/managers/` : Logique de gestion (Bots, Database, Commandes).
*   `src/actions/` : Logique des actions Fortnite (Skin, Party, Friends).
*   `.env` : Variables d'environnement (Token Discord, DB creds).
*   `accounts.csv` : Fichier d'import des comptes (Email, DeviceAuth).

## 🤝 Commandes

*   **Chat** :
    *   `!skin <nom>` : Change le skin du bot.
    *   `!kick <pseudo>` : Exclut un joueur.
    *   `!promote <pseudo>` : Promeut un joueur chef.
*   **Discord** :
    *   `/add <pseudo>` : Ajoute un ami via un bot disponible.

