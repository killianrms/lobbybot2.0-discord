export const locales: Record<string, Record<string, string>> = {
    fr: {
        PREV: 'Précédent',
        NEXT: 'Suivant',
        BOTS_CONNECTED: 'Bots Connectés',
        FRIENDS_LIST: 'Vos Amis',
        NO_BOTS: 'Aucun bot connecté.',
        NO_FRIENDS: 'Vous n\'avez aucun ami.',
        NOT_LOGGED_IN: '❌ Vous n\'êtes pas connecté. Utilisez `/login` d\'abord.',
        PAGE: 'Page',
        OF: 'sur',
        NOT_YOUR_BUTTONS: 'Ce ne sont pas vos boutons!',
        UNKNOWN_CMD: 'Commande inconnue.',
        ERROR: 'Une erreur est survenue.',
        SUCCESS: 'Succès',
        LANG_SET: 'Langue définie sur',

        // ── Login ──
        LOGIN_TITLE: '🔗 Connexion Epic Games',
        LOGIN_FOOTER: 'LobbyBot by aeroz • Visible uniquement par toi',
        // Device flow
        LOGIN_DEVICE_DESC: '**Comment lier ton compte Fortnite en 1 clic :**\n\n1️⃣ Clique sur **"Activer mon compte"** ci-dessous\n2️⃣ Connecte-toi sur Epic Games si besoin\n3️⃣ Clique sur **"Oui"** pour autoriser\n4️⃣ Reviens ici — le bot se connecte automatiquement ✅\n\n⏳ Ce lien expire dans **{minutes} minutes**.',
        LOGIN_CODE_LABEL: 'Code d\'activation',
        LOGIN_STATUS_LABEL: 'Statut',
        LOGIN_WAITING: '⏳ En attente de votre autorisation...',
        LOGIN_ACTIVATE_BTN: '🌐 Activer mon compte',
        LOGIN_ACCOUNT_FIELD: 'Compte',
        // Device flow results
        LOGIN_EXPIRED_DESC: '❌ Le code a **expiré**. Relance `/login` pour réessayer.',
        LOGIN_SUCCESS_DESC: '✅ Connecté en tant que **{pseudo}** !\nTu peux maintenant utiliser `/add` sans arguments.',
        LOGIN_ERROR_DESC: '❌ Erreur lors de la connexion.\n`{error}`\n\nRelance `/login` pour réessayer.',
        // Fallback (mode manuel)
        LOGIN_FALLBACK_DESC: '**Le mode automatique est temporairement indisponible.**\nVoici comment te connecter manuellement :\n\n1️⃣ Clique sur **"Obtenir mon code"** ci-dessous\n2️⃣ Connecte-toi sur Epic Games si besoin\n3️⃣ Sur la page, copie la valeur de **`authorizationCode`**\n4️⃣ Clique sur **"Entrer mon code"** et colle-le\n\n⚠️ Le code expire en quelques minutes, fais vite !',
        LOGIN_GET_CODE_BTN: '🌐 Obtenir mon code',
        LOGIN_ENTER_CODE_BTN: '✅ Entrer mon code',
        // Modal
        LOGIN_MODAL_TITLE: 'Colle ton code Epic Games',
        LOGIN_MODAL_LABEL: 'authorizationCode',
        LOGIN_MODAL_PLACEHOLDER: 'Ex: abc123def456789...',
        LOGIN_MODAL_SUCCESS: '✅ Connecté en tant que **{pseudo}** !\nTu peux maintenant utiliser `/add` sans arguments.',
        LOGIN_MODAL_ERROR: '❌ Échec de la connexion.\n> {reason}\n\nVérifie que le code est correct et n\'a pas expiré, puis réessaie avec `/login`.',
    },
    en: {
        PREV: 'Previous',
        NEXT: 'Next',
        BOTS_CONNECTED: 'Connected Bots',
        FRIENDS_LIST: 'Your Friends',
        NO_BOTS: 'No bots connected.',
        NO_FRIENDS: 'You have no friends.',
        NOT_LOGGED_IN: '❌ You are not logged in. Use `/login` first.',
        PAGE: 'Page',
        OF: 'of',
        NOT_YOUR_BUTTONS: 'These are not your buttons!',
        UNKNOWN_CMD: 'Unknown command.',
        ERROR: 'An error occurred.',
        SUCCESS: 'Success',
        LANG_SET: 'Language set to',

        // ── Login ──
        LOGIN_TITLE: '🔗 Epic Games Login',
        LOGIN_FOOTER: 'LobbyBot by aeroz • Only visible to you',
        // Device flow
        LOGIN_DEVICE_DESC: '**How to link your Fortnite account in 1 click:**\n\n1️⃣ Click **"Activate my account"** below\n2️⃣ Log in to Epic Games if needed\n3️⃣ Click **"Yes"** to authorize\n4️⃣ Come back here — the bot connects automatically ✅\n\n⏳ This link expires in **{minutes} minutes**.',
        LOGIN_CODE_LABEL: 'Activation Code',
        LOGIN_STATUS_LABEL: 'Status',
        LOGIN_WAITING: '⏳ Waiting for your authorization...',
        LOGIN_ACTIVATE_BTN: '🌐 Activate my account',
        LOGIN_ACCOUNT_FIELD: 'Account',
        // Device flow results
        LOGIN_EXPIRED_DESC: '❌ The code has **expired**. Use `/login` again to retry.',
        LOGIN_SUCCESS_DESC: '✅ Logged in as **{pseudo}**!\nYou can now use `/add` without arguments.',
        LOGIN_ERROR_DESC: '❌ Connection error.\n`{error}`\n\nUse `/login` again to retry.',
        // Fallback (manual mode)
        LOGIN_FALLBACK_DESC: '**Automatic mode is temporarily unavailable.**\nHere\'s how to connect manually:\n\n1️⃣ Click **"Get my code"** below\n2️⃣ Log in to Epic Games if needed\n3️⃣ On the page, copy the value of **`authorizationCode`**\n4️⃣ Click **"Enter my code"** and paste it\n\n⚠️ The code expires in a few minutes, be quick!',
        LOGIN_GET_CODE_BTN: '🌐 Get my code',
        LOGIN_ENTER_CODE_BTN: '✅ Enter my code',
        // Modal
        LOGIN_MODAL_TITLE: 'Paste your Epic Games code',
        LOGIN_MODAL_LABEL: 'authorizationCode',
        LOGIN_MODAL_PLACEHOLDER: 'Ex: abc123def456789...',
        LOGIN_MODAL_SUCCESS: '✅ Logged in as **{pseudo}**!\nYou can now use `/add` without arguments.',
        LOGIN_MODAL_ERROR: '❌ Login failed.\n> {reason}\n\nCheck that the code is correct and hasn\'t expired, then retry with `/login`.',
    },
    es: {
        PREV: 'Anterior',
        NEXT: 'Siguiente',
        BOTS_CONNECTED: 'Bots Conectados',
        FRIENDS_LIST: 'Tus Amigos',
        NO_BOTS: 'No hay bots conectados.',
        NO_FRIENDS: 'No tienes amigos.',
        NOT_LOGGED_IN: '❌ No estás conectado. Usa `/login` primero.',
        PAGE: 'Página',
        OF: 'de',
        NOT_YOUR_BUTTONS: '¡Estos no son tus botones!',
        UNKNOWN_CMD: 'Comando desconocido.',
        ERROR: 'Ocurrió un error.',
        SUCCESS: 'Éxito',
        LANG_SET: 'Idioma configurado en',

        // ── Login ──
        LOGIN_TITLE: '🔗 Inicio de sesión Epic Games',
        LOGIN_FOOTER: 'LobbyBot by aeroz • Solo visible para ti',
        // Device flow
        LOGIN_DEVICE_DESC: '**Cómo vincular tu cuenta de Fortnite en 1 clic:**\n\n1️⃣ Haz clic en **"Activar mi cuenta"** abajo\n2️⃣ Inicia sesión en Epic Games si es necesario\n3️⃣ Haz clic en **"Sí"** para autorizar\n4️⃣ Vuelve aquí — el bot se conecta automáticamente ✅\n\n⏳ Este enlace expira en **{minutes} minutos**.',
        LOGIN_CODE_LABEL: 'Código de activación',
        LOGIN_STATUS_LABEL: 'Estado',
        LOGIN_WAITING: '⏳ Esperando tu autorización...',
        LOGIN_ACTIVATE_BTN: '🌐 Activar mi cuenta',
        LOGIN_ACCOUNT_FIELD: 'Cuenta',
        // Device flow results
        LOGIN_EXPIRED_DESC: '❌ El código ha **expirado**. Usa `/login` de nuevo para intentarlo.',
        LOGIN_SUCCESS_DESC: '✅ Conectado como **{pseudo}**!\nYa puedes usar `/add` sin argumentos.',
        LOGIN_ERROR_DESC: '❌ Error de conexión.\n`{error}`\n\nUsa `/login` de nuevo para intentarlo.',
        // Fallback (modo manual)
        LOGIN_FALLBACK_DESC: '**El modo automático no está disponible temporalmente.**\nCómo conectarte manualmente:\n\n1️⃣ Haz clic en **"Obtener mi código"** abajo\n2️⃣ Inicia sesión en Epic Games si es necesario\n3️⃣ En la página, copia el valor de **`authorizationCode`**\n4️⃣ Haz clic en **"Introducir mi código"** y pégalo\n\n⚠️ El código expira en unos minutos, ¡date prisa!',
        LOGIN_GET_CODE_BTN: '🌐 Obtener mi código',
        LOGIN_ENTER_CODE_BTN: '✅ Introducir mi código',
        // Modal
        LOGIN_MODAL_TITLE: 'Pega tu código de Epic Games',
        LOGIN_MODAL_LABEL: 'authorizationCode',
        LOGIN_MODAL_PLACEHOLDER: 'Ej: abc123def456789...',
        LOGIN_MODAL_SUCCESS: '✅ Conectado como **{pseudo}**!\nYa puedes usar `/add` sin argumentos.',
        LOGIN_MODAL_ERROR: '❌ Error al iniciar sesión.\n> {reason}\n\nVerifica que el código sea correcto y no haya expirado, luego reintenta con `/login`.',
    },
    de: {
        PREV: 'Vorherige',
        NEXT: 'Nächste',
        BOTS_CONNECTED: 'Verbundene Bots',
        FRIENDS_LIST: 'Deine Freunde',
        NO_BOTS: 'Keine Bots verbunden.',
        NO_FRIENDS: 'Du hast keine Freunde.',
        NOT_LOGGED_IN: '❌ Du bist nicht eingeloggt. Benutze zuerst `/login`.',
        PAGE: 'Seite',
        OF: 'von',
        NOT_YOUR_BUTTONS: 'Das sind nicht deine Knöpfe!',
        UNKNOWN_CMD: 'Unbekannter Befehl.',
        ERROR: 'Ein Fehler ist aufgetreten.',
        SUCCESS: 'Erfolg',
        LANG_SET: 'Sprache eingestellt auf',

        // ── Login ──
        LOGIN_TITLE: '🔗 Epic Games Anmeldung',
        LOGIN_FOOTER: 'LobbyBot by aeroz • Nur für dich sichtbar',
        // Device flow
        LOGIN_DEVICE_DESC: '**So verknüpfst du deinen Fortnite-Account in 1 Klick:**\n\n1️⃣ Klicke unten auf **"Konto aktivieren"**\n2️⃣ Melde dich bei Epic Games an, falls nötig\n3️⃣ Klicke auf **"Ja"** zum Bestätigen\n4️⃣ Komm zurück — der Bot verbindet sich automatisch ✅\n\n⏳ Dieser Link läuft in **{minutes} Minuten** ab.',
        LOGIN_CODE_LABEL: 'Aktivierungscode',
        LOGIN_STATUS_LABEL: 'Status',
        LOGIN_WAITING: '⏳ Warte auf deine Autorisierung...',
        LOGIN_ACTIVATE_BTN: '🌐 Konto aktivieren',
        LOGIN_ACCOUNT_FIELD: 'Konto',
        // Device flow results
        LOGIN_EXPIRED_DESC: '❌ Der Code ist **abgelaufen**. Benutze `/login` erneut.',
        LOGIN_SUCCESS_DESC: '✅ Eingeloggt als **{pseudo}**!\nDu kannst jetzt `/add` ohne Argumente verwenden.',
        LOGIN_ERROR_DESC: '❌ Verbindungsfehler.\n`{error}`\n\nBenutze `/login` erneut.',
        // Fallback (manueller Modus)
        LOGIN_FALLBACK_DESC: '**Der automatische Modus ist vorübergehend nicht verfügbar.**\nSo verbindest du dich manuell:\n\n1️⃣ Klicke unten auf **"Meinen Code holen"**\n2️⃣ Melde dich bei Epic Games an, falls nötig\n3️⃣ Kopiere auf der Seite den Wert von **`authorizationCode`**\n4️⃣ Klicke auf **"Code eingeben"** und füge ihn ein\n\n⚠️ Der Code läuft in wenigen Minuten ab — beeile dich!',
        LOGIN_GET_CODE_BTN: '🌐 Meinen Code holen',
        LOGIN_ENTER_CODE_BTN: '✅ Code eingeben',
        // Modal
        LOGIN_MODAL_TITLE: 'Deinen Epic Games Code einfügen',
        LOGIN_MODAL_LABEL: 'authorizationCode',
        LOGIN_MODAL_PLACEHOLDER: 'Bsp: abc123def456789...',
        LOGIN_MODAL_SUCCESS: '✅ Eingeloggt als **{pseudo}**!\nDu kannst jetzt `/add` ohne Argumente verwenden.',
        LOGIN_MODAL_ERROR: '❌ Anmeldung fehlgeschlagen.\n> {reason}\n\nPrüfe ob der Code korrekt ist und nicht abgelaufen ist, dann versuche es erneut mit `/login`.',
    }
};

export function getTranslation(lang: string, key: string): string {
    const selectedLang = locales[lang] || locales['en'];
    return selectedLang[key] || key;
}
