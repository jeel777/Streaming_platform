import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { generateThumbnailSuggestions } from "../services/thumbnail.service.js";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";

// helper to extract cloudinary public_id from url for deletion
const getCloudinaryPublicId = (url) => {
    if (!url) return null;
    return url
        .split("/upload/")[1]
        ?.replace(/^v\d+\//, "")
        ?.replace(/\.[^/.]+$/, "");
};

// POST /api/v1/ai/thumbnails/:videoId — generate AI thumbnail suggestions
const suggestThumbnails = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // only the video owner can request thumbnail suggestions
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to generate thumbnails for this video");
    }

    // Check that GEMINI_API_KEY is configured
    if (!process.env.GEMINI_API_KEY) {
        throw new ApiError(
            500,
            "Gemini API key is not configured. Add GEMINI_API_KEY to your .env file."
        );
    }

    try {
        const result = await generateThumbnailSuggestions(videoId);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    result,
                    "Thumbnail suggestions generated successfully"
                )
            );
    } catch (error) {
        console.error("Thumbnail suggestion error:", error);
        throw new ApiError(
            500,
            `Failed to generate thumbnail suggestions: ${error.message}`
        );
    }
});

// PATCH /api/v1/ai/thumbnails/:videoId — apply a suggested thumbnail
const applyThumbnail = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { thumbnailUrl } = req.body;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    if (!thumbnailUrl?.trim()) {
        throw new ApiError(400, "Thumbnail URL is required");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // only the video owner can apply a thumbnail
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this video");
    }

    // Delete the old thumbnail from Cloudinary
    const oldPublicId = getCloudinaryPublicId(video.thumbnail);
    if (oldPublicId) {
        try {
            await cloudinary.uploader.destroy(oldPublicId);
        } catch (error) {
            console.error("Failed to delete old thumbnail:", error);
        }
    }

    // Apply the new thumbnail
    video.thumbnail = thumbnailUrl;
    await video.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { videoId: video._id, thumbnail: video.thumbnail },
                "Thumbnail applied successfully"
            )
        );
});

// GET /api/v1/ai/thumbnails/:videoId — get existing suggestions for a video
const getThumbnailSuggestions = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId).select("thumbnailSuggestions title thumbnail");

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    videoId: video._id,
                    currentThumbnail: video.thumbnail,
                    suggestions: video.thumbnailSuggestions || [],
                },
                video.thumbnailSuggestions?.length
                    ? "Thumbnail suggestions fetched successfully"
                    : "No thumbnail suggestions found. Generate them first."
            )
        );
});

export { suggestThumbnails, applyThumbnail, getThumbnailSuggestions };
