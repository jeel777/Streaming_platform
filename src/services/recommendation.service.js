import mongoose from "mongoose";
import { Video } from "../models/video.model.js";
import { Like } from "../models/likes.js";
import { Subscription } from "../models/subscription.model.js";
import { User } from "../models/user.model.js";

/**
 * ── Strategy 1: Trending / Popular Videos ──────────────────────────
 *
 * Ranks published videos by a decay-weighted popularity score:
 *   score = (views × 1.0) + (likesCount × 3.0) + (commentsCount × 2.0) − (ageInDays × 0.5)
 *
 * Works without authentication (cold-start friendly).
 */
const getTrendingVideos = async (page = 1, limit = 10) => {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const pipeline = [
        { $match: { ispublished: true } },

        // Count likes for each video
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likeDocs",
            },
        },

        // Count comments for each video
        {
            $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "video",
                as: "commentDocs",
            },
        },

        // Owner details
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

        // Compute trending score
        {
            $addFields: {
                owner: { $first: "$owner" },
                likesCount: { $size: "$likeDocs" },
                commentsCount: { $size: "$commentDocs" },
                ageInDays: {
                    $divide: [
                        { $subtract: [new Date(), "$createdAt"] },
                        1000 * 60 * 60 * 24, // ms → days
                    ],
                },
            },
        },
        {
            $addFields: {
                trendingScore: {
                    $subtract: [
                        {
                            $add: [
                                { $multiply: ["$views", 1.0] },
                                { $multiply: ["$likesCount", 3.0] },
                                { $multiply: ["$commentsCount", 2.0] },
                            ],
                        },
                        { $multiply: ["$ageInDays", 0.5] },
                    ],
                },
            },
        },

        { $sort: { trendingScore: -1 } },

        // Clean up internal fields
        {
            $project: {
                likeDocs: 0,
                commentDocs: 0,
                ageInDays: 0,
            },
        },
    ];

    // Count total before pagination
    const countPipeline = [
        ...pipeline.slice(0, 1), // just the $match
        { $count: "total" },
    ];
    const countResult = await Video.aggregate(countPipeline);
    const totalDocs = countResult[0]?.total || 0;

    // Paginate
    pipeline.push({ $skip: skip }, { $limit: limitNum });

    const videos = await Video.aggregate(pipeline);

    return {
        videos,
        pagination: {
            page: pageNum,
            limit: limitNum,
            totalDocs,
            totalPages: Math.ceil(totalDocs / limitNum),
            hasNextPage: pageNum * limitNum < totalDocs,
        },
    };
};

/**
 * ── Strategy 2: Personalized Feed ──────────────────────────────────
 *
 * Uses the user's watch history and liked videos to recommend:
 *  1. Videos by creators the user has watched (but hasn't watched yet)
 *  2. Videos liked by users who share similar taste (liked same videos)
 *
 * Falls back to trending if the user has no history.
 */
