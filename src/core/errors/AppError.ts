/**
 * Classe de base pour toutes les erreurs applicatives.
 * Permet une gestion d'erreurs structurée et cohérente.
 */
export class AppError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode: number = 500
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Erreur liée aux appels API externes.
 */
export class APIError extends AppError {
    constructor(message: string, public readonly originalError?: unknown) {
        super(message, 'API_ERROR', 500);
    }
}

/**
 * Erreur de validation des données.
 */
export class ValidationError extends AppError {
    constructor(message: string, public readonly field?: string) {
        super(message, 'VALIDATION_ERROR', 400);
    }
}

/**
 * Erreur de limite de taux d'appels API.
 */
export class RateLimitError extends AppError {
    constructor(message: string, public readonly retryAfter?: number) {
        super(message, 'RATE_LIMIT_ERROR', 429);
    }
}

