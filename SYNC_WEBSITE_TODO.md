# 📋 TODO pour le Website - Synchronisation avec Discord Manager v2.1.0

**Fichier à partager avec l'autre Claude qui travaille sur lobbybot2.0-website**

---

## ✅ Changements Implémentés côté Discord Manager

### 1. Socket.io Amélioré
- ✅ Auto-reconnect avec retry intelligent
- ✅ Heartbeat toutes les 10s
- ✅ Meilleure gestion des déconnexions
- ✅ Logs plus clairs

### 2. Nouvelles Features
- ✅ Commande `/ping`
- ✅ Rate limiting (3s cooldown)
- ✅ Cache API (5 min)
- ✅ Auto-reconnexion des bots Fortnite
- ✅ DB avec retry automatique

---

## 🔧 À Implémenter côté Website

### Priority 1 - Gestion du Heartbeat

**Fichier:** `server.js`

```javascript
// Ajouter après la gestion des autres events Socket.io

let lastHeartbeat = Date.now();
let managerConnected = false;

io.on('connection', (socket) => {
    // ... existing code ...

    // Nouveau: Gérer le heartbeat
    socket.on('heartbeat', (data) => {
        lastHeartbeat = Date.now();
        managerConnected = true;
        // Optionnel: broadcast aux clients web
        io.emit('manager:status', {
            online: true,
            botCount: data.botCount,
            lastPing: lastHeartbeat
        });
    });

    socket.on('disconnect', () => {
        managerConnected = false;
        io.emit('manager:status', { online: false });
    });
});

// Vérifier le timeout du heartbeat (si pas de heartbeat depuis 30s)
setInterval(() => {
    if (Date.now() - lastHeartbeat > 30000 && managerConnected) {
        console.warn('⚠️  Manager heartbeat timeout');
        managerConnected = false;
        io.emit('manager:status', { online: false });
    }
}, 10000);
```

---

### Priority 2 - UI Status Indicator

**Fichier:** `public/index.html` et `public/admin.html`

Ajouter un indicateur de statut du Manager en haut de page :

```html
<!-- Ajouter dans le header -->
<div id="manager-status" class="status-indicator">
    <span class="status-dot offline"></span>
    <span id="status-text">Manager: Connexion...</span>
</div>
```

```css
/* Ajouter au CSS */
.status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #2c2f33;
    border-radius: 8px;
    margin-bottom: 16px;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    animation: pulse 2s infinite;
}

.status-dot.online {
    background: #43b581;
}

.status-dot.offline {
    background: #f04747;
    animation: none;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
```

```javascript
// Ajouter au JavaScript client
socket.on('manager:status', (data) => {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    
    if (data.online) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        statusText.textContent = `Manager: En ligne (${data.botCount} bots)`;
    } else {
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
        statusText.textContent = 'Manager: Hors ligne';
    }
});
```

---

### Priority 3 - Meilleure Gestion des Erreurs

**Fichier:** `server.js`

Standardiser les codes d'erreur (voir `API_CONTRACT.md`) :

```javascript
// Ajouter ces helpers
const ERROR_MESSAGES = {
    'SUCCESS': '✅ Opération réussie',
    'ERROR': '❌ Erreur',
    'FULL': '⚠️ Tous les bots sont pleins',
    'NOT_FOUND': '❌ Bot/User non trouvé',
    'NOT_LOGGED_IN': '❌ Non connecté',
    'UNAUTHORIZED': '🔒 Non autorisé',
    'DB_ERROR': '❌ Erreur base de données'
};

function formatErrorMessage(code) {
    return ERROR_MESSAGES[code] || code;
}

// Utiliser dans les responses
socket.on('action:result', (data) => {
    const message = data.success ? data.result : formatErrorMessage(data.result);
    // ... broadcast aux clients
});
```

---

### Priority 4 - Logs Synchronisés

**Fichier:** `server.js`

Améliorer le format des logs pour correspondre au Discord Manager :

```javascript
// Ajouter en haut du fichier
function log(level, message) {
    const timestamp = new Date().toISOString();
    const emoji = {
        'INFO': 'ℹ️',
        'WARN': '⚠️',
        'ERROR': '❌',
        'SUCCESS': '✅'
    }[level] || '📝';
    
    console.log(`[${timestamp}] [Website] [${level}] ${emoji} ${message}`);
}

// Remplacer les console.log par :
log('INFO', 'Server started on port 3000');
log('SUCCESS', 'Manager connected');
log('ERROR', 'Database connection failed');
```