const getPersonalizedFeed = async (userId, page = 1, limit = 10) => {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const user = await User.findById(userId).select("watchHistory").lean();
    const watchedIds = (user?.watchHistory || []).map((id) =>
        new mongoose.Types.ObjectId(id)
    );

    // Get videos the user has liked
    const userLikes = await Like.find({
        likeby: new mongoose.Types.ObjectId(userId),
        video: { $exists: true, $ne: null },
    })
        .select("video")
        .lean();
    const likedVideoIds = userLikes.map((l) => new mongoose.Types.ObjectId(l.video));

    // If no history at all, fall back to trending
    if (watchedIds.length === 0 && likedVideoIds.length === 0) {
        return getTrendingVideos(page, limit);
    }

    // ── Signal A: Videos by creators the user has watched ──
    // Find the owners of watched videos, then get their OTHER videos
    const watchedVideos = await Video.find({
        _id: { $in: watchedIds },
    })
        .select("owner")
        .lean();
    const watchedOwnerIds = [
        ...new Set(watchedVideos.map((v) => v.owner.toString())),
    ].map((id) => new mongoose.Types.ObjectId(id));

    // ── Signal B: Collaborative — users who liked same videos also liked… ──
    let collaborativeVideoIds = [];
    if (likedVideoIds.length > 0) {
        // Find other users who liked the same videos
        const similarUsers = await Like.aggregate([
            {
                $match: {
                    video: { $in: likedVideoIds },
                    likeby: { $ne: new mongoose.Types.ObjectId(userId) },
                },
            },
            { $group: { _id: "$likeby" } },
            { $limit: 50 }, // cap to avoid huge fan-out
        ]);

        const similarUserIds = similarUsers.map((u) => u._id);

        if (similarUserIds.length > 0) {
            // Find videos those similar users liked (that we haven't watched)
            const collabLikes = await Like.aggregate([
                {
                    $match: {
                        likeby: { $in: similarUserIds },
                        video: {
                            $exists: true,
                            $ne: null,
                            $nin: [...watchedIds, ...likedVideoIds],
                        },
                    },
                },
                {
                    $group: {
                        _id: "$video",
                        count: { $sum: 1 }, // how many similar users liked it
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 30 },
            ]);
            collaborativeVideoIds = collabLikes.map((c) => c._id);
        }
    }

    // Combine all candidate filters
    const excludeIds = [...watchedIds, ...likedVideoIds];

    const pipeline = [
        {
            $match: {
                ispublished: true,
                _id: { $nin: excludeIds },
                $or: [
                    { owner: { $in: watchedOwnerIds } }, // Signal A
                    { _id: { $in: collaborativeVideoIds } }, // Signal B
                ],
            },
        },

        // Boost collaborative matches with a score
        {
            $addFields: {
                isCollaborative: {
                    $cond: {
                        if: { $in: ["$_id", collaborativeVideoIds] },
                        then: 2,
                        else: 0,
                    },
                },
                isFromWatchedCreator: {
                    $cond: {
                        if: { $in: ["$owner", watchedOwnerIds] },
                        then: 1,
                        else: 0,
                    },
                },
            },
        },
        {
            $addFields: {
                relevanceScore: {
                    $add: ["$isCollaborative", "$isFromWatchedCreator", { $multiply: ["$views", 0.001] }],
                },
            },
        },
        { $sort: { relevanceScore: -1, createdAt: -1 } },

        // Owner details
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
        { $addFields: { owner: { $first: "$owner" } } },

        // Like count
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likeDocs",
            },
        },
        {
            $addFields: { likesCount: { $size: "$likeDocs" } },
        },
        {
            $project: {
                likeDocs: 0,
                isCollaborative: 0,
                isFromWatchedCreator: 0,
                relevanceScore: 0,
            },
        },
    ];

    // Count total
    const countPipeline = [...pipeline.slice(0, 1), { $count: "total" }];
    const countResult = await Video.aggregate(countPipeline);
    const totalDocs = countResult[0]?.total || 0;

    // Paginate
    const skip = (pageNum - 1) * limitNum;
    pipeline.push({ $skip: skip }, { $limit: limitNum });

    let videos = await Video.aggregate(pipeline);

    // If personalized results are sparse, pad with trending
    if (videos.length < limitNum) {
        const existingIds = videos.map((v) => v._id);
        const trending = await getTrendingVideos(1, limitNum - videos.length);
        const paddingVideos = trending.videos.filter(
            (tv) => !existingIds.some((id) => id.toString() === tv._id.toString()) &&
                     !excludeIds.some((id) => id.toString() === tv._id.toString())
        );
        videos = [...videos, ...paddingVideos.slice(0, limitNum - videos.length)];
    }

    return {
        videos,
        pagination: {
            page: pageNum,
            limit: limitNum,
            totalDocs: Math.max(totalDocs, videos.length),
            totalPages: Math.max(Math.ceil(totalDocs / limitNum), 1),
            hasNextPage: pageNum * limitNum < totalDocs,
        },
    };
};

/**
 * ── Strategy 3: Similar / Related Videos ───────────────────────────
 *
 * Given a video, find related videos by:
 *  1. Matching tags (highest weight)
 *  2. Same owner / creator
 *  3. Keyword overlap in title
 */
