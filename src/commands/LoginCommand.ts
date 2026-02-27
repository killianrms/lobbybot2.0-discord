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

const DEVICE_FLOW_TIMEOUT = 600; // 10 minutes max

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connect your Epic Games account / Connecter votre compte Epic Games'),

    ephemeral: true,

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const t = (key: string) => getTranslation(userLang, key);

        try {
            const { userCode, activateUrl, interval } = await context.userManager.initiateDeviceFlow(interaction.user.id);

            const embed = new EmbedBuilder()
                .setColor(0x00D4FF)
                .setTitle(t('LOGIN_TITLE'))
                .setDescription(t('LOGIN_DESC'))
                .addFields({ name: t('LOGIN_CODE_LABEL'), value: `\`\`\`${userCode}\`\`\`` })
                .setFooter({ text: t('LOGIN_FOOTER') });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setLabel(t('LOGIN_BTN_ACTIVATE')).setURL(activateUrl).setStyle(ButtonStyle.Link)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });

            // Background polling — auto-detects when the user authorizes on Epic Games
            const maxAttempts = Math.floor(DEVICE_FLOW_TIMEOUT / interval);
            let attempts = 0;

            const poll = async (): Promise<void> => {
                if (attempts >= maxAttempts) {
                    const expiredEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(t('LOGIN_TITLE'))
                        .setDescription(t('LOGIN_EXPIRED'));
                    await interaction.editReply({ embeds: [expiredEmbed], components: [] }).catch(() => {});
                    return;
                }

                attempts++;
                await new Promise(r => setTimeout(r, interval * 1000));

                const result = await context.userManager.completeDeviceFlow(interaction.user.id);

                if (result.startsWith('SUCCESS')) {
                    const pseudo = result.split(':')[1];
                    const successEmbed = new EmbedBuilder()
                        .setColor(0x00FF88)
                        .setTitle(t('LOGIN_TITLE'))
                        .setDescription(t('LOGIN_SUCCESS').replace('{pseudo}', pseudo));
                    await interaction.editReply({ embeds: [successEmbed], components: [] }).catch(() => {});
                } else if (result === 'PENDING') {
                    poll().catch(() => {}); // continue polling in background
                } else if (result === 'EXPIRED') {
                    const expiredEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(t('LOGIN_TITLE'))
                        .setDescription(t('LOGIN_EXPIRED'));
                    await interaction.editReply({ embeds: [expiredEmbed], components: [] }).catch(() => {});
                } else {
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xFF4444)
                        .setTitle(t('LOGIN_TITLE'))
                        .setDescription(t('LOGIN_ERROR').replace('{error}', result.split(':')[1] || ''));
                    await interaction.editReply({ embeds: [errorEmbed], components: [] }).catch(() => {});
                }
            };

            poll().catch(() => {}); // start polling without blocking execute()

        } catch (e: any) {
            if (e.message === 'DEVICE_FLOW_UNAVAILABLE') {
                // Fallback: classic auth code flow
                const codeUrl = `https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code`;

                const embed = new EmbedBuilder()
                    .setColor(0xFF6B35)
                    .setTitle(t('LOGIN_TITLE'))
                    .setDescription(t('LOGIN_FALLBACK_DESC'))
                    .setFooter({ text: t('LOGIN_FALLBACK_FOOTER') });

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setLabel(t('LOGIN_BTN_GET_CODE')).setURL(codeUrl).setStyle(ButtonStyle.Link),
                    new ButtonBuilder().setCustomId('login_enter_code').setLabel(t('LOGIN_BTN_ENTER')).setStyle(ButtonStyle.Primary)
                );

                await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                console.error('Login error:', e);
                await interaction.editReply(t('ERROR'));
            }
        }
    }
};
