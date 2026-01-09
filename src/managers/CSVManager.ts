import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { BotAccount, CSVRow, DeviceAuth } from '../types';

export class CSVManager {
    private csvPath: string;

    constructor(csvPath: string = path.join(__dirname, '../../accounts.csv')) {
        this.csvPath = csvPath;
    }

    /**
     * Lit tous les comptes depuis le fichier CSV
     */
    async readAccounts(): Promise<BotAccount[]> {
        return new Promise((resolve, reject) => {
            const accounts: BotAccount[] = [];

            fs.createReadStream(this.csvPath)
                .pipe(csv())
                .on('data', (row: CSVRow) => {
                    if (row.email && row.password) {
                        const account: BotAccount = {
                            pseudo: row.pseudo || undefined,
                            email: row.email,
                            password: row.password,
                        };

                        // Si device auth existe dans le CSV, on l'ajoute
                        if (row.device_id && row.account_id && row.secret) {
                            account.deviceAuth = {
                                deviceId: row.device_id,
                                accountId: row.account_id,
                                secret: row.secret,
                            };
                        }

                        accounts.push(account);
                    }
                })
                .on('end', () => resolve(accounts))
                .on('error', (error) => reject(error));
        });
    }

    /**
     * Sauvegarde le device auth pour un compte dans le CSV
     */
    async saveDeviceAuth(email: string, deviceAuth: DeviceAuth): Promise<void> {
        const accounts = await this.readAccounts();

        // Trouver le compte et mettre à jour le device auth
        const account = accounts.find(a => a.email === email);
        if (account) {
            account.deviceAuth = deviceAuth;
        }

        // Réécrire le CSV
        await this.writeAccounts(accounts);
    }

    /**
     * Écrit tous les comptes dans le CSV
     */
    private async writeAccounts(accounts: BotAccount[]): Promise<void> {
        const csvLines: string[] = ['pseudo,email,password,device_id,account_id,secret'];

        for (const account of accounts) {
            const line = [
                account.pseudo || '',
                account.email,
                account.password,
                account.deviceAuth?.deviceId || '',
                account.deviceAuth?.accountId || '',
                account.deviceAuth?.secret || '',
            ].join(',');

            csvLines.push(line);
        }

        await fs.promises.writeFile(this.csvPath, csvLines.join('\n'), 'utf-8');
    }

    /**
     * Ajoute un nouveau compte au CSV
     */
    async addAccount(account: BotAccount): Promise<void> {
        const accounts = await this.readAccounts();

        // Vérifier si le compte existe déjà
        if (accounts.some(a => a.email === account.email)) {
            throw new Error(`Le compte ${account.email} existe déjà`);
        }

        accounts.push(account);
        await this.writeAccounts(accounts);
    }

    /**
     * Supprime un compte du CSV
     */
    async removeAccount(email: string): Promise<void> {
        const accounts = await this.readAccounts();
        const filtered = accounts.filter(a => a.email !== email);

        if (filtered.length === accounts.length) {
            throw new Error(`Le compte ${email} n'existe pas`);
        }

        await this.writeAccounts(filtered);
    }
}
