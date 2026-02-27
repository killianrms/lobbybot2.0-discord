import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { BotManager } from '../managers/BotManager';
import { UserManager } from '../managers/UserManager';
import { APIManager } from '../managers/APIManager';

export interface CommandContext {
    botManager: BotManager;
    userManager: UserManager;
    apiManager: APIManager;
}

export interface Command {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | any;
    ephemeral?: boolean; // if true, DiscordManager defers as ephemeral; default = false (public)
    execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string): Promise<void>;
}
