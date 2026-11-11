/**
 * Better Auth Configuration
 *
 * Security Best Practices:
 * - Cookie security: SameSite=Lax (CSRF protection), Secure (HTTPS only), HttpOnly (XSS protection)
 * - Rate limiting: Device authorization endpoints protected against brute-force
 * - Trusted origins: Set TRUSTED_ORIGINS env var to whitelist allowed domains
 */
export default {
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
    },
    plugins: ["anonymous"],
    session: {
        expiresInDays: 30,
        updateAgeInDays: 1,
    },
    database: {
        usePlural: true,
        debugLogs: true,
    },
    // Security: Secure cookie defaults
    advanced: {
        defaultCookieAttributes: {
            sameSite: 'lax',   // Prevent CSRF attacks
            secure: true,       // HTTPS only
            httpOnly: true,     // Prevent JavaScript access (XSS mitigation)
        },
    },
    // Security: Rate limiting for device authorization
    rateLimit: {
        enabled: true,
        window: 60,
        max: 100,
        customRules: {
            "/sign-in/email": { window: 60, max: 10 },
            "/sign-in/social": { window: 60, max: 10 },
            "/device/init": { window: 60, max: 5 },
            "/device/poll": { window: 60, max: 30 },
            "/device/token": { window: 60, max: 10 },
        },
    },
};
