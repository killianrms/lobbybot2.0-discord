# Générateur de bots : watchdog d'inactivité + réconciliation DB

**Date** : 2026-07-15 — **Statut** : approuvé (design validé en conversation)

## Problème

Le générateur (`fn_account_generator`, piloté par `GeneratorManager.runGenerator()`) est
volontairement lent : il imite un comportement humain (pauses, saisie naturelle) pour ne pas
déclencher l'anti-bot d'Epic. Le timeout actuel est un budget de durée totale
(`GENERATOR_TIMEOUT_PER_ACCOUNT_MS`, 5 min/compte, plafond 2 h) : quand un batch légitime
dépasse le budget, il est tué en plein milieu et le résultat annonce « 0/N créés » alors que
des comptes sont déjà écrits en base (faux négatif observé le 2026-07-14).

## Décision

1. **Watchdog d'inactivité** (choix utilisateur, contre « aucun timeout » et « budget plus
   grand ») : plus aucune limite de durée totale. Un timer de 15 min est réarmé à chaque
   octet reçu sur stdout **ou** stderr. Tant que le générateur affiche de l'activité, il
   tourne aussi longtemps que nécessaire. 15 min de silence complet = process gelé
   (navigateur/captcha bloqué) → `proc.kill()`, la file passe au job suivant.
   Réglable via `GENERATOR_STALL_TIMEOUT_MS` (remplace `GENERATOR_TIMEOUT_PER_ACCOUNT_MS`).

2. **Réconciliation DB** : le générateur écrit les comptes en base au fil de l'eau, mais le
   JSON récapitulatif n'est imprimé qu'à la toute fin. Quand ce JSON manque (kill du
   watchdog, sortie invalide, échec) : snapshot des emails de `epic_accounts` avant le
   batch (`getAllBots()`), re-liste après, différence = succès partiels. Ces comptes suivent
   le chemin normal de `processNext()` : assignation du propriétaire éventuel + lancement du
   bot. Le DM final dit la vérité (« 3/5 créés, 2 échecs (générateur gelé) »).
   Méthode snapshot/diff (pas de dépendance à une colonne `created_at`).

3. **File d'attente et notifications** : inchangées (FIFO + priorité premium, réponse
   immédiate « mis en file (N devant) », DM de fin avec fallback `editReply`).

## Gestion d'erreur

- Kill du watchdog : log des 1 500 derniers caractères de sortie + alerte webhook
  `generator-stall` (via `AlertManager.sendAlert`, comme `generator-crash`).
- Résolution unique dans le handler `close` (le kill ne résout plus lui-même) — supprime la
  double résolution latente du code actuel.

## Vérification

- Script autonome (scratchpad) : faux process qui écrit puis se tait → le watchdog doit
  laisser vivre tant que ça écrit, tuer après le silence. (Pas de framework de test dans le
  repo ; on n'en installe pas pour ce changement.)
- `npm run build` puis `/admin createbot 1` réel : le batch doit aboutir sans kill et le DM
  refléter le résultat exact.
