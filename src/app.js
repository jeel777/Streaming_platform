import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import compression from "compression"
import { globalLimiter } from "./middlewares/rateLimiter.middleware.js"
import mongoose from "mongoose"
import { getRedisClient } from "./config/redis.js"

const app = express();

// ── Core Middleware ──────────────────────────────────────────────────
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))

app.use(compression())  // gzip compress all responses
app.use(globalLimiter)   // 100 req/min per IP across all routes
app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" }))
app.use(express.static("public")) // This line serves static files from the "public" directory.
app.use(cookieParser())

// ── Health Check ─────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
    const healthcheck = {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
            mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
            redis: "unknown",
        },
    };

    // Check Redis
    try {
        const redis = getRedisClient();
        await redis.ping();
        healthcheck.services.redis = "connected";
    } catch {
        healthcheck.services.redis = "disconnected";
    }

    const isHealthy = healthcheck.services.mongodb === "connected";
    res.status(isHealthy ? 200 : 503).json(healthcheck);
});

import userRoutes from "./routes/user.routes.js"
import videoRoutes from "./routes/video.routes.js"
import commentRoutes from "./routes/comment.routes.js"
import likeRoutes from "./routes/like.routes.js"
import playlistRoutes from "./routes/playlist.routes.js"
import tweetRoutes from "./routes/tweet.routes.js"
import subscriptionRoutes from "./routes/subscription.routes.js"
import thumbnailRoutes from "./routes/thumbnail.routes.js"
import recommendationRoutes from "./routes/recommendation.routes.js"
import transcriptionRoutes from "./routes/transcription.routes.js"

// routers declaration
app.use("/api/v1/users", userRoutes)
app.use("/api/v1/videos", videoRoutes)
app.use("/api/v1/comments", commentRoutes)
app.use("/api/v1/likes", likeRoutes)
app.use("/api/v1/playlists", playlistRoutes)
app.use("/api/v1/tweets", tweetRoutes)
app.use("/api/v1/subscriptions", subscriptionRoutes)
app.use("/api/v1/ai", thumbnailRoutes)
app.use("/api/v1/ai/transcripts", transcriptionRoutes)
app.use("/api/v1/recommendations", recommendationRoutes)

// global error handler — converts ApiError into proper JSON responses
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Something went wrong";

    return res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        errors: err.errors || [],
        ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
});


export { app }