import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Like } from "../models/likes.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.js";
import { Tweet } from "../models/tweet.js";
import mongoose from "mongoose";

// POST /api/v1/likes/toggle/v/:videoId — toggle like on a video
const toggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // check if already liked
    const existingLike = await Like.findOne({
        video: videoId,
        likeby: req.user._id,
    });

    if (existingLike) {
        // unlike
        await Like.findByIdAndDelete(existingLike._id);
        return res
            .status(200)
            .json(new ApiResponse(200, { isLiked: false }, "Video unliked successfully"));
    }

    // like
    await Like.create({
        video: videoId,
        likeby: req.user._id,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, { isLiked: true }, "Video liked successfully"));
});

// POST /api/v1/likes/toggle/c/:commentId — toggle like on a comment
const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    if (!mongoose.isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID");
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    const existingLike = await Like.findOne({
        comment: commentId,
        likeby: req.user._id,
    });

    if (existingLike) {
        await Like.findByIdAndDelete(existingLike._id);
        return res
            .status(200)
            .json(new ApiResponse(200, { isLiked: false }, "Comment unliked successfully"));
    }

    await Like.create({
        comment: commentId,
        likeby: req.user._id,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, { isLiked: true }, "Comment liked successfully"));
});

// POST /api/v1/likes/toggle/t/:tweetId — toggle like on a tweet
const toggleTweetLike = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;

    if (!mongoose.isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID");
    }

    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    const existingLike = await Like.findOne({
        tweet: tweetId,
        likeby: req.user._id,
    });

    if (existingLike) {
        await Like.findByIdAndDelete(existingLike._id);
        return res
            .status(200)
            .json(new ApiResponse(200, { isLiked: false }, "Tweet unliked successfully"));
    }

    await Like.create({
        tweet: tweetId,
        likeby: req.user._id,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, { isLiked: true }, "Tweet liked successfully"));
});

// GET /api/v1/likes/videos — get all videos liked by current user
const getLikedVideos = asyncHandler(async (req, res) => {
    const likedVideos = await Like.aggregate([
        {
            $match: {
                likeby: new mongoose.Types.ObjectId(req.user._id),   // we are starting from like collection bec it has video and who liked it 
                video: { $exists: true, $ne: null },                 // we will find userA from there make video true bec we have comment and tweet also 
            },
        },
        {
            $sort: { createdAt: -1 },  // to get recent like video at first
        },
        {
            $lookup: {               // now we have videoId but we have to display video details like owner , video thumbnail , title etc..
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "video",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {            // getting infor which is required
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1,
                                    },
                                },
                            ],
                        },
                    },
                    {
                        $addFields: {       // $addFields to take out the first element from the owner array 
                            owner: { $first: "$owner" },  // because lookup always returns an array and we only have one owner for each video
                        },        // example is like owner: [ { _id: "68b...", fullname: "Jeel", username: "jeel05", avatar: "..." } ]
                        //  after this pipeline it will be owner: { _id: "68b...", fullname: "Jeel", username: "jeel05", avatar: "..." }
                    },
                ],
            },
        },
        {
            $addFields: {       // this is also to take out the first element from the video array 
                video: { $first: "$video" },
            },
        },
        {
            $project: {    // this is to exclude the _id field from the video because we don't want to display _id in the response
                video: 1,
                _id: 0,
            },
        },
        { // this is to replace the root element with the video object 
            
            $replaceRoot: { newRoot: "$video" },
        },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                likedVideos,
                "Liked videos fetched successfully"
            )
        );
});

export { toggleVideoLike, toggleCommentLike, toggleTweetLike, getLikedVideos };
