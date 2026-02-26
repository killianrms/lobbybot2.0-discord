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

const EPIC_LOGIN_URL = 'https://www.epicgames.com/id/login';
const EPIC_CODE_URL = 'https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code';

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connect your Epic Games account / Connecter votre compte Epic Games'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const t = (key: string) => getTranslation(userLang, key);

        const embed = new EmbedBuilder()
            .setColor(0x00D4FF)
            .setTitle(t('LOGIN_TITLE'))
            .setDescription(t('LOGIN_DESC'))
            .setFooter({ text: t('LOGIN_FOOTER') });

        const signinButton = new ButtonBuilder()
            .setLabel(t('LOGIN_BTN_SIGNIN'))
            .setURL(EPIC_LOGIN_URL)
            .setStyle(ButtonStyle.Link);

        const codeButton = new ButtonBuilder()
            .setLabel(t('LOGIN_BTN_GET_CODE'))
            .setURL(EPIC_CODE_URL)
            .setStyle(ButtonStyle.Link);

        const enterButton = new ButtonBuilder()
            .setCustomId('login_enter_code')
            .setLabel(t('LOGIN_BTN_ENTER'))
            .setStyle(ButtonStyle.Primary);

        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(signinButton, codeButton);
        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(enterButton);

        await interaction.reply({
            embeds: [embed],
            components: [row1, row2],
            flags: 64 // ephemeral
        });
    }
};
