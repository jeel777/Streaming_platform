/**
 * Transcription Job Queue
 * ───────────────────────
 * Offloads Whisper transcription to a background worker so the API
 * returns 202 immediately instead of blocking for minutes.
 *
 * Queue: "transcription"
 * Job data: { videoId, model, language, userId }
 */

import { Queue, Worker } from "bullmq";
import { getRedisClient } from "../config/redis.js";
import { generateTranscript } from "../services/transcription.service.js";

const QUEUE_NAME = "transcription";

// ── Queue (producer) ─────────────────────────────────────────────────
let transcriptionQueue = null;

const getTranscriptionQueue = () => {
    if (transcriptionQueue) return transcriptionQueue;

    transcriptionQueue = new Queue(QUEUE_NAME, {
        connection: getRedisClient(),
        defaultJobOptions: {
            attempts: 2,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { count: 100 }, // keep last 100 completed jobs
            removeOnFail: { count: 50 },
        },
    });

    console.log("[Queue] Transcription queue initialized");
    return transcriptionQueue;
};

/**
 * Enqueue a transcription job.
 * @param {string} videoId
 * @param {Object} options - { model, language, userId }
 * @returns {Promise<Object>} The BullMQ job object
 */
const enqueueTranscription = async (videoId, options = {}) => {
    const queue = getTranscriptionQueue();
    const job = await queue.add(
        "transcribe",
        {
            videoId,
            model: options.model || "base",
            language: options.language || null,
            userId: options.userId,
        },
        {
            jobId: `transcribe-${videoId}`, // prevents duplicate jobs for same video
        }
    );

    console.log(`[Queue] Transcription job enqueued: ${job.id} for video ${videoId}`);
    return job;
};

// ── Worker (consumer) ────────────────────────────────────────────────
let transcriptionWorker = null;

const startTranscriptionWorker = () => {
    if (transcriptionWorker) return transcriptionWorker;

    transcriptionWorker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const { videoId, model, language } = job.data;
            console.log(
                `[Worker] Processing transcription for video ${videoId} (model: ${model})`
            );

            const transcript = await generateTranscript(videoId, { model, language });
            return {
                transcriptId: transcript._id.toString(),
                segments: transcript.segments?.length || 0,
                language: transcript.language,
                duration: transcript.duration,
            };
        },
        {
            connection: getRedisClient(),
            concurrency: 1, // one transcription at a time (CPU-intensive)
        }
    );

    transcriptionWorker.on("completed", (job, result) => {
        console.log(
            `[Worker] ✅ Transcription completed: ${job.id} — ` +
            `${result.segments} segments, ${result.duration}s`
        );
    });

    transcriptionWorker.on("failed", (job, err) => {
        console.error(`[Worker] ❌ Transcription failed: ${job.id} — ${err.message}`);
    });

    console.log("[Worker] Transcription worker started");
    return transcriptionWorker;
};

export { getTranscriptionQueue, enqueueTranscription, startTranscriptionWorker };
