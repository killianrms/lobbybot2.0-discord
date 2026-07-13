# 🔗 Contrat API - Discord Manager ↔ Website Dashboard

**Version:** 2.1.0
**Date:** 2026-07-07

---

## 📡 Socket.io Events

### Discord Manager → Website

#### `manager:login`
Envoyé au démarrage et toutes les 30 secondes pour synchroniser l'état des bots.

**Payload:**
```typescript
{
  id: 'fortnite-manager',
  type: 'manager',
  botCount: number,
  bots: Array<{
    name: string,        // Pseudo du bot
    friends: number,     // Nombre d'amis
    isOnline: boolean,   // État de connexion
    ping: number | null  // Latence XMPP (ms)
  }>
}
```

**Exemple:**
```json
{
  "id": "fortnite-manager",
  "type": "manager",
  "botCount": 3,
  "bots": [
    {
      "name": "AerozBot1",
      "friends": 234,
      "isOnline": true,
      "ping": 45
    },
    {
      "name": "AerozBot2",
      "friends": 567,
      "isOnline": true,
      "ping": 52
    }
  ]
}
```

---

#### `action:result`
Résultat d'une action exécutée sur un bot.

**Payload:**
```typescript
{
  action: string,      // Nom de l'action
  target: string,      // Bot ciblé ou username
  result: string,      // Message de résultat
  success: boolean     // true si succès
}
```

**Exemple:**
```json
{
  "action": "skin",
  "target": "AerozBot1",
  "result": "✅ Skin changé: Renegade Raider",
  "success": true
}
```

---

#### `heartbeat` (NOUVEAU)
Ping régulier pour vérifier la connexion (toutes les 10s).

**Payload:**
```typescript
{
  timestamp: number,   // Date.now()
  botCount: number     // Nombre de bots actifs
}
```

---

### Website → Discord Manager

#### `cmd:manager:add`
Demander au meilleur bot disponible d'ajouter un joueur en ami.

**Payload:**
```typescript
{
  target: string,       // Epic username à ajouter
  requester?: string    // Discord user qui demande (optionnel)
}
```

**Response:** `action:result`

**Exemple:**
```json
{
  "target": "Ninja",
  "requester": "aeroz#1234"
}
```

---

#### `cmd:manager:action`
Exécuter une action sur un bot spécifique.

**Payload:**
```typescript
{
  target: string,   // Nom du bot (pseudo)
  action: string,   // Nom de l'action
  data?: any        // Données optionnelles
}
```

**Actions disponibles:**

| Action | Data | Description |
|--------|------|-------------|
| `leave` | - | Quitter le lobby actuel |
| `kick` | `username: string` | Kick un joueur du lobby |
| `promote` | `username: string` | Promouvoir leader |
| `privacy` | `public\|private\|friends` | Changer la confidentialité |
| `ready` | - | Se mettre prêt |
| `unready` | - | Se mettre non prêt |
| `add` | `username: string` | Ajouter en ami |
| `skin` | `name: string` | Changer de skin |
| `backpack` | `name: string` | Changer de backpack |
| `pickaxe` | `name: string` | Changer de pioche |
| `emote` | `name: string` | Faire une emote |
| `stopdanse` | - | Arrêter l'emote |
| `level` | `number` | Changer de niveau BP |

**Response:** `action:result`

**Exemple:**
```json
{
  "target": "AerozBot1",
  "action": "skin",
  "data": "Renegade Raider"
}
```

---

#### `cmd:manager:addBot`
Ajouter un nouveau bot à la base de données et le lancer.

**Payload:**
```typescript
{
  pseudo: string,
  email: string,
  password: string,
  accountId: string,
  deviceId: string,
  secret: string
}
```

**Response:** `admin:addBotResult`

**Exemple:**
```json
{
  "pseudo": "NewBot3",
  "email": "bot3@example.com",
  "password": "",
  "accountId": "abc123...",
  "deviceId": "def456...",
  "secret": "ghi789..."
}
```

---

#### `globalConfig:current`
Envoyer la configuration globale actuelle au démarrage.

**Payload:**
```typescript
{
  status?: string,   // Message de statut
  joinMsg?: string,  // Message à l'entrée du lobby
  addMsg?: string    // Message à l'ajout d'ami
}
```

**Exemple:**
```json
{
  "status": "Utilisez le code créateur : aeroz",
  "joinMsg": "Bienvenue dans le lobby!",
  "addMsg": "Merci de m'avoir ajouté!"
}
```

---

#### `config:globalUpdate`
Mettre à jour la configuration globale (appliquée immédiatement sur tous les bots).