---

### Priority 5 - Connexion Database Plus Robuste

**Fichier:** `server.js`

Ajouter retry logic comme dans Discord Manager :

```javascript
async function queryWithRetry(queryFn, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await queryFn();
        } catch (e) {
            log('ERROR', `Query failed (attempt ${attempt}/${retries}): ${e.message}`);
            if (attempt === retries) throw e;
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
}

// Utiliser dans les queries critiques
app.post('/api/admin/login', async (req, res) => {
    try {
        const result = await queryWithRetry(async () => {
            return await dbPool.query('SELECT * FROM dashboard_admins WHERE email = $1', [email]);
        });
        // ...
    } catch (e) {
        log('ERROR', 'Login query failed after retries');
        res.status(500).json({ error: 'DB_ERROR' });
    }
});
```

---

## 📄 Fichiers à Copier depuis Discord Project

### 1. API_CONTRACT.md
Copier ce fichier dans le projet Website pour référence.

### 2. .env.example
S'assurer que les variables DB correspondent :

```env
# Discord Manager
DB_HOST=kcnyx-db.pikudev.cloud
DB_PORT=5432
DB_USER=kcnyx_admin
DB_PASS=...
DB_NAME=kcnyx

# Website (DOIT être identique)
DB_HOST=kcnyx-db.pikudev.cloud
DB_PORT=5432
DB_USER=kcnyx_admin
DB_PASS=...
DB_NAME=kcnyx
```

---

## ✅ Tests d'Intégration à Faire

### 1. Test de Reconnexion
- [ ] Arrêter Discord Manager
- [ ] Website affiche "Manager: Hors ligne"
- [ ] Redémarrer Discord Manager
- [ ] Website affiche "Manager: En ligne" automatiquement

### 2. Test de Heartbeat
- [ ] Manager connecté → dot vert pulse
- [ ] Couper le réseau → dot rouge après 30s
- [ ] Restaurer → dot vert revient

### 3. Test des Actions
- [ ] Changer skin depuis Website → appliqué sur bot
- [ ] Ajouter ami depuis Website → demande envoyée
- [ ] Modifier config globale → appliquée immédiatement

### 4. Test de Charge
- [ ] Envoyer 10 actions rapidement
- [ ] Vérifier que toutes sont traitées
- [ ] Logs clairs côté Website et Discord

---

## 🐛 Bugs Connus à Fixer

### Website Issues (à vérifier)
1. Si Manager déconnecté, les actions ne sont pas mises en queue
2. Pas de feedback visuel quand une action est envoyée
3. Les erreurs ne sont pas affichées clairement à l'utilisateur
4. Pas de timeout sur les requêtes Socket.io

---

## 🚀 Améliorations Suggérées

### Phase 2 (après tests)
1. **Action Queue** : Si Manager down, mettre actions en queue
2. **Toast Notifications** : Feedback visuel pour chaque action
3. **Real-time Stats** : Graphiques des commandes/min, bots actifs
4. **Audit Log** : Historique des actions admin

### Phase 3 (long terme)
1. **API REST** : En complément de Socket.io
2. **Webhooks** : Notifications Discord/Slack
3. **Multi-Manager** : Support de plusieurs Discord Managers
4. **Dark Mode** : Theme sombre pour le dashboard

---

## 📝 Notes Importantes

### Compatibilité
- ✅ Les changements sont **rétrocompatibles**
- ✅ Pas besoin de migrations DB
- ✅ Le Website actuel continue de fonctionner
- ✅ Les améliorations sont **progressives**

### Déploiement
1. Discord Manager v2.1.0 peut être déployé **maintenant**
2. Website peut être mis à jour **progressivement**
3. Les deux fonctionnent ensemble sans problème

### Communication
- Discord Manager envoie maintenant un heartbeat
- Website peut choisir de l'utiliser ou pas
- Pas de breaking change

---

## 🆘 Support

Si des questions ou problèmes d'intégration :
1. Consulter `API_CONTRACT.md` pour les specs
2. Vérifier les logs (format standardisé)
3. Tester avec `/ping` côté Discord pour vérifier la connexion

---

**Date de création:** 2026-07-07
**Version Discord Manager:** 2.1.0
**Créé par:** Claude (Discord Manager)
**Pour:** Claude (Website)
