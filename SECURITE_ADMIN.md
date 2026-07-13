# 🔒 Sécurité Admin - Discord & Website

## ⚠️ CRITIQUE : Panel Admin

Le panel website (`admin.html`) doit être **strictement réservé aux admins**.

---

## 🛡️ État Actuel de la Sécurité

### Discord Bot (Commandes Admin)
✅ **Protection par Discord ID**
- La commande `/admin` vérifie le Discord ID de l'utilisateur
- Seuls les IDs dans `ADMIN_IDS` peuvent exécuter les commandes admin

**Fichier:** `src/commands/AdminCommand.ts`

### Website Dashboard
⚠️ **Protection par Login/Password**
- Le website a une table `dashboard_admins` avec bcrypt
- Login requis pour accéder au panel
- **À VÉRIFIER** : Est-ce que tous les endpoints sont protégés ?

---

## 🔐 Recommandations de Sécurité

### 1. Variables d'Environnement

**Ajouter au `.env`** :
```env
# Admin Discord IDs (séparés par des virgules)
ADMIN_IDS=335755692134891520,123456789012345678

# Website Admin Secret (pour Socket.io)
MANAGER_SECRET=votre_secret_tres_long_et_aleatoire_ici

# Website Admin Seed (premier admin)
ADMIN_SEED_EMAIL=admin@aeroz.com
ADMIN_SEED_PASSWORD=VotreMotDePasseTresSecurise123!
```

### 2. Discord Bot - Amélioration de la Vérification Admin

**Problème actuel** : Les ADMIN_IDS sont hardcodés dans le code.

**Solution** : Lire depuis `.env`

**À modifier dans `src/commands/AdminCommand.ts`** :
```typescript
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];

// Dans la fonction execute :
if (!ADMIN_IDS.includes(interaction.user.id)) {
    await interaction.reply({
        content: '🔒 Vous n\'avez pas la permission d\'utiliser cette commande.',
        ephemeral: true
    });
    return;
}
```

### 3. Website - Authentification Socket.io

**Problème** : N'importe qui peut se connecter au Socket.io

**Solution** : Ajouter un secret partagé

**Discord Manager (SocketManager.ts)** - DÉJÀ FAIT ✅ (à améliorer) :
```typescript
this.socket = io.connect(this.dashboardUrl, {
    auth: {
        token: process.env.MANAGER_SECRET
    }
});
```

**Website (server.js)** - À AJOUTER :
```javascript
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token === process.env.MANAGER_SECRET) {
        next();
    } else {
        console.error('❌ Unauthorized socket connection attempt');
        next(new Error('unauthorized'));
    }
});
```

### 4. Website - Protection des Routes Admin

**Vérifier que TOUS les endpoints admin sont protégés** :

```javascript
// Middleware d'authentification
function requireAuth(req, res, next) {
    if (!req.session || !req.session.admin) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    next();
}

// Protéger TOUS les endpoints sensibles
app.post('/api/admin/addBot', requireAuth, async (req, res) => {
    // ... code existant
});

app.post('/api/admin/deleteBot', requireAuth, async (req, res) => {
    // ... code existant
});

app.post('/api/admin/config', requireAuth, async (req, res) => {
    // ... code existant
});
```

### 5. Website - Rate Limiting Admin

**Protéger contre le brute force** :

```javascript
const loginAttempts = new Map();

app.post('/api/admin/login', async (req, res) => {
    const ip = req.ip;
    const attempts = loginAttempts.get(ip) || 0;
    
    if (attempts >= 5) {
        return res.status(429).json({
            error: 'TOO_MANY_ATTEMPTS',
            message: 'Trop de tentatives. Réessayez dans 15 minutes.'
        });
    }
    
    // ... vérification login ...
    
    if (loginFailed) {
        loginAttempts.set(ip, attempts + 1);
        setTimeout(() => loginAttempts.delete(ip), 15 * 60 * 1000);
    } else {
        loginAttempts.delete(ip);
    }
});
```

### 6. HTTPS en Production

⚠️ **IMPORTANT** : En production, utiliser HTTPS :
- Empêche l'interception des mots de passe
- Protège les cookies de session
- Sécurise Socket.io

---

## 🚨 Checklist Sécurité Admin

### Discord Bot
- [ ] ADMIN_IDS dans `.env` (pas hardcodé)
- [ ] Vérification du Discord ID sur TOUTES les commandes admin
- [ ] Messages d'erreur qui ne révèlent pas trop d'infos
- [ ] Logs des actions admin