**Payload:** (identique à `globalConfig:current`)

---

### Website → Discord Manager (Responses)

#### `admin:addBotResult`
Résultat de l'ajout d'un bot.

**Payload:**
```typescript
{
  success: boolean,
  pseudo?: string,   // Si succès
  error?: string     // Si échec
}
```

---

## 🗄️ Base de Données Partagée

### Table: `epic_accounts`
```sql
CREATE TABLE epic_accounts (
    id SERIAL,
    email TEXT PRIMARY KEY,
    pseudo TEXT,
    password_enc TEXT,
    secret_id TEXT,           -- Device Auth Secret
    device_id TEXT,           -- Device Auth Device ID
    account_id TEXT,          -- Epic Account ID
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

CREATE INDEX idx_epic_accounts_email ON epic_accounts(email);
```

### Table: `users`
```sql
CREATE TABLE users (
    discord_id TEXT PRIMARY KEY,
    epic_pseudo TEXT,
    device_id TEXT,
    account_id TEXT,
    secret TEXT,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_discord_id ON users(discord_id);
```

### Table: `dashboard_admins` (Website uniquement)
```sql
CREATE TABLE dashboard_admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    failed_attempts INTEGER DEFAULT 0,
    locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔐 Codes d'Erreur Standard

### Success Codes
| Code | Description |
|------|-------------|
| `SUCCESS` | Opération réussie |
| `SUCCESS:pseudo` | Connexion réussie (avec pseudo) |

### Error Codes
| Code | Description |
|------|-------------|
| `ERROR` | Erreur générique |
| `FULL` | Tous les bots sont pleins (>900 amis) |
| `NOT_FOUND` | Bot/User non trouvé |
| `NOT_LOGGED_IN` | Utilisateur non connecté |
| `UNAUTHORIZED` | Non autorisé |
| `DB_ERROR` | Erreur base de données |
| `EXPIRED` | Token/Code expiré |
| `PENDING` | En attente (Device Code Flow) |
| `DENIED` | Accès refusé |

---

## 🔄 Flux de Connexion Socket.io

```
1. Discord Manager démarre
   ↓
2. Se connecte au Website (Socket.io)
   ↓
3. Envoie manager:login (état initial)
   ↓
4. Website envoie globalConfig:current
   ↓
5. Discord Manager applique la config
   ↓
6. Heartbeat toutes les 10s
   ↓
7. Updates toutes les 30s (manager:login)
```

---

## 🚨 Gestion des Déconnexions

### Discord Manager déconnecté
- Website affiche "Manager hors ligne"
- Les actions sont mises en queue (optionnel)
- Tentatives de reconnexion automatiques

### Website redémarre
- Discord Manager se reconnecte automatiquement
- Re-envoie manager:login
- Website re-envoie globalConfig:current

---

## 📝 Variables d'Environnement Partagées

### Discord Manager (.env)
```env
# Discord
DISCORD_TOKEN=...

# Database (DOIT correspondre au Website)
DB_HOST=...
DB_PORT=5432
DB_USER=...
DB_PASS=...
DB_NAME=...

# Dashboard
DASHBOARD_URL=http://localhost:3000
```

### Website (.env)
```env
# Server
PORT=3000

# Database (DOIT correspondre au Discord Manager)
DB_HOST=...
DB_PORT=5432
DB_USER=...
DB_PASS=...
DB_NAME=...

# Admin Seed (premier démarrage)
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=...
```

---

## ✅ Checklist d'Intégration

### Discord Manager
- [x] Socket.io avec auto-reconnect
- [x] Heartbeat toutes les 10s
- [x] Gestion des events Website
- [x] Codes d'erreur standardisés
- [x] Logs clairs

### Website
- [ ] Gestion du heartbeat (afficher timeout si >30s)
- [ ] Afficher "Manager hors ligne" si déconnecté
- [ ] Support des nouveaux codes d'erreur
- [ ] Logs synchronisés avec Discord Manager

---

## 🔧 Améliorations Futures

### Phase 2
- [ ] Authentification Socket.io (secret partagé)
- [ ] Event queue si Website down
- [ ] Métriques en temps réel (commandes/min, erreurs)
- [ ] Webhooks pour notifications

### Phase 3
- [ ] API REST en plus de Socket.io
- [ ] Health check endpoint
- [ ] Rate limiting côté Website
- [ ] Logs centralisés (Winston/Bunyan)

---

**Pour toute modification de ce contrat, mettre à jour ce fichier dans les deux projets.**
