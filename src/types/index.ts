import { Client } from 'fnbr';

export interface DeviceAuth {
    accountId: string;
    deviceId: string;
    secret: string;
}

export interface BotAccount {
    pseudo?: string;
    email: string;
    password: string;
    deviceAuth?: DeviceAuth;
}

export interface BotInstance {
    account: BotAccount;
    client: Client;
    isConnected: boolean;
    connectionAttempts: number;
}

export interface CSVRow {
    pseudo: string;
    email: string;
    password: string;
    device_id?: string;
    account_id?: string;
    secret?: string;
}