### Website Dashboard
- [ ] Login obligatoire pour accéder à `admin.html`
- [ ] Tous les endpoints API protégés par `requireAuth`
- [ ] Rate limiting sur le login (max 5 tentatives)
- [ ] Authentification Socket.io avec secret partagé
- [ ] Sessions sécurisées (httpOnly, secure en prod)
- [ ] HTTPS en production
- [ ] Logs des actions admin

### Base de Données
- [ ] Mots de passe admin hashés avec bcrypt (rounds >= 12)
- [ ] Table `dashboard_admins` avec lock après X tentatives
- [ ] Pas de credentials en clair dans les logs

### Général
- [ ] `.env` dans `.gitignore` ✅
- [ ] Secrets forts et aléatoires
- [ ] Documentation des admins autorisés
- [ ] Backup régulier de la DB

---

## 🔧 Actions Immédiates pour Toi

### 1. Configurer tes Admin IDs

**Modifier `.env`** :
```env
# Ton Discord ID (clique droit sur ton nom dans Discord > Copier l'ID)
ADMIN_IDS=335755692134891520

# Si tu veux ajouter d'autres admins :
# ADMIN_IDS=335755692134891520,987654321012345678
```

### 2. Créer un Secret Manager

**Ajouter au `.env`** :
```env
# Générer un secret fort (32+ caractères aléatoires)
MANAGER_SECRET=changeme_avec_un_vrai_secret_aleatoire_de_32_chars_minimum
```

**Comment générer un secret fort** :
```bash
# Linux/Mac
openssl rand -hex 32

# Ou utiliser un site comme
# https://www.random.org/strings/
```

### 3. Créer ton Admin Website

**Ajouter au `.env`** :
```env
# Ton email admin pour le website
ADMIN_SEED_EMAIL=ton@email.com

# Ton mot de passe (sera hashé en bcrypt)
ADMIN_SEED_PASSWORD=UnMotDePasseTresSecurise123!
```

---

## 📋 TODO pour l'Autre Claude (Website)

**Ajouter à `SYNC_WEBSITE_TODO.md`** :

### Priority 0 - SÉCURITÉ CRITIQUE

1. **Authentification Socket.io**
   - Vérifier `MANAGER_SECRET` sur chaque connexion
   - Rejeter les connexions non autorisées

2. **Protection Routes Admin**
   - Middleware `requireAuth` sur TOUS les endpoints admin
   - Vérifier la session avant toute action sensible

3. **Rate Limiting Login**
   - Max 5 tentatives par IP
   - Lock 15 minutes après échec

4. **Sessions Sécurisées**
   - `httpOnly: true`
   - `secure: true` en production
   - `sameSite: 'strict'`

---

## 🧪 Tests de Sécurité

### Test 1 : Discord Bot
```
1. Essayer /admin addbot avec un compte NON admin
   → Doit refuser avec message "pas la permission"

2. Essayer /admin addbot avec ton compte admin
   → Doit fonctionner
```

### Test 2 : Website Login
```
1. Aller sur /admin.html sans être connecté
   → Doit rediriger vers login

2. Essayer 6 fois avec mauvais mot de passe
   → Doit bloquer après 5 tentatives

3. Se connecter avec bon mot de passe
   → Doit donner accès au panel
```

### Test 3 : Socket.io
```
1. Essayer de se connecter sans MANAGER_SECRET
   → Doit rejeter la connexion

2. Connecter avec le bon secret
   → Doit accepter
```

---

## 🚀 Déploiement Sécurisé

### Production Checklist
- [ ] HTTPS activé (Let's Encrypt gratuit)
- [ ] `.env` avec secrets forts
- [ ] Firewall configuré (port 3000 non exposé directement)
- [ ] Reverse proxy (Nginx/Caddy) devant le website
- [ ] Logs activés et surveillés
- [ ] Backup DB automatique
- [ ] Monitoring des tentatives de connexion

---

**⚠️ NE JAMAIS :**
- Commit le `.env` dans Git ✅ (déjà dans .gitignore)
- Partager ton `MANAGER_SECRET`
- Utiliser des mots de passe faibles
- Exposer le panel admin publiquement sans HTTPS
- Laisser les credentials par défaut

---

Made with 🔒 by Claude
