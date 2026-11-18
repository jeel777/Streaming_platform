/**
 * Rate Limiter Middleware
 * ──────────────────────
 * Protects API from abuse using express-rate-limit + Redis store.
 *
 * Three tiers:
 *  1. globalLimiter     — 100 req/min per IP (applied to all routes)
 *  2. authLimiter       — 10 req/min per IP (login, register, refresh-token)
 *  3. uploadLimiter     — 5 req/min per IP (video upload)
 */

import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../config/redis.js";

/**
 * Create a rate limiter with Redis store.
 * Falls back to in-memory store if Redis is unavailable.
 */
const createLimiter = (options = {}) => {
    let store;
    try {
        store = new RedisStore({
            sendCommand: (...args) => getRedisClient().call(...args),
            prefix: options.prefix || "rl:",
        });
    } catch (err) {
        console.warn("[RateLimiter] Redis store unavailable, using in-memory store:", err.message);
        store = undefined; // falls back to express-rate-limit's built-in MemoryStore
    }

    return rateLimit({
        store,
        standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
        legacyHeaders: false,  // Disable `X-RateLimit-*` headers
        message: {
            success: false,
            statusCode: 429,
            message: options.message || "Too many requests. Please try again later.",
        },
        ...options,
    });
};

// ── Tier 1: Global (all routes) ──────────────────────────────────────
const globalLimiter = createLimiter({
    windowMs: 60 * 1000,  // 1 minute
    max: 100,             // 100 requests per minute per IP
    prefix: "rl:global:",
    message: "Too many requests. Please try again in a minute.",
});

// ── Tier 2: Auth endpoints ───────────────────────────────────────────
const authLimiter = createLimiter({
    windowMs: 60 * 1000,  // 1 minute
    max: 10,              // 10 requests per minute per IP
    prefix: "rl:auth:",
    message: "Too many authentication attempts. Please try again later.",
});

// ── Tier 3: Upload endpoints ─────────────────────────────────────────
const uploadLimiter = createLimiter({
    windowMs: 60 * 1000,  // 1 minute
    max: 5,               // 5 uploads per minute per IP
    prefix: "rl:upload:",
    message: "Upload rate limit exceeded. Please wait before uploading again.",
});

export { globalLimiter, authLimiter, uploadLimiter };
