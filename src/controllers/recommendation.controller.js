import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";
import {
    getTrendingVideos,
    getPersonalizedFeed,
    getSimilarVideos,
    getSubscriptionFeed,
} from "../services/recommendation.service.js";

// GET /api/v1/recommendations/trending — top trending videos (public)
const getTrending = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;

    const result = await getTrendingVideos(page, limit);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                result,
                "Trending videos fetched successfully"
            )
        );
});

// GET /api/v1/recommendations/for-you — personalized recommendations (auth required)
const getForYou = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;

    const result = await getPersonalizedFeed(req.user._id, page, limit);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                result,
                "Personalized recommendations fetched successfully"
            )
        );
});

// GET /api/v1/recommendations/similar/:videoId — related/similar videos (public)
const getSimilar = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { limit = 10 } = req.query;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const result = await getSimilarVideos(videoId, limit);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                result,
                "Similar videos fetched successfully"
            )
        );
});

// GET /api/v1/recommendations/feed — subscription-based feed (auth required)
const getFeed = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;

    const result = await getSubscriptionFeed(req.user._id, page, limit);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                result,
                "Subscription feed fetched successfully"
            )
        );
});

export { getTrending, getForYou, getSimilar, getFeed };
