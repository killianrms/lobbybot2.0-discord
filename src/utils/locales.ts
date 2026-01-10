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
        LANG_SET: 'Langue définie sur'
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
        LANG_SET: 'Language set to'
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
        LANG_SET: 'Idioma configurado en'
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
        LANG_SET: 'Sprache eingestellt auf'
    }
};

export function getTranslation(lang: string, key: string): string {
    const selectedLang = locales[lang] || locales['en'];
    return selectedLang[key] || key;
}
