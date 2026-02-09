import { Client, PartyMember, Enums } from 'fnbr';
import {
    PartyError,
    NoPartyError,
    MemberNotFoundError,
    InvalidPrivacyError,
    SelfActionError,
    MissingParameterError
} from '../core/errors';
import {
    PartyActionResult,
    PartyMemberResult,
    PartyPrivacyResult,
    PartyReadyResult,
    PartyPrivacyType
} from '../core/interfaces';

/**
 * Mapping des valeurs de confidentialité utilisateur vers les valeurs API fnbr.
 */
const PRIVACY_MAP: Record<string, { value: typeof Enums.PartyPrivacy[keyof typeof Enums.PartyPrivacy], label: PartyPrivacyType }> = {
    'public': { value: Enums.PartyPrivacy.PUBLIC, label: 'Public' },
    'private': { value: Enums.PartyPrivacy.PRIVATE, label: 'Private' },
    'friends': { value: Enums.PartyPrivacy.FRIENDS, label: 'Friends' }
} as const;

/**
 * Service gérant les actions de groupe/party pour un bot Fortnite.
 * Permet de gérer la confidentialité, les membres et l'état du bot dans un groupe.
 *
 * @example
 * ```typescript
 * const partyActions = new PartyActions();
 *
 * try {
 *   const result = await partyActions.leaveParty(client);
 *   console.log('Parti du groupe');
 * } catch (error) {
 *   if (error instanceof NoPartyError) {
 *     console.log('Pas dans un groupe');
 *   }
 * }
 * ```
 */
export class PartyActions {
    /**
     * Vérifie que le client est dans une party et la retourne.
     * @param client - Instance du client Fortnite
     * @returns La party du client
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     */
    private assertInParty(client: Client): NonNullable<Client['party']> {
        if (!client.party) {
            throw new NoPartyError();
        }
        return client.party;
    }

    /**
     * Recherche un membre dans le groupe par nom.
     * @param client - Instance du client Fortnite
     * @param query - Terme de recherche (nom partiel accepté)
     * @returns Le membre trouvé
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {MemberNotFoundError} Si le membre n'est pas trouvé
     */
    private findMember(client: Client, query: string): PartyMember {
        const party = this.assertInParty(client);

        const member = party.members.find(
            (m: PartyMember) => m.displayName?.toLowerCase().includes(query.toLowerCase())
        );

        if (!member) {
            throw new MemberNotFoundError(query);
        }

        return member;
    }

    /**
     * Quitte le groupe actuel.
     *
     * @param client - Instance du client Fortnite connecté
     * @returns Résultat de l'opération
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {PartyError} Si l'opération échoue
     */
    async leaveParty(client: Client): Promise<PartyActionResult> {
        const party = this.assertInParty(client);

        try {
            await party.leave();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            throw new PartyError(`Erreur lors du départ du groupe: ${message}`, 'LEAVE_ERROR', error);
        }

        return { success: true, action: 'leave' };
    }

    /**
     * Définit la confidentialité du groupe.
     *
     * @param client - Instance du client Fortnite connecté
     * @param privacy - Niveau de confidentialité ('public', 'private', 'friends')
     * @returns Résultat avec la nouvelle confidentialité
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {InvalidPrivacyError} Si la valeur de confidentialité est invalide
     * @throws {PartyError} Si l'opération échoue
     */
    async setPrivacy(client: Client, privacy: string): Promise<PartyPrivacyResult> {
        const party = this.assertInParty(client);

        const privacyConfig = PRIVACY_MAP[privacy.toLowerCase()];
        if (!privacyConfig) {
            throw new InvalidPrivacyError(privacy);
        }

        try {
            await party.setPrivacy(privacyConfig.value);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            throw new PartyError(
                `Erreur lors du changement de confidentialité: ${message}`,
                'PRIVACY_ERROR',
                error
            );
        }

        return { success: true, action: 'privacy', privacy: privacyConfig.label };
    }

    /**
     * Promeut un membre comme chef du groupe.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Nom ou partie du nom du membre à promouvoir
     * @returns Résultat avec les informations du membre promu
     * @throws {MissingParameterError} Si le nom n'est pas fourni
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {MemberNotFoundError} Si le membre n'est pas trouvé
     * @throws {PartyError} Si l'opération échoue
     */
    async promoteMember(client: Client, query: string): Promise<PartyMemberResult> {
        if (!query || query.trim() === '') {
            throw new MissingParameterError('pseudo', '!promote <pseudo>');
        }

        const member = this.findMember(client, query);

        try {
            await member.promote();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            throw new PartyError(
                `Erreur lors de la promotion de ${member.displayName}: ${message}`,
                'PROMOTE_ERROR',
                error
            );
        }

        return {
            success: true,
            action: 'promote',
            member: { id: member.id, displayName: member.displayName ?? 'Inconnu' }
        };
    }

    /**
     * Exclut un membre du groupe.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Nom ou partie du nom du membre à exclure
     * @returns Résultat avec les informations du membre exclu
     * @throws {MissingParameterError} Si le nom n'est pas fourni
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {MemberNotFoundError} Si le membre n'est pas trouvé
     * @throws {SelfActionError} Si on tente de s'exclure soi-même
     * @throws {PartyError} Si l'opération échoue
     */
    async kickMember(client: Client, query: string): Promise<PartyMemberResult> {
        if (!query || query.trim() === '') {
            throw new MissingParameterError('pseudo', '!kick <pseudo>');
        }

        const member = this.findMember(client, query);

        // Vérifier qu'on ne s'exclut pas soi-même
        if (client.user?.self && member.id === client.user.self.id) {
            throw new SelfActionError('kick');
        }

        try {
            await member.kick();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            throw new PartyError(
                `Erreur lors de l'exclusion de ${member.displayName}: ${message}`,
                'KICK_ERROR',
                error
            );
        }

        return {
            success: true,
            action: 'kick',
            member: { id: member.id, displayName: member.displayName ?? 'Inconnu' }
        };
    }

    /**
     * Définit l'état de préparation du bot.
     *
     * @param client - Instance du client Fortnite connecté
     * @param isReady - true pour prêt, false pour pas prêt
     * @returns Résultat avec le nouvel état
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {PartyError} Si l'opération échoue
     */
    async setReady(client: Client, isReady: boolean): Promise<PartyReadyResult> {
        const party = this.assertInParty(client);

        try {
            // Utilisation de l'API avec vérification de l'existence de la méthode
            const partyMe = party.me as { setReadiness?: (ready: boolean) => Promise<void> };
            if (typeof partyMe.setReadiness === 'function') {
                await partyMe.setReadiness(isReady);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            throw new PartyError(
                `Erreur lors du changement d'état de préparation: ${message}`,
                'READY_ERROR',
                error
            );
        }

        return { success: true, action: 'ready', isReady };
    }
}
