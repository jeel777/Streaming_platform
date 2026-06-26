import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { Transcript } from "../models/transcript.model.js";
import {
    generateTranscript,
    searchTranscripts,
    deleteTranscript,
} from "../services/transcription.service.js";
import { generateTranscriptSummary } from "../services/gemini.service.js";
import mongoose from "mongoose";

// POST /api/v1/ai/transcripts/:videoId — generate transcript for a video
const transcribeVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { model = "base", language } = req.body;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // Only the video owner can trigger transcription
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(
            403,
            "You are not authorized to transcribe this video"
        );
    }

    // Validate model parameter
    const validModels = ["tiny", "base", "small", "medium", "large"];
    if (!validModels.includes(model)) {
        throw new ApiError(
            400,
            `Invalid model. Choose from: ${validModels.join(", ")}`
        );
    }

    try {
        const transcript = await generateTranscript(videoId, {
            model,
            language: language || null,
        });

        return res.status(201).json(
            new ApiResponse(
                201,
                {
                    videoId: video._id,
                    videoTitle: video.title,
                    transcript: {
                        id: transcript._id,
                        fullText: transcript.fullText,
                        segments: transcript.segments,
                        language: transcript.language,
                        duration: transcript.duration,
                        modelUsed: transcript.modelUsed,
                        status: transcript.status,
                    },
                },
                "Transcript generated successfully"
            )
        );
    } catch (error) {
        // Check for "already exists" error
        if (error.message.includes("already exists")) {
            throw new ApiError(409, error.message);
        }
        console.error("Transcription error:", error);
        throw new ApiError(
            500,
            `Failed to generate transcript: ${error.message}`
        );
    }
});

// GET /api/v1/ai/transcripts/:videoId — get transcript for a video
const getTranscript = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { format } = req.query; // "full" | "segments" | "srt"

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const transcript = await Transcript.findOne({ video: videoId });

    if (!transcript) {
        throw new ApiError(
            404,
            "No transcript found for this video. Generate one first."
        );
    }

    // Build response based on requested format
    let responseData;

    if (format === "srt") {
        // Generate SRT subtitle format
        const srtContent = transcript.segments
            .map((seg, index) => {
                const startTime = formatSRTTime(seg.start);
                const endTime = formatSRTTime(seg.end);
                return `${index + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
            })
            .join("\n");

        responseData = {
            videoId,
            format: "srt",
            content: srtContent,
        };
    } else if (format === "segments") {
        responseData = {
            videoId,
            format: "segments",
            segments: transcript.segments,
            language: transcript.language,
            duration: transcript.duration,
        };
    } else {
        // Default: full transcript data
        responseData = {
            videoId,
            format: "full",
            fullText: transcript.fullText,
            segments: transcript.segments,
            language: transcript.language,
            duration: transcript.duration,
            modelUsed: transcript.modelUsed,
            status: transcript.status,
            summary: transcript.summary,
            chapters: transcript.chapters,
            keyTopics: transcript.keyTopics,
            createdAt: transcript.createdAt,
        };
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, responseData, "Transcript fetched successfully")
        );
});

// DELETE /api/v1/ai/transcripts/:videoId — delete transcript
const removeTranscript = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // Only the video owner can delete the transcript
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(
            403,
            "You are not authorized to delete this transcript"
        );
    }

    try {
        await deleteTranscript(videoId);
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { videoId },
                    "Transcript deleted successfully"
                )
            );
    } catch (error) {
        throw new ApiError(404, error.message);
    }
});

// GET /api/v1/ai/transcripts/search?q=... — full-text search across all transcripts
const searchVideoTranscripts = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q?.trim()) {
        throw new ApiError(400, "Search query 'q' is required");
    }

    const results = await searchTranscripts(q.trim(), {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                results,
                results.results.length
                    ? `Found ${results.pagination.totalResults} results for "${q}"`
                    : `No results found for "${q}"`
            )
        );
});

// POST /api/v1/ai/transcripts/:videoId/summary — generate AI summary from transcript
const summarizeTranscript = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    // Check that GEMINI_API_KEY is configured
    if (!process.env.GEMINI_API_KEY) {
        throw new ApiError(
            500,
            "Gemini API key is not configured. Add GEMINI_API_KEY to your .env file."
        );
    }

    const transcript = await Transcript.findOne({ video: videoId });

    if (!transcript) {
        throw new ApiError(
            404,
            "No transcript found for this video. Generate a transcript first."
        );
    }

    if (transcript.status !== "completed") {
        throw new ApiError(
            400,
            `Transcript is in '${transcript.status}' state. Wait for it to complete.`
        );
    }

    const video = await Video.findById(videoId);

    try {
        const summaryResult = await generateTranscriptSummary(
            transcript.fullText,
            video?.title || "",
            transcript.duration
        );

        // Save the summary to the transcript
        transcript.summary = summaryResult.summary;
        transcript.keyTopics = summaryResult.keyTopics;
        transcript.chapters = summaryResult.chapters;
        await transcript.save();

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    {
                        videoId,
                        videoTitle: video?.title,
                        summary: summaryResult.summary,
                        keyTopics: summaryResult.keyTopics,
                        chapters: summaryResult.chapters,
                    },
                    "Transcript summary generated successfully"
                )
            );
    } catch (error) {
        console.error("Summary generation error:", error);
        throw new ApiError(
            500,
            `Failed to generate summary: ${error.message}`
        );
    }
});

/**
 * Convert seconds to SRT time format (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);

    return (
        String(hrs).padStart(2, "0") +
        ":" +
        String(mins).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0") +
        "," +
        String(ms).padStart(3, "0")
    );
}

export {
    transcribeVideo,
    getTranscript,
    removeTranscript,
    searchVideoTranscripts,
    summarizeTranscript,
};
