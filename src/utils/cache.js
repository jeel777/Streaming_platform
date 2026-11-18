/**
 * Cache Utility
 * ─────────────
 * Thin wrapper around Redis for get/set/invalidate with JSON serialization.
 * Falls back gracefully if Redis is unavailable (cache miss = proceed as normal).
 */

import { getRedisClient } from "../config/redis.js";

/**
 * Get a cached value by key.
 * @param {string} key
 * @returns {Promise<any|null>} Parsed value or null on miss/error
 */
const cacheGet = async (key) => {
    try {
        const redis = getRedisClient();
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.warn(`[Cache] GET failed for "${key}":`, err.message);
        return null;
    }
};

/**
 * Set a cached value with TTL.
 * @param {string} key
 * @param {any} value - Will be JSON-serialized
 * @param {number} ttlSeconds - Time-to-live in seconds (default: 300 = 5 min)
 */
const cacheSet = async (key, value, ttlSeconds = 300) => {
    try {
        const redis = getRedisClient();
        await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
        console.warn(`[Cache] SET failed for "${key}":`, err.message);
    }
};

/**
 * Delete a specific cache key.
 * @param {string} key
 */
const cacheDel = async (key) => {
    try {
        const redis = getRedisClient();
        await redis.del(key);
    } catch (err) {
        console.warn(`[Cache] DEL failed for "${key}":`, err.message);
    }
};

/**
 * Invalidate all keys matching a pattern.
 * Uses SCAN (non-blocking) instead of KEYS (blocking).
 * @param {string} pattern - e.g. "video:*" or "trending:*"
 */
const cacheInvalidatePattern = async (pattern) => {
    try {
        const redis = getRedisClient();
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis.scan(
                cursor,
                "MATCH",
                pattern,
                "COUNT",
                100
            );
            cursor = nextCursor;
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== "0");
    } catch (err) {
        console.warn(`[Cache] Pattern invalidation failed for "${pattern}":`, err.message);
    }
};

/**
 * Cache-aside pattern helper.
 * Checks cache first, calls fetcher on miss, stores result.
 *
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function to call on cache miss
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<any>} Cached or freshly fetched data
 */
const cacheWrap = async (key, fetcher, ttlSeconds = 300) => {
    const cached = await cacheGet(key);
    if (cached !== null) {
        return cached;
    }

    const freshData = await fetcher();
    await cacheSet(key, freshData, ttlSeconds);
    return freshData;
};

export { cacheGet, cacheSet, cacheDel, cacheInvalidatePattern, cacheWrap };
