import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connect your Epic Games account / Connecter votre compte Epic Games'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const t = (key: string) => getTranslation(userLang, key);

        await interaction.deferReply({ ephemeral: true });

        try {
            const { userCode, activateUrl } = await context.userManager.initiateDeviceFlow(interaction.user.id);

            const embed = new EmbedBuilder()
                .setColor(0x00D4FF)
                .setTitle(t('LOGIN_TITLE'))
                .setDescription(t('LOGIN_DESC'))
                .addFields({ name: t('LOGIN_CODE_LABEL'), value: `\`\`\`${userCode}\`\`\`` })
                .setFooter({ text: t('LOGIN_FOOTER') });

            const activateButton = new ButtonBuilder()
                .setLabel(t('LOGIN_BTN_ACTIVATE'))
                .setURL(activateUrl)
                .setStyle(ButtonStyle.Link);

            const checkButton = new ButtonBuilder()
                .setCustomId('login_check_device')
                .setLabel(t('LOGIN_BTN_CHECK'))
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(activateButton, checkButton);

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (e: any) {
            console.error('Device flow init error:', e);
            await interaction.editReply(getTranslation(userLang, 'ERROR'));
        }
    }
};
