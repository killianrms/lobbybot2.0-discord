import * as fs from 'fs';
import * as path from 'path';

export interface AdminConfig {
    FullAccess: string[];
    VIPs?: string[];
    BanList?: string[];
    BanMessages?: string[];
    BanSkins?: string[];
}

export class AdminManager {
    private configPath: string;
    private config: AdminConfig;

    constructor(configPath: string = path.join(__dirname, '../../info.json')) {
        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    /**
     * Charge la configuration depuis info.json
     */
    private loadConfig(): AdminConfig {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                return JSON.parse(data);
            } else {
                // Créer un fichier de config par défaut
                const defaultConfig: AdminConfig = {
                    FullAccess: [],
                    VIPs: [],
                    BanList: [],
                    BanMessages: [],
                    BanSkins: [],
                };
                this.saveConfig(defaultConfig);
                return defaultConfig;
            }
        } catch (error: any) {
            console.error('[AdminManager] Error loading config:', error.message);
            return {
                FullAccess: [],
                VIPs: [],
                BanList: [],
                BanMessages: [],
                BanSkins: [],
            };
        }
    }

    /**
     * Sauvegarde la configuration dans info.json
     */
    private saveConfig(config: AdminConfig): void {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 4), 'utf-8');
        } catch (error: any) {
            console.error('[AdminManager] Error saving config:', error.message);
        }
    }

    /**
     * Recharge la configuration depuis le fichier
     */
    public reloadConfig(): void {
        this.config = this.loadConfig();
    }

    /**
     * Vérifie si un utilisateur est admin
     */
    public isAdmin(displayName: string): boolean {
        return this.config.FullAccess.includes(displayName);
    }

    /**
     * Vérifie si un utilisateur est VIP
     */
    public isVIP(displayName: string): boolean {
        return this.config.VIPs?.includes(displayName) || false;
    }

    /**
     * Vérifie si un utilisateur est banni
     */
    public isBanned(displayName: string): boolean {
        if (!this.config.BanList) return false;

        // Vérifier le ban exact
        if (this.config.BanList.includes(displayName)) {
            return true;
        }

        // Vérifier le ban partiel (si le nom contient un mot banni)
        return this.config.BanList.some(bannedWord =>
            displayName.toLowerCase().includes(bannedWord.toLowerCase())
        );
    }

    /**
     * Vérifie si un skin est banni
     */
    public isSkinBanned(skinId: string): boolean {
        return this.config.BanSkins?.includes(skinId) || false;
    }

    /**
     * Vérifie si un message contient des mots bannis
     */
    public hasBlockedWords(message: string): boolean {
        if (!this.config.BanMessages) return false;

        return this.config.BanMessages.some(bannedWord =>
            message.toLowerCase().includes(bannedWord.toLowerCase())
        );
    }

    /**
     * Ajoute un admin
     */
    public addAdmin(displayName: string): void {
        if (!this.config.FullAccess.includes(displayName)) {
            this.config.FullAccess.push(displayName);
            this.saveConfig(this.config);
        }
    }

    /**
     * Retire un admin
     */
    public removeAdmin(displayName: string): void {
        const index = this.config.FullAccess.indexOf(displayName);
        if (index !== -1) {
            this.config.FullAccess.splice(index, 1);
            this.saveConfig(this.config);
        }
    }

    /**
     * Ajoute un VIP
     */
    public addVIP(displayName: string): void {
        if (!this.config.VIPs) {
            this.config.VIPs = [];
        }
        if (!this.config.VIPs.includes(displayName)) {
            this.config.VIPs.push(displayName);
            this.saveConfig(this.config);
        }
    }

    /**
     * Retire un VIP
     */
    public removeVIP(displayName: string): void {
        if (!this.config.VIPs) return;

        const index = this.config.VIPs.indexOf(displayName);
        if (index !== -1) {
            this.config.VIPs.splice(index, 1);
            this.saveConfig(this.config);
        }
    }

    /**
     * Ajoute un joueur à la banlist
     */
    public addToBanList(displayName: string): void {
        if (!this.config.BanList) {
            this.config.BanList = [];
        }
        if (!this.config.BanList.includes(displayName)) {
            this.config.BanList.push(displayName);
            this.saveConfig(this.config);
        }
    }

    /**
     * Retire un joueur de la banlist
     */
    public removeFromBanList(displayName: string): void {
        if (!this.config.BanList) return;

        const index = this.config.BanList.indexOf(displayName);
        if (index !== -1) {
            this.config.BanList.splice(index, 1);
            this.saveConfig(this.config);
        }
    }

    /**
     * Ajoute un skin à la banlist
     */
    public addBannedSkin(skinId: string): void {
        if (!this.config.BanSkins) {
            this.config.BanSkins = [];
        }
        if (!this.config.BanSkins.includes(skinId)) {
            this.config.BanSkins.push(skinId);
            this.saveConfig(this.config);
        }
    }

    /**
     * Retire un skin de la banlist
     */
    public removeBannedSkin(skinId: string): void {
        if (!this.config.BanSkins) return;

        const index = this.config.BanSkins.indexOf(skinId);
        if (index !== -1) {
            this.config.BanSkins.splice(index, 1);
            this.saveConfig(this.config);
        }
    }

    /**
     * Ajoute un mot banni
     */
    public addBannedMessage(word: string): void {
        if (!this.config.BanMessages) {
            this.config.BanMessages = [];
        }
        if (!this.config.BanMessages.includes(word)) {
            this.config.BanMessages.push(word);
            this.saveConfig(this.config);
        }
    }

    /**
     * Retire un mot banni
     */
    public removeBannedMessage(word: string): void {
        if (!this.config.BanMessages) return;

        const index = this.config.BanMessages.indexOf(word);
        if (index !== -1) {
            this.config.BanMessages.splice(index, 1);
            this.saveConfig(this.config);
        }
    }

    /**
     * Obtient la liste des admins
     */
    public getAdmins(): string[] {
        return [...this.config.FullAccess];
    }

    /**
     * Obtient la liste des VIPs
     */
    public getVIPs(): string[] {
        return [...(this.config.VIPs || [])];
    }

    /**
     * Obtient la banlist
     */
    public getBanList(): string[] {
        return [...(this.config.BanList || [])];
    }
}
