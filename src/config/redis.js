/**
 * Redis Client Singleton
 * ──────────────────────
 * Centralized Redis connection used by:
 *  - Cache layer (get/set/invalidate)
 *  - BullMQ job queues (transcription, thumbnails)
 *  - Rate limiter store (multi-instance safe)
 *  - View count buffering
 */

import Redis from "ioredis";

// Lazy-initialized singleton — avoids connection on import if Redis isn't configured
let redisClient = null;

const getRedisClient = () => {
    if (redisClient) return redisClient;

    const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null, // required by BullMQ
        enableReadyCheck: false,
        retryStrategy(times) {
            if (times > 10) {
                console.error("[Redis] Max retries reached. Giving up.");
                return null; // stop retrying
            }
            const delay = Math.min(times * 200, 3000);
            console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times})...`);
            return delay;
        },
    });

    redisClient.on("connect", () => {
        console.log("[Redis] ✅ Connected");
    });

    redisClient.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
    });

    return redisClient;
};

/**
 * Gracefully disconnect Redis (called during shutdown).
 */
const disconnectRedis = async () => {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log("[Redis] Disconnected");
    }
};

export { getRedisClient, disconnectRedis };