const getSimilarVideos = async (videoId, limit = 10) => {
    const limitNum = parseInt(limit, 10);

    const sourceVideo = await Video.findById(videoId)
        .select("title tags owner")
        .lean();

    if (!sourceVideo) {
        throw new Error("Video not found");
    }

    const sourceTags = sourceVideo.tags || [];
    const sourceOwnerId = sourceVideo.owner;

    // Extract significant keywords from title (3+ chars, skip common words)
    const stopWords = new Set([
        "the", "and", "for", "are", "but", "not", "you", "all",
        "can", "had", "her", "was", "one", "our", "out", "has",
        "how", "its", "let", "may", "who", "did", "get", "got",
        "him", "his", "she", "this", "that", "what", "with", "from",
    ]);
    const titleKeywords = sourceVideo.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stopWords.has(w))
        .slice(0, 5); // limit to 5 keywords

    // Build match conditions
    const orConditions = [];

    if (sourceTags.length > 0) {
        orConditions.push({ tags: { $in: sourceTags } });
    }

    orConditions.push({
        owner: new mongoose.Types.ObjectId(sourceOwnerId),
    });

    if (titleKeywords.length > 0) {
        const keywordRegex = titleKeywords.join("|");
        orConditions.push({
            title: { $regex: keywordRegex, $options: "i" },
        });
    }

    const pipeline = [
        {
            $match: {
                _id: { $ne: new mongoose.Types.ObjectId(videoId) },
                ispublished: true,
                $or: orConditions,
            },
        },

        // Compute similarity score
        {
            $addFields: {
                tagMatchCount: sourceTags.length > 0
                    ? {
                          $size: {
                              $ifNull: [
                                  {
                                      $setIntersection: [
                                          { $ifNull: ["$tags", []] },
                                          sourceTags,
                                      ],
                                  },
                                  [],
                              ],
                          },
                      }
                    : 0,
                isSameOwner: {
                    $cond: {
                        if: {
                            $eq: [
                                "$owner",
                                new mongoose.Types.ObjectId(sourceOwnerId),
                            ],
                        },
                        then: 1,
                        else: 0,
                    },
                },
            },
        },
        {
            $addFields: {
                similarityScore: {
                    $add: [
                        { $multiply: ["$tagMatchCount", 5] }, // tags weigh most
                        { $multiply: ["$isSameOwner", 2] },   // same creator bonus
                        { $multiply: ["$views", 0.001] },     // slight view boost
                    ],
                },
            },
        },
        { $sort: { similarityScore: -1, createdAt: -1 } },
        { $limit: limitNum },

        // Owner details
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
        { $addFields: { owner: { $first: "$owner" } } },

        // Like count
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likeDocs",
            },
        },
        {
            $addFields: { likesCount: { $size: "$likeDocs" } },
        },
        {
            $project: {
                likeDocs: 0,
                tagMatchCount: 0,
                isSameOwner: 0,
                similarityScore: 0,
            },
        },
    ];

    const videos = await Video.aggregate(pipeline);

    return { videos };
};

/**
 * ── Strategy 4: Subscription Feed ──────────────────────────────────
 *
 * Latest videos from channels the user is subscribed to,
 * sorted by most recent first.
 */
const getSubscriptionFeed = async (userId, page = 1, limit = 10) => {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get all channel IDs the user subscribes to
    const subscriptions = await Subscription.find({
        subscriber: new mongoose.Types.ObjectId(userId),
    })
        .select("channel")
        .lean();

    const channelIds = subscriptions.map((s) => s.channel);

    if (channelIds.length === 0) {
        return {
            videos: [],
            pagination: {
                page: pageNum,
                limit: limitNum,
                totalDocs: 0,
                totalPages: 0,
                hasNextPage: false,
            },
        };
    }

    const matchStage = {
        $match: {
            owner: { $in: channelIds },
            ispublished: true,
        },
    };

    // Count total
    const countResult = await Video.aggregate([
        matchStage,
        { $count: "total" },
    ]);
    const totalDocs = countResult[0]?.total || 0;

    const pipeline = [
        matchStage,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },

        // Owner details
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
        { $addFields: { owner: { $first: "$owner" } } },

        // Like count
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likeDocs",
            },
        },
        {
            $addFields: { likesCount: { $size: "$likeDocs" } },
        },
        {
            $project: { likeDocs: 0 },
        },
    ];

    const videos = await Video.aggregate(pipeline);

    return {
        videos,
        pagination: {
            page: pageNum,
            limit: limitNum,
            totalDocs,
            totalPages: Math.ceil(totalDocs / limitNum),
            hasNextPage: pageNum * limitNum < totalDocs,
        },
    };
};

export {
    getTrendingVideos,
    getPersonalizedFeed,
    getSimilarVideos,
    getSubscriptionFeed,
};
