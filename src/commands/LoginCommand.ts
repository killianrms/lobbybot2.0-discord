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

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connect your Epic Games account / Connecter votre compte Epic Games'),

    ephemeral: true,

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const t = (key: string) => getTranslation(userLang, key);

        try {
            // Try the device authorization flow (1-click)
            const { userCode, activateUrl } = await context.userManager.initiateDeviceFlow(interaction.user.id);

            const embed = new EmbedBuilder()
                .setColor(0x00D4FF)
                .setTitle(t('LOGIN_TITLE'))
                .setDescription(t('LOGIN_DESC'))
                .addFields({ name: t('LOGIN_CODE_LABEL'), value: `\`\`\`${userCode}\`\`\`` })
                .setFooter({ text: t('LOGIN_FOOTER') });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setLabel(t('LOGIN_BTN_ACTIVATE')).setURL(activateUrl).setStyle(ButtonStyle.Link),
                new ButtonBuilder().setCustomId('login_check_device').setLabel(t('LOGIN_BTN_CHECK')).setStyle(ButtonStyle.Success)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (e: any) {
            if (e.message === 'DEVICE_FLOW_UNAVAILABLE') {
                // Fallback: classic auth code flow with a direct link
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
