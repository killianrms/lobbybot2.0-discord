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

export const CommandList: Command[] = [
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
    SetLanguageCommand
];

export { Command } from './Command';
