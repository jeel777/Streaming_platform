import { Router } from "express";
import {
    transcribeVideo,
    getTranscript,
    removeTranscript,
    searchVideoTranscripts,
    summarizeTranscript,
} from "../controllers/transcription.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// All transcription routes require authentication
router.use(verifyJWT);

// Search across all video transcripts (must be BEFORE /:videoId to avoid conflicts)
router.route("/search").get(searchVideoTranscripts);

// CRUD operations on a specific video's transcript
router
    .route("/:videoId")
    .get(getTranscript)       // get transcript
    .post(transcribeVideo)    // generate transcript
    .delete(removeTranscript); // delete transcript

// Generate AI summary from existing transcript
router.route("/:videoId/summary").post(summarizeTranscript);

export default router;
