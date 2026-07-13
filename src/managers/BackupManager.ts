import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from './DatabaseManager';
import { sendAlert } from '../utils/AlertManager';

const MAX_BACKUPS = 30;

/**
 * Exporte périodiquement toute la BD (bots + users, credentials inclus) en JSON sur disque.
 * Sert de filet de secours si la DB SQLite est corrompue/perdue, et de format portable
 * pour migrer vers une autre DB plus tard (voir DatabaseManager.importRaw()).
 */
export class BackupManager {
    private dbManager: DatabaseManager;
    private backupDir: string;

    constructor(dbManager: DatabaseManager) {
        this.dbManager = dbManager;
        this.backupDir = path.join(path.dirname(dbManager.dbPath), 'backups');
        fs.mkdirSync(this.backupDir, { recursive: true });
    }

    public async writeBackup(): Promise<string> {
        const dump = await this.dbManager.exportRaw();
        const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filePath = path.join(this.backupDir, filename);

        fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf-8');
        this.rotate();

        return filePath;
    }

    public latestBackupPath(): string | null {
        const files = fs.readdirSync(this.backupDir).filter(f => f.startsWith('backup-') && f.endsWith('.json'));
        if (files.length === 0) return null;
        files.sort();
        return path.join(this.backupDir, files[files.length - 1]);
    }

    private rotate(): void {
        const files = fs.readdirSync(this.backupDir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .sort();

        while (files.length > MAX_BACKUPS) {
            const oldest = files.shift()!;
            fs.unlinkSync(path.join(this.backupDir, oldest));
        }
    }

    public startAutoBackup(intervalMs: number = 6 * 60 * 60 * 1000): void {
        console.log(`[BackupManager] 💾 Backup automatique toutes les ${intervalMs / 3_600_000}h → ${this.backupDir}`);

        const run = async () => {
            try {
                const filePath = await this.writeBackup();
                console.log(`[BackupManager] ✅ Backup écrit: ${filePath}`);
            } catch (e: any) {
                console.error('[BackupManager] ❌ Échec du backup:', e.message);
                sendAlert('backup-failed', '🔴 Échec du backup automatique', `\`\`\`${e.message}\`\`\``, 'critical');
            }
        };

        run(); // premier backup immédiat au démarrage
        setInterval(run, intervalMs);
    }
}
