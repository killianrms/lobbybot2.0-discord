import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { BotManager } from '../managers/BotManager';
import { UserManager } from '../managers/UserManager';
import { APIManager } from '../managers/APIManager';
import { DatabaseManager } from '../managers/DatabaseManager';
import { GeneratorManager } from '../managers/GeneratorManager';
import { BackupManager } from '../managers/BackupManager';

export interface CommandContext {
    botManager: BotManager;
    userManager: UserManager;
    apiManager: APIManager;
    dbManager: DatabaseManager;
    generatorManager: GeneratorManager;
    backupManager: BackupManager;
}

export interface Command {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | any;
    execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string): Promise<void>;
}
