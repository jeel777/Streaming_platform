/**
 * MongoDB Index Creation Script
 * ─────────────────────────────
 * Run once to create all necessary indexes for optimal query performance.
 * Usage: node -r dotenv/config scripts/create-indexes.js
 *
 * These indexes cover:
 *  - Video listing, filtering, and full-text search
 *  - Like/comment count aggregations
 *  - Subscription feed lookups
 *  - Transcript full-text search
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { DB_NAME } from "../src/constant.js";

dotenv.config({ path: "./.env" });

const INDEXES = [
    // ── Videos ──────────────────────────────────────────────────────────
    {
        collection: "videos",
        indexes: [
            {
                key: { ispublished: 1, createdAt: -1 },
                name: "idx_published_created",
                comment: "Default listing: published videos sorted by newest",
            },
            {
                key: { owner: 1, ispublished: 1, createdAt: -1 },
                name: "idx_owner_published",
                comment: "Channel page: videos by a specific creator",
            },
            {
                key: { tags: 1 },
                name: "idx_tags",
                comment: "Similar videos: tag-based matching",
            },
            {
                key: { title: "text", description: "text" },
                name: "idx_text_search",
                comment: "Full-text search on title and description (replaces $regex)",
            },
            {
                key: { views: -1 },
                name: "idx_views",
                comment: "Trending/popular video sorting",
            },
        ],
    },

    // ── Likes ────────────────────────────────────────────────────────────
    {
        collection: "likes",
        indexes: [
            {
                key: { video: 1 },
                name: "idx_likes_video",
                comment: "Like count per video (used in every video aggregation)",
            },
            {
                key: { likeby: 1, video: 1 },
                name: "idx_likes_user_video",
                comment: "Check if user liked a video + personalized feed",
            },
            {
                key: { likeby: 1, tweet: 1 },
                name: "idx_likes_user_tweet",
                comment: "Check if user liked a tweet",
            },
            {
                key: { likeby: 1, comment: 1 },
                name: "idx_likes_user_comment",
                comment: "Check if user liked a comment",
            },
        ],
    },

    // ── Comments ─────────────────────────────────────────────────────────
    {
        collection: "comments",
        indexes: [
            {
                key: { video: 1, createdAt: -1 },
                name: "idx_comments_video",
                comment: "Comment listing per video, newest first",
            },
        ],
    },

    // ── Subscriptions ────────────────────────────────────────────────────
    {
        collection: "subscriptions",
        indexes: [
            {
                key: { subscriber: 1 },
                name: "idx_sub_subscriber",
                comment: "Subscription feed: channels a user follows",
            },
            {
                key: { channel: 1 },
                name: "idx_sub_channel",
                comment: "Subscriber count for a channel",
            },
            {
                key: { subscriber: 1, channel: 1 },
                name: "idx_sub_unique",
                options: { unique: true },
                comment: "Prevent duplicate subscriptions",
            },
        ],
    },

    // ── Transcripts ──────────────────────────────────────────────────────
    {
        collection: "transcripts",
        indexes: [
            {
                key: { video: 1 },
                name: "idx_transcript_video",
                options: { unique: true },
                comment: "1:1 transcript per video lookup",
            },
            {
                key: { fullText: "text" },
                name: "idx_transcript_fulltext",
                comment: "Full-text search across all transcripts",
            },
            {
                key: { status: 1 },
                name: "idx_transcript_status",
                comment: "Filter by transcription status (processing/completed/failed)",
            },
        ],
    },
];

async function createIndexes() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(`${process.env.MONGO_URL}/${DB_NAME}`);
        console.log("✅ Connected\n");

        const db = mongoose.connection.db;

        for (const { collection, indexes } of INDEXES) {
            console.log(`📦 Collection: ${collection}`);

            for (const idx of indexes) {
                try {
                    const opts = {
                        name: idx.name,
                        background: true, // non-blocking index build
                        ...(idx.options || {}),
                    };

                    await db.collection(collection).createIndex(idx.key, opts);
                    console.log(`   ✅ ${idx.name} — ${idx.comment}`);
                } catch (err) {
                    if (err.code === 85 || err.code === 86) {
                        // Index already exists with different options — drop and recreate
                        console.log(`   ⚠️  ${idx.name} exists with different config, recreating...`);
                        try {
                            await db.collection(collection).dropIndex(idx.name);
                            await db.collection(collection).createIndex(idx.key, {
                                name: idx.name,
                                background: true,
                                ...(idx.options || {}),
                            });
                            console.log(`   ✅ ${idx.name} — recreated`);
                        } catch (recreateErr) {
                            console.error(`   ❌ ${idx.name} — ${recreateErr.message}`);
                        }
                    } else {
                        console.error(`   ❌ ${idx.name} — ${err.message}`);
                    }
                }
            }
            console.log();
        }

        // Print summary of all indexes
        console.log("─".repeat(60));
        console.log("📊 Index Summary:");
        for (const { collection } of INDEXES) {
            const indexes = await db.collection(collection).indexes();
            console.log(`   ${collection}: ${indexes.length} indexes`);
        }

        console.log("\n✅ All indexes created successfully!");
    } catch (error) {
        console.error("❌ Failed to create indexes:", error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

createIndexes();
