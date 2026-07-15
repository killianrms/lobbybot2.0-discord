import { Command } from './Command';
import { LoginCommand } from './LoginCommand';
import { AddCommand } from './AddCommand';
import { AdminCommand } from './AdminCommand';
import { LogoutCommand } from './LogoutCommand';
import { InfoCommand } from './InfoCommand';
import { ShopCommand } from './ShopCommand';
import { MapCommand } from './MapCommand';
import { NewsCommand } from './NewsCommand';
import { StatusCommand } from './StatusCommand';
import { RemoveCommand } from './RemoveCommand';
import { ListBotsCommand } from './ListBotsCommand';
import { ListCommand } from './ListCommand';
import { SacCommand } from './SacCommand';
import { LockerCommand } from './LockerCommand';
import { SetLanguageCommand } from './SetLanguageCommand';
import { HelpCommand } from './HelpCommand';
import { PingCommand } from './PingCommand';
import { SkinCommand } from './SkinCommand';
import { InviteCommand } from './InviteCommand';
import { CreateBotCommand } from './CreateBotCommand';
import { SquadCommand } from './SquadCommand';
import { EmoteAllCommand } from './EmoteAllCommand';
import { PresetCommand } from './PresetCommand';
import { PremiumCommand } from './PremiumCommand';

const baseCommands: Command[] = [
    LoginCommand,
    AddCommand,
    AdminCommand,
    LogoutCommand,
    InfoCommand,
    ShopCommand,
    MapCommand,
    NewsCommand,
    StatusCommand,
    RemoveCommand,
    ListBotsCommand,
    ListCommand,
    SacCommand,
    LockerCommand,
    SetLanguageCommand,
    HelpCommand,
    PingCommand,
    SkinCommand,
    InviteCommand,
    SquadCommand,
    EmoteAllCommand,
    PresetCommand,
    PremiumCommand,
];

// /createbot reste caché tant que fn_account_generator n'est pas fiable à 100%
// (voir CREATEBOT_ENABLED dans .env) — pas la peine d'exposer une commande qui échoue.
export const CommandList: Command[] = process.env.CREATEBOT_ENABLED === 'true'
    ? [...baseCommands, CreateBotCommand]
    : baseCommands;

export { Command } from './Command';
