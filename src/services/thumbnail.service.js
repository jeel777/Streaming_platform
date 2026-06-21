import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { v2 as cloudinary } from "cloudinary";
import { Video } from "../models/video.model.js";
import { analyzeThumbnailCandidates } from "./gemini.service.js";

// Point fluent-ffmpeg at the bundled binary so users don't need a system install
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Temp directory for downloaded videos and extracted frames
const TEMP_DIR = "./public/temp";

/**
 * Download a file from a URL and save it locally.
 * Works with both http and https URLs.
 */
const downloadFile = (url, destPath) => {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith("https") ? https : http;
        const file = fs.createWriteStream(destPath);

        proto
            .get(url, (response) => {
                // handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return reject(new Error(`Download failed with status ${response.statusCode}`));
                }

                response.pipe(file);
                file.on("finish", () => {
                    file.close(resolve);
                });
            })
            .on("error", (err) => {
                file.close();
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                reject(err);
            });
    });
};

/**
 * Extract evenly-spaced frames from a video file using ffmpeg.
 *
 * @param {string} videoPath - Local path to the video file
 * @param {number} duration - Video duration in seconds
 * @param {number} numFrames - Number of frames to extract (default 8)
 * @returns {Promise<Array<{path: string, timestamp: number}>>} Extracted frame info
 */
const extractFrames = (videoPath, duration, numFrames = 8) => {
    return new Promise((resolve, reject) => {
        const frameDir = path.join(TEMP_DIR, `frames_${Date.now()}`);
        fs.mkdirSync(frameDir, { recursive: true });

        // Calculate timestamps to extract (evenly spaced, skipping first/last 5%)
        const startOffset = duration * 0.05;
        const endOffset = duration * 0.95;
        const interval = (endOffset - startOffset) / (numFrames - 1);

        const timestamps = [];
        for (let i = 0; i < numFrames; i++) {
            timestamps.push(startOffset + i * interval);
        }

        let extractedCount = 0;
        const frameInfos = [];

        // Extract each frame individually at specific timestamps
        const extractNext = (index) => {
            if (index >= timestamps.length) {
                return resolve(frameInfos);
            }

            const ts = timestamps[index];
            const outputPath = path.join(frameDir, `frame_${String(index).padStart(2, "0")}.jpg`);

            ffmpeg(videoPath)
                .seekInput(ts)
                .frames(1)
                .outputOptions(["-q:v", "2"]) // high quality JPEG
                .output(outputPath)
                .on("end", () => {
                    frameInfos.push({
                        path: outputPath,
                        timestamp: Math.round(ts * 10) / 10, // round to 1 decimal
                    });
                    extractedCount++;
                    extractNext(index + 1);
                })
                .on("error", (err) => {
                    console.error(`Frame extraction error at ${ts}s:`, err.message);
                    // Continue with next frame even if one fails
                    extractNext(index + 1);
                })
                .run();
        };

        extractNext(0);
    });
};

/**
 * Upload a frame image to Cloudinary in an organized folder.
 *
 * @param {string} framePath - Local path to the frame image
 * @param {string} videoId - The video ID for folder organization
 * @returns {Promise<string>} The Cloudinary URL of the uploaded frame
 */
const uploadFrameToCloudinary = async (framePath, videoId) => {
    try {
        const result = await cloudinary.uploader.upload(framePath, {
            resource_type: "image",
            folder: `streaming_platform/thumbnails/${videoId}`,
            quality: "auto:good",
        });
        return result.secure_url || result.url;
    } catch (error) {
        console.error("Frame upload to Cloudinary failed:", error);
        throw error;
    }
};

/**
 * Clean up temporary files (downloaded video + extracted frames).
 */
const cleanupTempFiles = (filePaths) => {
    for (const filePath of filePaths) {
        try {
            if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            }
        } catch (error) {
            console.error(`Cleanup error for ${filePath}:`, error.message);
        }
    }
};

