# Interview Speech — Streaming Platform

---

## The Speech (just say this)

"I built a **scalable video streaming platform** — essentially a YouTube-like backend using Node.js, Express, and MongoDB — but I designed every layer with scalability in mind, not just features.

So the core is what you'd expect — video uploads, likes, comments, subscriptions, playlists, watch history — with JWT auth using HttpOnly cookie rotation for security.

But the interesting part is how it scales.

**First, the compute layer.** The app runs in Node.js cluster mode — one worker per CPU core, sharing the same port. If a worker crashes, the primary process automatically respawns it. So it's horizontally utilizing all available cores out of the box.

**Second, Redis sits at the center of everything.** I use it for caching with a cache-aside pattern and pattern-based invalidation using SCAN. The rate limiter is Redis-backed — so it works correctly even across multiple cluster workers or server instances. And the view counter doesn't hit MongoDB on every view — instead, views buffer in Redis and flush to MongoDB in batch every 30 seconds, which drops write contention from N writes per second to one bulk write per interval.

**Third, background job processing.** All the heavy AI work — transcription with Whisper, thumbnail generation with Gemini — runs through BullMQ job queues backed by Redis. The API returns 202 immediately, and workers process jobs asynchronously with retry logic and exponential backoff. This keeps the API responsive even under heavy upload load.

**Fourth, database performance.** I wrote an index creation script that sets up compound indexes, full-text search indexes, and unique constraints across all collections — so query patterns like subscription feeds, trending sorts, and transcript search all hit indexes instead of doing collection scans.

On top of all this, I added AI features — Gemini for smart thumbnail suggestions from extracted video frames, Whisper for automatic transcription with full-text search so users can search *what was said* inside videos, and a recommendation engine with trending, personalized, similar, and subscription-based strategies.

The whole thing has gzip compression, tiered rate limiting, a health check endpoint that pings both MongoDB and Redis, graceful shutdown that flushes buffered data before exiting, and Cloudinary CDN cleanup on video deletion."

---

## If They Ask Deeper — Ready Answers

---

### "Tell me more about the scalability architecture"

"There are five layers to it. **Cluster mode** for multi-core utilization. **Redis caching** with cache-aside and SCAN-based invalidation — not KEYS, which would block. **Buffered writes** — the view counter uses Redis INCR and pipelines, then bulk-writes to MongoDB every 30 seconds. **BullMQ queues** so AI pipelines don't block the API thread. And **database indexing** with a dedicated script that creates compound and text indexes across all collections. Each layer solves a specific bottleneck — CPU, read latency, write contention, blocking I/O, and query performance."

---

### "How does the view counter buffering work?"

"Each video view does a Redis INCR and SADD into a dirty-set — both in a pipeline, so it's one round-trip. Every 30 seconds, a flush function reads all dirty video IDs, does a GETDEL pipeline to atomically read and clear all counts, builds a bulkWrite array, and batch-updates MongoDB with `ordered: false` for max throughput. If Redis goes down, it falls back to direct MongoDB writes. On shutdown, it does a final flush so no views are lost."

---

### "How do the job queues work?"

"I have two BullMQ queues — transcription and thumbnail. When a user triggers either, the API enqueues a job with a deduplicated job ID — `transcribe-{videoId}` — so the same video can't be queued twice. Workers pick up jobs with configurable concurrency — one at a time for CPU-heavy transcription, two for thumbnails. Failed jobs retry with exponential backoff. The queues auto-clean — keeping the last 100 completed and 50 failed jobs."

---

### "How does the rate limiting handle multiple instances?"

"The rate limiter uses `express-rate-limit` with a Redis store from `rate-limit-redis`. Since state lives in Redis, not memory, it works correctly across all cluster workers and even across multiple server instances. I have three tiers — global at 100 req/min, auth endpoints at 10 req/min, and uploads at 5 req/min. If Redis goes down, it gracefully falls back to an in-memory store."

---

### "How does the thumbnail pipeline work?"

"When the endpoint is hit, BullMQ picks it up. The worker downloads the video from Cloudinary, FFmpeg extracts 8 evenly-spaced frames — skipping the first and last 5% to avoid black screens. Each frame goes to Gemini 2.0 Flash as base64 in a multi-modal prompt. Gemini returns structured JSON — frame index, score, analysis, and suggested overlay text. The frames are uploaded to Cloudinary for preview, and all temp files are cleaned up in a `finally` block."

---

### "How does the transcription and search work?"

"A BullMQ job downloads the video, FFmpeg extracts audio as 16kHz mono MP3 — optimal for Whisper. Node spawns a Python subprocess that runs the Whisper model and outputs JSON to stdout. The result has full text plus timestamped segments. I store it in MongoDB with a text index on fullText, so `$text` search works across all transcripts. The API also filters matching segments with regex to return the exact timestamps where a word appears."

---

### "Explain the recommendation engine"

"Four strategies. **Trending** uses a weighted score: `views × 1 + likes × 3 + comments × 2 − age × 0.5` — likes weighted higher because they require more intent. **Personalized** does collaborative filtering — find what you liked, find similar users, surface what they liked that you haven't seen. **Similar** matches by tags. **Subscription feed** pulls latest from channels you follow. Cold-start users fall back to trending. Results are cached in Redis."

---

### "How does graceful shutdown work?"

"The process listens for SIGTERM and SIGINT. On signal, it stops accepting new HTTP connections, flushes all buffered view counts to MongoDB, disconnects Redis cleanly, and exits. In cluster mode, if a worker dies unexpectedly, the primary process restarts it — so the system self-heals."

---

### "How do you handle auth/security?"

"Dual JWT — short-lived access token and long-lived refresh token. The refresh token is stored in the database and sent as an HttpOnly, Secure, SameSite=Strict cookie — so JavaScript can't access it. On refresh, I verify against what's stored in the DB and rotate to a new pair — single-use rotation. On logout, I `$unset` the refresh token and clear the cookie."

---

### "What happens when a video is deleted?"

"Full cascade. Destroy video and thumbnail from Cloudinary. `deleteMany` for comments and likes. `$pull` from every user's watch history. Delete the document. Plus cache invalidation — any cached data for that video gets purged. No orphaned data on the CDN or in the database."

---

## Closing Line (if needed)

"Overall, this project taught me how to think about scalability at every layer — from multi-process compute, to Redis as a shared data plane, to async job processing, to database indexing — while building real features like AI-powered content analysis and recommendation engines on top."
