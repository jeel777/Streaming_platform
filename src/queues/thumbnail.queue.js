/**
 * Thumbnail Generation Job Queue
 * ───────────────────────────────
 * Offloads FFmpeg frame extraction + Gemini AI analysis to a background
 * worker so the API returns 202 immediately.
 *
 * Queue: "thumbnail"
 * Job data: { videoId, userId }
 */

import { Queue, Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { generateThumbnailSuggestions } from "../services/thumbnail.service.js";

const QUEUE_NAME = "thumbnail";

// ── Queue (producer) ─────────────────────────────────────────────────
let thumbnailQueue = null;

const getThumbnailQueue = () => {
    if (thumbnailQueue) return thumbnailQueue;

    thumbnailQueue = new Queue(QUEUE_NAME, {
        connection: getRedisClient(),
        defaultJobOptions: {
            attempts: 2,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 50 },
        },
    });

    console.log("[Queue] Thumbnail queue initialized");
    return thumbnailQueue;
};

/**
 * Enqueue a thumbnail generation job.
 * @param {string} videoId
 * @param {string} userId
 * @returns {Promise<Object>} The BullMQ job object
 */
const enqueueThumbnailGeneration = async (videoId, userId) => {
    const queue = getThumbnailQueue();
    const job = await queue.add(
        "generate-thumbnails",
        { videoId, userId },
        {
            jobId: `thumbnail-${videoId}`, // prevents duplicate jobs for same video
        }
    );

    console.log(`[Queue] Thumbnail job enqueued: ${job.id} for video ${videoId}`);
    return job;
};

// ── Worker (consumer) ────────────────────────────────────────────────
let thumbnailWorker = null;

const startThumbnailWorker = () => {
    if (thumbnailWorker) return thumbnailWorker;

    thumbnailWorker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const { videoId } = job.data;
            console.log(`[Worker] Generating thumbnails for video ${videoId}`);

            const result = await generateThumbnailSuggestions(videoId);
            return {
                videoId,
                suggestionsCount: result.suggestions?.length || 0,
            };
        },
        {
            connection: getRedisClient(),
            concurrency: 2, // thumbnails are lighter than transcription
        }
    );

    thumbnailWorker.on("completed", (job, result) => {
        console.log(
            `[Worker] ✅ Thumbnails generated: ${job.id} — ${result.suggestionsCount} suggestions`
        );
    });

    thumbnailWorker.on("failed", (job, err) => {
        console.error(`[Worker] ❌ Thumbnail generation failed: ${job.id} — ${err.message}`);
    });

    console.log("[Worker] Thumbnail worker started");
    return thumbnailWorker;
};

export { getThumbnailQueue, enqueueThumbnailGeneration, startThumbnailWorker };
