import mongoose, { Schema } from "mongoose";

const transcriptSchema = new Schema(
    {
        video: {
            type: Schema.Types.ObjectId,
            ref: "Video",
            required: true,
            unique: true, // one transcript per video
        },
        fullText: {
            type: String,
            required: true,
        },
        segments: [
            {
                start: { type: Number, required: true }, // seconds
                end: { type: Number, required: true },   // seconds
                text: { type: String, required: true },
            },
        ],
        language: {
            type: String,
            default: "unknown",
        },
        duration: {
            type: Number, // audio duration in seconds
            default: 0,
        },
        summary: {
            type: String, // AI-generated summary (filled later via Gemini)
            default: null,
        },
        chapters: [
            {
                timestamp: { type: Number },  // seconds
                title: { type: String },
            },
        ],
        keyTopics: [{ type: String }],
        status: {
            type: String,
            enum: ["processing", "completed", "failed"],
            default: "processing",
        },
        error: {
            type: String,
            default: null,
        },
        modelUsed: {
            type: String, // which Whisper model was used (e.g., "base")
            default: "base",
        },
    },
    {
        timestamps: true,
    }
);

// Text index on fullText for full-text search across all transcripts
transcriptSchema.index({ fullText: "text" });

// Index for status-based queries
transcriptSchema.index({ status: 1 });

export const Transcript = mongoose.model("Transcript", transcriptSchema);
