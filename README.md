# Fortnite Multi-Bot Manager

Gestionnaire de bots Fortnite multi-comptes avec gestion automatique des device auth.

## 🚀 Installation

```bash
npm install
```

## 📝 Configuration

### 1. Générer un Device Auth

Pour chaque nouveau compte, vous devez générer un device auth :

```bash
npm run generate-auth
```

Suivez les instructions affichées dans le terminal.

### 2. Ajouter le compte au CSV

Ajoutez la ligne dans `accounts.csv` avec le format :

```csv
pseudo,email,password,device_id,account_id,secret
MonBot,email@example.com,password,device_id_xxx,account_id_xxx,secret_xxx
```

## 🎮 Lancer les bots

```bash
npm start
```

Ou en mode dev :

```bash
npm run dev
```

## 📊 Structure

```
src/
├── index.ts              # Point d'entrée principal
├── api.ts                # API pour gestion programmatique
├── getDeviceAuth.ts      # Script pour générer device auth
├── types/
│   └── index.ts          # Types TypeScript
└── managers/
    ├── CSVManager.ts     # Gestion du CSV
    └── BotManager.ts     # Gestion des bots
```

## ✨ Fonctionnalités

- ✅ Multi-bots avec device auth
- ✅ Auto-accept friends
- ✅ Auto-accept party invites
- ✅ Commandes de chat (ping, salut)
- ✅ Logs détaillés par bot
- ✅ API pour gestion programmatique

## 🔒 Sécurité

⚠️ `accounts.csv` contient des informations sensibles et est ignoré par git.

## 📌 Commandes npm

- `npm run build` - Compile le TypeScript
- `npm start` - Compile et lance les bots
- `npm run dev` - Mode développement (compile + lance)
- `npm run generate-auth` - Génère un device auth pour un nouveau compte

## 💡 Utilisation de l'API

```typescript
import { BotAPI } from './api';

// Obtenir le statut de tous les bots
const status = await BotAPI.getBotStatus();

// Relancer un bot
await BotAPI.restartBot('email@example.com');

// Lancer les bots inactifs
await BotAPI.launchInactiveBots();
```
