import axios from 'axios';

type Severity = 'info' | 'warning' | 'critical';

const COLORS: Record<Severity, number> = {
    info: 0x3498db,
    warning: 0xf1c40f,
    critical: 0xe74c3c,
};

// Anti-spam : un même type d'alerte (par `key`) ne peut être renvoyé qu'une fois
// par fenêtre de cooldown, même si le problème sous-jacent se répète en boucle.
const COOLDOWN_MS = 10 * 60 * 1000;
const lastSent = new Map<string, number>();

/**
 * Envoie une alerte Discord via webhook quand le bot rencontre un problème
 * (DB, Discord, Fortnite, crash...). Best-effort : n'importe jamais si le webhook échoue.
 */
export async function sendAlert(key: string, title: string, description: string, severity: Severity = 'warning'): Promise<void> {
    const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK;
    if (!webhookUrl) return;

    const now = Date.now();
    const last = lastSent.get(key) ?? 0;
    if (now - last < COOLDOWN_MS) return;
    lastSent.set(key, now);

    try {
        await axios.post(webhookUrl, {
            embeds: [{
                title,
                description: description.slice(0, 4000),
                color: COLORS[severity],
                timestamp: new Date().toISOString(),
            }],
        });
    } catch (e: any) {
        console.error('[AlertManager] Failed to send webhook alert:', e.message);
    }
}
