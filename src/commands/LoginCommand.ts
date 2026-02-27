import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

// Passe par le login Epic d'abord → redirige vers la page du code auth
const EPIC_AUTH_URL =
    'https://www.epicgames.com/id/login?lang=en&noHostRedirect=true&redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D3f69e56c7649492c8cc29f1af08a8a12%26responseType%3Dcode';

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connect your Epic Games account / Connecter votre compte Epic Games'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply({ ephemeral: true });

        const t = (key: string) => getTranslation(userLang, key);

        // ── Tenter le device code flow ────────────────────────────────────────
        const flow = await context.userManager.initiateDeviceFlow();

        if (flow) {
            const minutes = Math.floor(flow.expiresIn / 60);

            const embed = new EmbedBuilder()
                .setTitle(t('LOGIN_TITLE'))
                .setColor(0x5865F2)
                .setDescription(t('LOGIN_DEVICE_DESC').replace('{minutes}', String(minutes)))
                .addFields(
                    { name: t('LOGIN_CODE_LABEL'), value: `\`${flow.userCode}\``, inline: true },
                    { name: t('LOGIN_STATUS_LABEL'), value: t('LOGIN_WAITING'), inline: true }
                )
                .setFooter({ text: t('LOGIN_FOOTER') });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel(t('LOGIN_ACTIVATE_BTN'))
                    .setStyle(ButtonStyle.Link)
                    .setURL(flow.activationUrl)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });

            // ── Polling en arrière-plan ───────────────────────────────────────
            const intervalMs = (flow.interval + 1) * 1000;
            const expiresAt  = Date.now() + flow.expiresIn * 1000;

            const poll = async () => {
                if (Date.now() > expiresAt) {
                    const exp = EmbedBuilder.from(embed).setColor(0xED4245).setDescription(t('LOGIN_EXPIRED_DESC')).setFields();
                    try { await interaction.editReply({ embeds: [exp], components: [] }); } catch (_) {}
                    return;
                }

                const result = await context.userManager.pollDeviceFlow(
                    interaction.user.id, flow.deviceCode, flow.clientId, flow.clientSecret
                );

                if (result === 'PENDING') { setTimeout(poll, intervalMs); return; }

                if (result === 'EXPIRED') {
                    const exp = EmbedBuilder.from(embed).setColor(0xED4245).setDescription(t('LOGIN_EXPIRED_DESC')).setFields();
                    try { await interaction.editReply({ embeds: [exp], components: [] }); } catch (_) {}
                    return;
                }

                if (result.startsWith('SUCCESS')) {
                    const pseudo = result.split(':')[1];
                    const ok = EmbedBuilder.from(embed)
                        .setColor(0x57F287)
                        .setDescription(t('LOGIN_SUCCESS_DESC').replace('{pseudo}', pseudo))
                        .setFields({ name: t('LOGIN_ACCOUNT_FIELD'), value: pseudo, inline: true });
                    try { await interaction.editReply({ embeds: [ok], components: [] }); } catch (_) {}
                    return;
                }

                const error = result.split(':').slice(1).join(':') || result;
                const err = EmbedBuilder.from(embed).setColor(0xED4245).setDescription(t('LOGIN_ERROR_DESC').replace('{error}', error)).setFields();
                try { await interaction.editReply({ embeds: [err], components: [] }); } catch (_) {}
            };

            setTimeout(poll, intervalMs);

        } else {
            // ── Fallback manuel ───────────────────────────────────────────────
            const embed = new EmbedBuilder()
                .setTitle(t('LOGIN_TITLE'))
                .setColor(0xFEE75C)
                .setDescription(t('LOGIN_FALLBACK_DESC'))
                .setFooter({ text: t('LOGIN_FOOTER') });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel(t('LOGIN_GET_CODE_BTN'))
                    .setStyle(ButtonStyle.Link)
                    .setURL(EPIC_AUTH_URL),
                new ButtonBuilder()
                    .setCustomId('login_enter_code')
                    .setLabel(t('LOGIN_ENTER_CODE_BTN'))
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        }
    },
};
