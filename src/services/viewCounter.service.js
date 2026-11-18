/**
 * View Counter Service (Redis-Buffered)
 * ──────────────────────────────────────
 * Instead of hitting MongoDB on every video view, buffer view counts
 * in Redis and flush to MongoDB periodically.
 *
 * This reduces write contention from N writes/sec → 1 batch write every FLUSH_INTERVAL.
 *
 * Flow:
 *  1. `incrementView(videoId)` → INCR in Redis (O(1), ~0.1ms)
 *  2. Every 30s → `flushViews()` reads all buffered counts, batch-updates MongoDB
 */

import { getRedisClient } from "../config/redis.js";
import { Video } from "../models/video.model.js";

const VIEW_KEY_PREFIX = "views:buffer:";
const VIEW_SET_KEY = "views:dirty"; // Set of videoIds with pending views
const FLUSH_INTERVAL_MS = 30 * 1000; // 30 seconds

let flushTimer = null;

/**
 * Increment view count for a video in Redis (non-blocking).
 * @param {string} videoId
 */
const incrementView = async (videoId) => {
    try {
        const redis = getRedisClient();
        const pipeline = redis.pipeline();
        pipeline.incr(`${VIEW_KEY_PREFIX}${videoId}`);
        pipeline.sadd(VIEW_SET_KEY, videoId); // track which videos have pending views
        await pipeline.exec();
    } catch (err) {
        // Fallback: write directly to MongoDB if Redis fails
        console.warn("[ViewCounter] Redis failed, falling back to direct write:", err.message);
        await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    }
};

/**
 * Flush all buffered view counts from Redis to MongoDB.
 * Called periodically by the flush timer.
 */
const flushViews = async () => {
    try {
        const redis = getRedisClient();

        // Get all videoIds with pending views
        const dirtyVideoIds = await redis.smembers(VIEW_SET_KEY);

        if (dirtyVideoIds.length === 0) return;

        // Read all pending counts atomically using a pipeline
        const pipeline = redis.pipeline();
        for (const videoId of dirtyVideoIds) {
            pipeline.getdel(`${VIEW_KEY_PREFIX}${videoId}`); // GET and DELETE atomically
        }
        const results = await pipeline.exec();

        // Build bulk write operations
        const bulkOps = [];
        for (let i = 0; i < dirtyVideoIds.length; i++) {
            const [err, count] = results[i];
            if (err || !count) continue;

            const increment = parseInt(count, 10);
            if (increment > 0) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: dirtyVideoIds[i] },
                        update: { $inc: { views: increment } },
                    },
                });
            }
        }

        // Batch write to MongoDB
        if (bulkOps.length > 0) {
            await Video.bulkWrite(bulkOps, { ordered: false });
            console.log(`[ViewCounter] Flushed ${bulkOps.length} view counts to MongoDB`);
        }

        // Clear the dirty set
        await redis.del(VIEW_SET_KEY);
    } catch (err) {
        console.error("[ViewCounter] Flush error:", err.message);
    }
};

/**
 * Start the periodic flush timer.
 * Call this once during server startup.
 */
const startViewCounterFlush = () => {
    if (flushTimer) return;

    flushTimer = setInterval(flushViews, FLUSH_INTERVAL_MS);
    // Don't let the timer prevent Node.js from exiting
    flushTimer.unref();

    console.log(
        `[ViewCounter] ✅ Flush timer started (every ${FLUSH_INTERVAL_MS / 1000}s)`
    );
};

/**
 * Stop the flush timer and do a final flush.
 * Call this during graceful shutdown.
 */
const stopViewCounterFlush = async () => {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    // Final flush to avoid losing buffered views
    await flushViews();
    console.log("[ViewCounter] Stopped and flushed");
};

export { incrementView, flushViews, startViewCounterFlush, stopViewCounterFlush };
