import { Router } from "express";
import {
    suggestThumbnails,
    applyThumbnail,
    getThumbnailSuggestions,
} from "../controllers/thumbnail.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// all AI routes require authentication
router.use(verifyJWT);

// Generate AI thumbnail suggestions for a video
router.route("/thumbnails/:videoId")
    .get(getThumbnailSuggestions)  // get existing suggestions
    .post(suggestThumbnails)       // generate new suggestions
    .patch(applyThumbnail);        // apply a suggested thumbnail

export default router;
