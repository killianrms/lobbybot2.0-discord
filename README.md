<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Discord.js-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js"/>
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/>
</p>

<h1 align="center">🎮 Fortnite LobbyBot Manager</h1>

<p align="center">
  <strong>Gestionnaire multi-comptes de bots Fortnite via Discord</strong><br/>
  Gérez des centaines de LobbyBots depuis une seule instance Node.js
</p>

<p align="center">
  <a href="#-fonctionnalités">Fonctionnalités</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-commandes">Commandes</a> •
  <a href="#-architecture">Architecture</a>
</p>

---

## 📋 Table des matières

- [✨ Fonctionnalités](#-fonctionnalités)
- [🛠️ Prérequis](#️-prérequis)
- [🚀 Installation](#-installation)
  - [Avec Docker (Recommandé)](#avec-docker-recommandé)
  - [Installation manuelle](#installation-manuelle)
- [⚙️ Configuration](#️-configuration)
- [💬 Commandes Discord](#-commandes-discord)
- [🏗️ Architecture](#️-architecture)
- [🔧 Technologies](#-technologies)
- [📄 Licence](#-licence)

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **🤖 Multi-Comptes** | Gère un nombre illimité de bots Fortnite simultanément |
| **⚖️ Load Balancing** | Sélection automatique du bot le moins chargé (<900 amis) |
| **👤 Système Utilisateurs** | Connexion via `/login` pour l'ajout automatique d'amis |
| **🌍 Internationalisation** | Support multilingue (FR, EN, ES, DE) |
| **🎨 Cosmétiques** | Changement de skin, sac à dos, pioche et emotes en temps réel |
| **📊 Dashboard** | Interface web pour le monitoring (port 3000) |
| **🐳 Dockerisé** | Déploiement simplifié avec Docker Compose |
| **🔐 Admin Tools** | Commandes sécurisées pour la gestion à chaud |

---

## 🛠️ Prérequis

- [Node.js](https://nodejs.org/) v18+ 
- [pnpm](https://pnpm.io/) (gestionnaire de paquets)
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/) (recommandé)
- [PostgreSQL](https://www.postgresql.org/) 14+ (si installation manuelle)
- Un [Bot Discord](https://discord.com/developers/applications) avec token

---

## 🚀 Installation

### Avec Docker (Recommandé)

```bash
# 1. Cloner le repository
git clone https://github.com/votre-username/lobby-bot.git
cd lobby-bot

# 2. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. (Optionnel) Ajouter vos comptes
cp accounts.example.csv accounts.csv
# Éditer accounts.csv avec vos comptes bot

# 4. Lancer les services
docker-compose up -d --build
```

**Services démarrés :**
| Service | Port | Description |
|---------|------|-------------|
| Manager | - | Bot Discord & Gestionnaire |
| Dashboard | 3000 | Interface web de monitoring |
| PostgreSQL | 5432 | Base de données |

### Installation manuelle

```bash
# 1. Cloner et installer les dépendances
git clone https://github.com/votre-username/lobby-bot.git
cd lobby-bot
pnpm install

# 2. Configurer l'environnement
cp .env.example .env

# 3. Compiler le TypeScript
pnpm run build

# 4. Lancer l'application
pnpm start
```

---

## ⚙️ Configuration

Créez un fichier `.env` à la racine du projet :

```env
# Discord
DISCORD_TOKEN=votre_token_discord

# Base de données PostgreSQL
DB_HOST=localhost
DB_USER=lobbybot
DB_PASS=lobbybotpassword
DB_NAME=lobbybot

# Dashboard (optionnel)
DASHBOARD_URL=http://localhost:3000
```

### Format du fichier `accounts.csv`

```csv
pseudo,email,password,device_id,account_id,secret
MonBot1,email@example.com,password123,device_id,account_id,secret
```

> ⚠️ **Note** : Utilisez `pnpm run generate-auth` pour générer les device auth de vos comptes.

---

## 💬 Commandes Discord

### 👤 Commandes Utilisateur

| Commande | Description |
|----------|-------------|
| `/login <code>` | Se connecter avec un code d'autorisation Epic Games |
| `/logout` | Se déconnecter et supprimer ses données |
| `/add [pseudo]` | Ajouter un bot en ami (auto si connecté) |
| `/list` | Afficher sa liste d'amis avec pagination |
| `/locker` | Afficher un résumé de son casier Fortnite |
| `/shop` | Afficher la boutique du jour |
| `/map` | Afficher la carte actuelle |
| `/news` | Afficher les actualités Fortnite |
| `/sac <code>` | Définir son code créateur (SAC) |
| `/setlanguage <lang>` | Changer la langue (fr/en/es/de) |

### 🤖 Commandes Bot (In-Game Chat)

| Commande | Description |
|----------|-------------|
| `!skin <nom>` | Changer le skin du bot |
| `!backpack <nom>` | Changer le sac à dos |
| `!pickaxe <nom>` | Changer la pioche |
| `!emote <nom>` | Jouer une emote |
| `!ready` | Passer en mode prêt |
| `!leave` | Quitter le groupe |

### 📊 Commandes Informations

| Commande | Description |
|----------|-------------|
| `/listbots` | Liste des bots connectés et leur charge |
| `/info` | Statistiques globales du service |
| `/status` | État des services Fortnite |

### 🛡️ Commandes Admin

| Commande | Description |
|----------|-------------|
| `/admin addbot` | Ajouter un nouveau bot à chaud |

---

## 🏗️ Architecture

```
src/
├── index.ts                 # Point d'entrée
├── actions/                 # Actions Fortnite (Cosmetics, Party, Social)
│   ├── CosmeticsActions.ts
│   ├── PartyActions.ts
│   └── SocialActions.ts
├── commands/                # Commandes Discord
│   ├── Command.ts           # Interface de base
│   ├── AddCommand.ts
│   ├── LoginCommand.ts
│   └── ...
├── core/                    # Cœur applicatif
│   ├── errors/              # Classes d'erreur personnalisées
│   └── interfaces/          # Interfaces et types
├── managers/                # Gestionnaires principaux
│   ├── BotManager.ts        # Gestion des bots Fortnite
│   ├── CommandManager.ts    # Gestion des commandes chat
│   ├── DatabaseManager.ts   # Accès base de données
│   ├── DiscordManager.ts    # Client Discord
│   └── UserManager.ts       # Gestion des utilisateurs
├── services/                # Services externes
│   └── FortniteAPIService.ts
├── types/                   # Types TypeScript
└── utils/                   # Utilitaires
    └── locales.ts           # Internationalisation
```

---

## 🔧 Technologies

| Technologie | Usage |
|-------------|-------|
| **TypeScript** | Langage principal avec typage strict |
| **discord.js** | Framework Discord |
| **fnbr** | Client Fortnite |
| **PostgreSQL** | Base de données relationnelle |
| **Docker** | Containerisation |
| **Axios** | Client HTTP |
| **Socket.io** | Communication temps réel |

---

## 📜 Scripts disponibles

```bash
pnpm run build          # Compile TypeScript
pnpm start              # Build + Lance l'application
pnpm run dev            # Mode développement
pnpm run generate-auth  # Génère les device auth
```

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Merci de respecter les [instructions de développement](.copilot-instructions.md) pour maintenir la qualité du code.

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add: AmazingFeature'`)
4. Push sur la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

---

## 📄 Licence

Ce projet est sous licence privée. Tous droits réservés.

---

<p align="center">
  Fait avec ❤️ pour la communauté Fortnite
</p>
