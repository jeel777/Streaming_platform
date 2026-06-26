import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { Video } from "../models/video.model.js";
import { Transcript } from "../models/transcript.model.js";

// Point fluent-ffmpeg at the bundled binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Resolve paths relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Temp directory for downloaded videos and extracted audio
const TEMP_DIR = "./public/temp";

// Path to the Python venv and transcription script
const VENV_PYTHON = path.join(PROJECT_ROOT, ".venv", "bin", "python3");
const TRANSCRIBE_SCRIPT = path.join(PROJECT_ROOT, "scripts", "transcribe.py");

/**
 * Download a file from a URL and save it locally.
 * Works with both http and https URLs (follows redirects).
 */
const downloadFile = (url, destPath) => {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith("https") ? https : http;
        const file = fs.createWriteStream(destPath);

        proto
            .get(url, (response) => {
                // handle redirects
                if (
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location
                ) {
                    file.close();
                    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                    return downloadFile(response.headers.location, destPath)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                    return reject(
                        new Error(
                            `Download failed with status ${response.statusCode}`
                        )
                    );
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
 * Extract audio from a video file as MP3 using ffmpeg.
 *
 * @param {string} videoPath - Local path to the video file
 * @returns {Promise<string>} Path to the extracted audio file
 */
const extractAudio = (videoPath) => {
    return new Promise((resolve, reject) => {
        const audioPath = videoPath.replace(/\.[^/.]+$/, "") + "_audio.mp3";

        ffmpeg(videoPath)
            .noVideo()
            .audioCodec("libmp3lame")
            .audioFrequency(16000) // 16kHz — optimal for Whisper
            .audioChannels(1) // mono — Whisper works best with mono
            .outputOptions(["-q:a", "5"]) // reasonable quality, small file
            .output(audioPath)
            .on("end", () => {
                console.log(
                    `[Transcription Agent] Audio extracted: ${audioPath}`
                );
                resolve(audioPath);
            })
            .on("error", (err) => {
                console.error("[Transcription Agent] Audio extraction error:", err.message);
                reject(
                    new Error(`Audio extraction failed: ${err.message}`)
                );
            })
            .run();
    });
};

/**
 * Run the local Whisper transcription via the Python script.
 *
 * Spawns the Python process from the project's virtual environment
 * and parses the JSON output from stdout.
 *
 * @param {string} audioPath - Local path to the audio file
 * @param {string} model - Whisper model name (tiny, base, small, medium, large)
 * @param {string|null} language - Language code (e.g., 'en') or null for auto-detect
 * @returns {Promise<Object>} Parsed transcript { text, segments, language, duration }
 */
const runWhisper = (audioPath, model = "base", language = null) => {
    return new Promise((resolve, reject) => {
        // Check that the venv Python exists
        if (!fs.existsSync(VENV_PYTHON)) {
            return reject(
                new Error(
                    `Python venv not found at ${VENV_PYTHON}. ` +
                    `Run: python3 -m venv .venv && source .venv/bin/activate && pip install openai-whisper`
                )
            );
        }

        const args = [TRANSCRIBE_SCRIPT, audioPath, "--model", model];
        if (language) {
            args.push("--language", language);
        }

        console.log(
            `[Transcription Agent] Running Whisper (model: ${model})...`
        );

        const childProcess = spawn(VENV_PYTHON, args, {
            cwd: PROJECT_ROOT,
            env: { ...process.env }, // inherit environment
        });

        let stdout = "";
        let stderr = "";

        childProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        childProcess.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        childProcess.on("close", (code) => {
            if (code !== 0) {
                console.error("[Transcription Agent] Whisper stderr:", stderr);
                return reject(
                    new Error(
                        `Whisper process exited with code ${code}: ${stderr || "Unknown error"}`
                    )
                );
            }

            try {
                const result = JSON.parse(stdout);
                if (result.error) {
                    return reject(new Error(result.error));
                }
                console.log(
                    `[Transcription Agent] Whisper completed — ${result.segments?.length || 0} segments, ` +
                    `language: ${result.language}, duration: ${result.duration}s`
                );
                resolve(result);
            } catch (parseError) {
                console.error("[Transcription Agent] Failed to parse Whisper output:", stdout);
                reject(new Error(`Failed to parse Whisper output: ${parseError.message}`));
            }
        });

        childProcess.on("error", (err) => {
            reject(new Error(`Failed to start Whisper process: ${err.message}`));
        });
    });
};

/**
 * Clean up temporary files (downloaded video + extracted audio).
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
            console.error(`[Transcription Agent] Cleanup error for ${filePath}:`, error.message);
        }
    }
};

/**
 * Main pipeline: generate a transcript for a video.
 *
 * 1. Fetch video from DB
 * 2. Download video from Cloudinary
 * 3. Extract audio with ffmpeg (MP3, 16kHz mono)
 * 4. Run local Whisper transcription
 * 5. Store transcript in MongoDB
 * 6. Update video's hasTranscript flag
 * 7. Return the transcript
 *
 * @param {string} videoId - MongoDB ObjectId of the video
 * @param {Object} options - Optional config
 * @param {string} options.model - Whisper model (default: "base")
 * @param {string|null} options.language - Language code or null for auto-detect
 * @returns {Promise<Object>} The transcript document
 */
const generateTranscript = async (videoId, options = {}) => {
    const { model = "base", language = null } = options;

    const video = await Video.findById(videoId);
    if (!video) {
        throw new Error("Video not found");
    }

    if (!video.videoFile) {
        throw new Error("Video file URL not found");
    }

    // Check max duration limit (default: 120 minutes)
    const maxDuration =
        parseInt(process.env.MAX_TRANSCRIPTION_DURATION_MINUTES || "120", 10) * 60;
    if (video.duration && video.duration > maxDuration) {
        throw new Error(
            `Video is too long for transcription (${Math.round(video.duration / 60)} min). ` +
            `Maximum allowed: ${maxDuration / 60} minutes.`
        );
    }

    // Check if transcript already exists
    const existingTranscript = await Transcript.findOne({ video: videoId });
    if (existingTranscript && existingTranscript.status === "completed") {
        throw new Error(
            "Transcript already exists for this video. Delete it first to regenerate."
        );
    }

    // Create or update a transcript document with "processing" status
    let transcript;
    if (existingTranscript) {
        existingTranscript.status = "processing";
        existingTranscript.error = null;
        await existingTranscript.save();
        transcript = existingTranscript;
    } else {
        transcript = await Transcript.create({
            video: videoId,
            fullText: "",
            segments: [],
            status: "processing",
            modelUsed: model,
        });
    }

    // Paths for cleanup later
    const tempFiles = [];
    const tempVideoPath = path.join(
        TEMP_DIR,
        `video_${videoId}_${Date.now()}.mp4`
    );

    try {
        // Ensure temp directory exists
        fs.mkdirSync(TEMP_DIR, { recursive: true });

        // Step 1: Download video from Cloudinary
        console.log(
            `[Transcription Agent] Downloading video ${videoId}...`
        );
        await downloadFile(video.videoFile, tempVideoPath);
        tempFiles.push(tempVideoPath);

        // Step 2: Extract audio
        console.log(`[Transcription Agent] Extracting audio...`);
        const audioPath = await extractAudio(tempVideoPath);
        tempFiles.push(audioPath);

        // Step 3: Transcribe with local Whisper
        const whisperResult = await runWhisper(audioPath, model, language);

        // Step 4: Update transcript document
        transcript.fullText = whisperResult.text;
        transcript.segments = whisperResult.segments;
        transcript.language = whisperResult.language;
        transcript.duration = whisperResult.duration;
        transcript.status = "completed";
        transcript.modelUsed = model;
        transcript.error = null;
        await transcript.save();

        // Step 5: Update video's hasTranscript flag
        video.hasTranscript = true;
        await video.save({ validateBeforeSave: false });

        console.log(
            `[Transcription Agent] ✅ Transcript generated for video ${videoId} — ` +
            `${whisperResult.segments.length} segments, ${whisperResult.duration}s`
        );

        return transcript;
    } catch (error) {
        // Mark transcript as failed
        transcript.status = "failed";
        transcript.error = error.message;
        await transcript.save();

        throw error;
    } finally {
        // Always clean up temp files
        cleanupTempFiles(tempFiles);
    }
};

/**
 * Search across all video transcripts using MongoDB full-text search.
 *
 * @param {string} query - Search query string
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Results per page (default: 10)
 * @returns {Promise<Object>} Search results with video details
 */
const searchTranscripts = async (query, options = {}) => {
    const { page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    const results = await Transcript.aggregate([
        // Full-text search
        {
            $match: {
                $text: { $search: query },
                status: "completed",
            },
        },
        // Add text match score
        {
            $addFields: {
                searchScore: { $meta: "textScore" },
            },
        },
        // Sort by relevance
        { $sort: { searchScore: -1 } },
        // Lookup video details
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "videoDetails",
                pipeline: [
                    {
                        $match: { ispublished: true },
                    },
                    {
                        $project: {
                            title: 1,
                            thumbnail: 1,
                            duration: 1,
                            views: 1,
                            owner: 1,
                        },
                    },
                ],
            },
        },
        // Flatten videoDetails
        {
            $addFields: {
                videoDetails: { $first: "$videoDetails" },
            },
        },
        // Only include results where the video exists and is published
        {
            $match: {
                videoDetails: { $ne: null },
            },
        },
        // Lookup owner details
        {
            $lookup: {
                from: "users",
                localField: "videoDetails.owner",
                foreignField: "_id",
                as: "ownerDetails",
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
                "videoDetails.owner": { $first: "$ownerDetails" },
            },
        },
        // Find matching segments (segments containing the search query)
        {
            $addFields: {
                matchingSegments: {
                    $filter: {
                        input: "$segments",
                        as: "seg",
                        cond: {
                            $regexMatch: {
                                input: "$$seg.text",
                                regex: query,
                                options: "i",
                            },
                        },
                    },
                },
            },
        },
        // Project final shape
        {
            $project: {
                video: "$videoDetails",
                language: 1,
                searchScore: 1,
                matchingSegments: { $slice: ["$matchingSegments", 3] }, // top 3 matching segments
                transcriptPreview: {
                    $substrCP: ["$fullText", 0, 200], // first 200 chars preview
                },
            },
        },
        // Paginate
        {
            $facet: {
                results: [{ $skip: skip }, { $limit: limit }],
                totalCount: [{ $count: "count" }],
            },
        },
    ]);

    const searchResults = results[0]?.results || [];
    const totalCount = results[0]?.totalCount[0]?.count || 0;

    return {
        results: searchResults,
        pagination: {
            page,
            limit,
            totalResults: totalCount,
            totalPages: Math.ceil(totalCount / limit),
        },
    };
};

/**
 * Delete a transcript and reset the video's hasTranscript flag.
 *
 * @param {string} videoId - MongoDB ObjectId of the video
 */
const deleteTranscript = async (videoId) => {
    const transcript = await Transcript.findOneAndDelete({ video: videoId });

    if (!transcript) {
        throw new Error("No transcript found for this video");
    }

    // Reset the video's flag
    await Video.findByIdAndUpdate(videoId, {
        $set: { hasTranscript: false },
    });

    return transcript;
};

export { generateTranscript, searchTranscripts, deleteTranscript };
