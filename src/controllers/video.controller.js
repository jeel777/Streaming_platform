import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { Like } from "../models/likes.js";
import { Comment } from "../models/comment.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
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

// GET /api/v1/videos — get all videos with search, sort, pagination
const getAllVideos = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        query,
        sortBy = "createdAt",
        sortType = "desc",
        userId,
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const pipeline = [];

    // filter by published videos only (unless owner is requesting their own)
    if (userId && req.user?._id.toString() === userId) {
        // owner can see their own unpublished videos
        pipeline.push({
            $match: { owner: new mongoose.Types.ObjectId(userId) },
        });
    } else if (userId) {
        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId),
                ispublished: true,
            },
        });
    } else {
        pipeline.push({ $match: { ispublished: true } });
    }

    // search by title or description
    if (query) {
        pipeline.push({
            $match: {
                $or: [
                    { title: { $regex: query, $options: "i" } },
                    { description: { $regex: query, $options: "i" } },
                ],
            },
        });
    }

    // sort
    const sortOrder = sortType === "asc" ? 1 : -1;
    pipeline.push({ $sort: { [sortBy]: sortOrder } });

    // lookup owner details
    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            fullname: 1,
                            username: 1,
                            avatar: 1,
                        },
                    },
                ],
            },
        },
        {
            $addFields: {
                owner: { $first: "$owner" },
            },
        }
    );

    const options = {
        page: pageNum,
        limit: limitNum,
    };

    const result = await Video.aggregatePaginate(
        Video.aggregate(pipeline),
        options
    );

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Videos fetched successfully"));
});

// POST /api/v1/videos — upload a new video
const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description, tags } = req.body;

    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400, "Title and description are required");
    }

    // Parse tags — accept JSON array or comma-separated string
    let parsedTags = [];
    if (tags) {
        if (Array.isArray(tags)) {
            parsedTags = tags.map((t) => t.trim()).filter(Boolean);
        } else if (typeof tags === "string") {
            parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
        }
    }

    const videoLocalPath = req.files?.videoFile?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!videoLocalPath) {
        throw new ApiError(400, "Video file is required");
    }
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail image is required");
    }

    // upload to cloudinary
    const videoFile = await uploadOnCloudinary(videoLocalPath);
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!videoFile) {
        throw new ApiError(500, "Failed to upload video file");
    }
    if (!thumbnail) {
        throw new ApiError(500, "Failed to upload thumbnail");
    }

    const video = await Video.create({
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        title,
        description,
        duration: videoFile.duration || 0,
        owner: req.user._id,
        tags: parsedTags,
    });

    const createdVideo = await Video.findById(video._id);

    if (!createdVideo) {
        throw new ApiError(500, "Failed to create video");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, createdVideo, "Video published successfully"));
});

// GET /api/v1/videos/:videoId — get a video by ID
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    // increment view count
    const video = await Video.findByIdAndUpdate(
        videoId,
        { $inc: { views: 1 } },
        { new: true }
    );

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // check if video is unpublished and requester is not the owner
    if (
        !video.ispublished &&
        video.owner.toString() !== req.user._id.toString()
    ) {
        throw new ApiError(404, "Video not found");
    }

    // add video to user's watch history
    await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { watchHistory: videoId },
    });

    // get video with owner details using aggregation
    const videoDetails = await Video.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(videoId) } },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            fullname: 1,
                            username: 1,
                            avatar: 1,
                        },
                    },
                ],
            },
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes",
            },
        },
        {
            $addFields: {
                owner: { $first: "$owner" },
                likesCount: { $size: "$likes" },
                isLiked: {
                    $cond: {
                        if: {
                            $in: [req.user._id, "$likes.likeby"],
                        },
                        then: true,
                        else: false,
                    },
                },
            },
        },
        {
            $project: {
                likes: 0, // exclude the raw likes array
            },
        },
    ]);

    if (!videoDetails?.length) {
        throw new ApiError(404, "Video not found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, videoDetails[0], "Video fetched successfully")
        );
});

// PATCH /api/v1/videos/:videoId — update video details
const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { title, description, tags } = req.body;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // only owner can update
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this video");
    }

    const updateData = {};
    if (title?.trim()) updateData.title = title;

    // Parse tags — accept JSON array or comma-separated string
    if (tags !== undefined) {
        if (Array.isArray(tags)) {
            updateData.tags = tags.map((t) => t.trim()).filter(Boolean);
        } else if (typeof tags === "string") {
            updateData.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
        }
    }
    if (description?.trim()) updateData.description = description;

    // handle thumbnail update
    const thumbnailLocalPath = req.file?.path;
    if (thumbnailLocalPath) {
        const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
        if (!thumbnail) {
            throw new ApiError(500, "Failed to upload thumbnail");
        }

        // delete old thumbnail from cloudinary
        const oldPublicId = getCloudinaryPublicId(video.thumbnail);
        if (oldPublicId) {
            try {
                await cloudinary.uploader.destroy(oldPublicId);
            } catch (error) {
                console.error("Failed to delete old thumbnail:", error);
            }
        }

        updateData.thumbnail = thumbnail.url;
    }

    if (Object.keys(updateData).length === 0) {
        throw new ApiError(400, "At least one field is required to update");
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        { $set: updateData },
        { new: true }
    );

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedVideo, "Video updated successfully")
        );
});

// DELETE /api/v1/videos/:videoId — delete a video
const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // only owner can delete
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this video");
    }

    // delete video and thumbnail from cloudinary
    const videoPublicId = getCloudinaryPublicId(video.videoFile);
    const thumbnailPublicId = getCloudinaryPublicId(video.thumbnail);

    if (videoPublicId) {
        try {
            await cloudinary.uploader.destroy(videoPublicId, {
                resource_type: "video",
            });
        } catch (error) {
            console.error("Failed to delete video from cloudinary:", error);
        }
    }
    if (thumbnailPublicId) {
        try {
            await cloudinary.uploader.destroy(thumbnailPublicId);
        } catch (error) {
            console.error("Failed to delete thumbnail from cloudinary:", error);
        }
    }

    // delete all comments and likes associated with the video
    await Comment.deleteMany({ video: videoId });
    await Like.deleteMany({ video: videoId });

    // remove from users' watch history
    await User.updateMany(
        { watchHistory: videoId },
        { $pull: { watchHistory: videoId } }
    );

    await Video.findByIdAndDelete(videoId);

    return res
        .status(200)
        .json(new ApiResponse(200, null, "Video deleted successfully"));
});

// PATCH /api/v1/videos/toggle/publish/:videoId — toggle video publish status
const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // only owner can toggle
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(
            403,
            "You are not authorized to toggle publish status"
        );
    }

    video.ispublished = !video.ispublished;
    await video.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { ispublished: video.ispublished },
                `Video ${video.ispublished ? "published" : "unpublished"} successfully`
            )
        );
});

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus,
};