/**
 * Main pipeline: generate thumbnail suggestions for a video.
 *
 * 1. Fetch video from DB
 * 2. Download video from Cloudinary
 * 3. Extract key frames with ffmpeg
 * 4. Upload frames to Cloudinary
 * 5. Send frames to Gemini for AI analysis
 * 6. Return top 3 suggestions with URLs, scores, and analysis
 *
 * @param {string} videoId - MongoDB ObjectId of the video
 * @returns {Promise<Object>} The suggestions and video info
 */
const generateThumbnailSuggestions = async (videoId) => {
    const video = await Video.findById(videoId);

    if (!video) {
        throw new Error("Video not found");
    }

    if (!video.videoFile) {
        throw new Error("Video file URL not found");
    }

    // Paths for cleanup later
    const tempFiles = [];
    const tempVideoPath = path.join(TEMP_DIR, `video_${videoId}_${Date.now()}.mp4`);

    try {
        // Step 1: Download video from Cloudinary
        console.log(`[Thumbnail Agent] Downloading video ${videoId}...`);
        await downloadFile(video.videoFile, tempVideoPath);
        tempFiles.push(tempVideoPath);

        // Step 2: Get video duration (use stored duration or probe)
        const duration = video.duration || 60; // fallback to 60s if not stored

        // Determine number of frames based on video length
        const numFrames = duration < 30 ? 5 : duration < 120 ? 8 : 10;

        // Step 3: Extract frames
        console.log(`[Thumbnail Agent] Extracting ${numFrames} frames...`);
        const frameInfos = await extractFrames(tempVideoPath, duration, numFrames);

        if (frameInfos.length === 0) {
            throw new Error("No frames could be extracted from the video");
        }

        // Collect frame directory for cleanup
        if (frameInfos.length > 0) {
            tempFiles.push(path.dirname(frameInfos[0].path));
        }

        // Step 4: Read frame buffers for Gemini + upload to Cloudinary in parallel
        console.log(`[Thumbnail Agent] Uploading ${frameInfos.length} frames to Cloudinary & preparing for AI analysis...`);

        const frames = [];
        const cloudinaryUrls = [];

        for (const frameInfo of frameInfos) {
            const buffer = fs.readFileSync(frameInfo.path);
            frames.push({
                buffer,
                mimeType: "image/jpeg",
                timestamp: frameInfo.timestamp,
            });

            // Upload to Cloudinary
            const url = await uploadFrameToCloudinary(frameInfo.path, videoId);
            cloudinaryUrls.push(url);
        }

        // Step 5: Send to Gemini for AI analysis
        console.log(`[Thumbnail Agent] Analyzing frames with Gemini AI...`);
        const aiSuggestions = await analyzeThumbnailCandidates(
            frames,
            video.title,
            video.description
        );

        // Step 6: Build final suggestions with Cloudinary URLs
        const suggestions = aiSuggestions.map((suggestion, rank) => ({
            rank: rank + 1,
            frameUrl: cloudinaryUrls[suggestion.frameIndex] || "",
            score: suggestion.score,
            timestamp: suggestion.timestamp,
            analysis: suggestion.analysis,
            suggestedText: suggestion.suggestedText,
        }));

        // Step 7: Save suggestions to the video document
        video.thumbnailSuggestions = suggestions.map((s) => ({
            frameUrl: s.frameUrl,
            score: s.score,
            analysis: s.analysis,
            suggestedText: s.suggestedText,
            timestamp: s.timestamp,
        }));
        await video.save({ validateBeforeSave: false });

        console.log(`[Thumbnail Agent] ✅ Generated ${suggestions.length} thumbnail suggestions for video ${videoId}`);

        return {
            videoId: video._id,
            videoTitle: video.title,
            suggestions,
        };
    } finally {
        // Always clean up temp files
        cleanupTempFiles(tempFiles);
    }
};

export { generateThumbnailSuggestions };
