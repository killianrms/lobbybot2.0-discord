# 🔗 Guide d'Intégration Discord ↔ Website

## Architecture Actuelle

```
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                      │
│                   (Base de données partagée)                 │
└─────────────────────────────────────────────────────────────┘
                      ↑                    ↑
                      │                    │
         ┌────────────┴────────┐  ┌────────┴──────────┐
         │  Discord Manager    │  │  Website Server   │
         │  (Node.js/TS)       │  │  (Express/Node)   │
         │                     │  │                   │
         │  - Gère les bots    │  │  - Dashboard web  │
         │  - Slash commands   │  │  - Socket.io      │
         │  - Socket.io client │  │  - API REST       │
         └─────────────────────┘  └───────────────────┘
                      │                    │
                      └────────────────────┘
                         Socket.io events
```

## 📡 Communication Socket.io

### Events Discord → Website

Le bot Discord envoie :
- `manager:login` - Info sur les bots connectés (toutes les 30s)
- `action:result` - Résultat d'une action exécutée

### Events Website → Discord

Le website envoie :
- `cmd:manager:add` - Demander d'ajouter un ami
- `cmd:manager:action` - Exécuter une action sur un bot
- `cmd:manager:addBot` - Ajouter un nouveau bot
- `globalConfig:current` - Envoyer la config globale
- `config:globalUpdate` - Mettre à jour la config

## 🔧 Améliorations Recommandées

### 1. **Synchronisation de Version**
Les deux projets doivent partager le même schéma de données.

#### Actions immédiates :
- [ ] Vérifier que le website utilise les mêmes noms de colonnes DB
- [ ] `secret` (Discord) vs `secret_id` (Website) ?
- [ ] Synchroniser les migrations DB

### 2. **API Documentation**
Créer un contrat d'API clair entre les deux projets.

**À créer** : `API_CONTRACT.md`
```markdown
# Socket.io Events

## manager:login
Payload: {
  id: string
  type: 'manager'
  botCount: number
  bots: Array<{
    name: string
    friends: number
    isOnline: boolean
    ping: number | null
  }>
}

## cmd:manager:add
Payload: {
  target: string
  requester?: string
}
Response: action:result
```

### 3. **Gestion d'Erreur Unifiée**
Les deux projets doivent retourner les mêmes codes d'erreur.

**Codes suggérés** :
- `SUCCESS` - Opération réussie
- `ERROR` - Erreur générique
- `FULL` - Tous les bots pleins
- `NOT_FOUND` - Bot/User non trouvé
- `UNAUTHORIZED` - Non autorisé
- `DB_ERROR` - Erreur base de données

### 4. **Health Check Endpoint**
Le website devrait pouvoir vérifier si Discord Manager est connecté.

**À ajouter dans SocketManager.ts** :
```typescript
// Heartbeat toutes les 10s
setInterval(() => {
  if (this.socket.connected) {
    this.socket.emit('heartbeat', { timestamp: Date.now() });
  }
}, 10000);
```

### 5. **Reconnexion Socket.io**
Si le website redémarre, Discord Manager doit se reconnecter.

**À améliorer dans SocketManager.ts** :
- [ ] Auto-reconnect sur disconnect
- [ ] Retry avec backoff exponentiel
- [ ] Re-send login après reconnexion

### 6. **Logs Partagés**
Structure de logs cohérente entre les deux projets.

**Format suggéré** :
```
[TIMESTAMP] [SERVICE] [LEVEL] Message
[2026-07-07T17:30:00] [Discord] [INFO] Bot connected
[2026-07-07T17:30:01] [Website] [INFO] Manager connected
```

### 7. **Variables d'Environnement**
Vérifier la cohérence des configs.

**Discord (.env)** :
```env
DASHBOARD_URL=http://localhost:3000
DB_HOST=...
DB_NAME=...
```

**Website (.env)** :
```env
PORT=3000
DB_HOST=...  # DOIT être identique
DB_NAME=...  # DOIT être identique
```

### 8. **Sécurité Socket.io**
Actuellement, la connexion Socket.io n'est pas authentifiée.

**À ajouter** :
```typescript
// Discord Manager
this.socket = io.connect(url, {
  auth: {
    token: process.env.MANAGER_SECRET
  }
});

// Website Server
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token === process.env.MANAGER_SECRET) {
    next();
  } else {
    next(new Error('unauthorized'));
  }
});
```

## 🔍 Points à Vérifier avec l'Autre Claude

### Questions pour le dev du Website :

1. **Schéma DB** : Est-ce que le website utilise `secret_id` ou `secret` ?
2. **Socket Events** : Y a-t-il de nouveaux events à supporter ?
3. **Config Globale** : Comment est gérée la config (status, joinMsg, addMsg) ?
4. **Admin Auth** : Comment le website authentifie les admins ?
5. **Bot Actions** : Quelles actions sont exposées dans le dashboard ?

### Suggestions de Coordination :

**Fichiers à synchroniser** :
- [ ] Schéma de base de données
- [ ] Format des events Socket.io
- [ ] Codes d'erreur
- [ ] Variables d'environnement

**Tests d'intégration à faire** :
- [ ] Ajouter un bot depuis le website → vérifié dans Discord
- [ ] Exécuter une action depuis le website → résultat visible
- [ ] Changer config globale → appliquée sur tous les bots
- [ ] Redémarrer Discord Manager → website détecte la reconnexion

## 🚀 Améliorations Immédiates (Discord Manager)

Je peux faire maintenant :

### 1. Socket.io Auto-Reconnect
Améliorer la robustesse de la connexion Socket.io

### 2. Heartbeat System
Envoyer un ping régulier au website

### 3. Better Error Handling
Gérer les déconnexions du website gracieusement

### 4. Event Queue
Si le website est down, mettre en queue les events

### 5. Metrics
Envoyer des métriques au website (commandes/min, erreurs, etc.)

## ❓ Questions pour Toi

1. **Le website est-il déjà déployé** ou en développement ?
2. **Y a-t-il des problèmes connus** entre Discord et Website ?
3. **Nouvelles features** prévues côté website qui nécessitent des changements côté Discord ?
4. **Authentification** : Le website a-t-il un système de login/roles ?

---

**Dis-moi ce que tu veux que je fasse et je peux coordonner avec l'autre Claude !**
