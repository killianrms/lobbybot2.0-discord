# 🚀 Guide de Déploiement - LobbyBot 2.0

## ✅ Checklist Pré-Déploiement

### Configuration
- [ ] Copier `.env.example` vers `.env`
- [ ] Remplir `DISCORD_TOKEN` avec votre token Discord
- [ ] Configurer les credentials PostgreSQL dans `.env`
- [ ] (Optionnel) Configurer `DASHBOARD_URL` si vous utilisez le dashboard

### Base de Données
- [ ] PostgreSQL installé et accessible
- [ ] Les migrations se feront automatiquement au premier lancement
- [ ] Import CSV automatique si `accounts.csv` existe

### Discord
- [ ] Bot Discord créé sur https://discord.com/developers/applications
- [ ] Intents activés : `Guilds`, `Guild Messages`, `Message Content`
- [ ] Bot invité sur votre serveur avec les permissions :
  - Send Messages
  - Embed Links
  - Use Slash Commands
  - Read Message History

---

## 🎯 Démarrage Rapide

### Méthode 1 : Node.js (Développement)

```bash
# Installer les dépendances
npm install

# Copier et configurer .env
cp .env.example .env
nano .env  # Éditer avec vos credentials

# Build
npm run build

# Lancer
npm start
```

### Méthode 2 : Docker (Production - Recommandé)

```bash
# Copier et configurer .env
cp .env.example .env
nano .env  # Éditer avec vos credentials

# Lancer avec Docker Compose
docker-compose up -d --build

# Voir les logs
docker-compose logs -f
```

---

## 🆕 Nouvelles Fonctionnalités (v2.1.0)

### Pour les Utilisateurs
1. **Connexion simplifiée** : `/login` ouvre maintenant une page Epic qui affiche automatiquement le code - plus besoin de copier/coller !
2. **Commande /ping** : Vérifiez la latence du bot à tout moment
3. **Rate limiting** : Protection anti-spam (3s entre commandes)
4. **Réponses plus rapides** : Cache intelligent sur `/shop`, `/map`, `/news`

### Pour les Administrateurs
1. **Auto-reconnexion** : Les bots se reconnectent automatiquement en cas de déconnexion
2. **Base de données robuste** : Retry automatique sur les queries critiques
3. **Meilleure performance** : Index ajoutés sur les tables critiques
4. **Logs améliorés** : Messages d'erreur plus clairs

---

## 🔧 Commandes Disponibles

### Utilisateurs
- `/login` - Se connecter avec Epic Games (nouveau flux simplifié !)
- `/logout` - Se déconnecter
- `/add [pseudo]` - Ajouter un bot en ami
- `/list` - Liste de vos amis
- `/locker` - Voir votre casier
- `/shop` - Boutique du jour (avec cache 5min)
- `/map` - Carte actuelle
- `/news` - Actualités Fortnite
- `/sac <code>` - Définir votre code créateur
- `/setlanguage <lang>` - Changer la langue (fr/en/es/de)
- `/ping` - **NOUVEAU** Vérifier la latence
- `/help` - Aide

### Bots
- `/listbots` - Liste des bots connectés
- `/info` - Statistiques globales
- `/status` - État des services Fortnite

### Admin
- `/admin addbot` - Ajouter un bot (réservé admin)

---

## 📊 Monitoring

### Vérifier l'état du bot
```bash
# Logs Docker
docker-compose logs -f

# Logs Node.js
tail -f logs/bot.log  # Si configuré
```

### Indicateurs de santé
- Tous les bots doivent afficher "✅ Connecté"
- Le bot Discord doit répondre à `/ping` en moins de 500ms
- La base de données doit être connectée au démarrage

---

## 🐛 Troubleshooting

### Le bot ne répond pas
1. Vérifier que le `DISCORD_TOKEN` est correct
2. Vérifier les intents Discord (voir ci-dessus)
3. Tester avec `/ping`

### Les bots Fortnite ne se connectent pas
1. Vérifier que la base de données contient des comptes
2. Vérifier les credentials device auth
3. Regarder les logs pour les erreurs d'authentification

### Database connection error
1. Vérifier que PostgreSQL est démarré
2. Vérifier les credentials dans `.env`
3. Vérifier le firewall si DB externe

### Epic Games login ne marche pas
1. S'assurer d'utiliser la nouvelle version (v2.1.0+)
2. Le flux Device Code peut être temporairement indisponible côté Epic
3. Utiliser le fallback manuel si nécessaire

---

## 🔒 Sécurité

### ⚠️ IMPORTANT
- **JAMAIS** commit le fichier `.env` dans Git
- Garder votre `DISCORD_TOKEN` secret
- Changer les credentials DB par défaut en production
- Utiliser SSL pour la connexion PostgreSQL en production

### Bonnes Pratiques
- Backup régulier de la base de données
- Rotation des tokens tous les 6 mois
- Monitoring des logs pour activité suspecte
- Rate limiting activé par défaut (ne pas désactiver)

---

## 📈 Performance

### Optimisations Actives
- ✅ Cache API (5 min TTL)
- ✅ Index base de données
- ✅ Connection pooling PostgreSQL
- ✅ Rate limiting (3s cooldown)

### Capacité
- **Bots Fortnite** : Illimité (limité par la RAM)
- **Utilisateurs Discord** : Illimité
- **Requêtes/seconde** : ~10-20 avec rate limiting

---

## 🆘 Support

### Logs Utiles
```bash
# Voir les dernières erreurs
grep "ERROR" logs/*.log

# Suivre les connexions
grep "Connecté" logs/*.log

# Monitoring temps réel
docker-compose logs -f | grep -E "ERROR|WARNING|✅"
```

### Fichiers de Configuration
- `.env` - Variables d'environnement
- `tsconfig.json` - Configuration TypeScript
- `docker-compose.yml` - Configuration Docker

---

## 📝 Notes de Version

Voir [CHANGELOG.md](./CHANGELOG.md) pour l'historique complet des modifications.

**Version actuelle : 2.1.0**
- Fix majeur du login Epic Games
- Ajout commande /ping
- Rate limiting
- Cache API
- Auto-reconnexion bots
- Optimisations DB

---

Made with ❤️ by aeroz
