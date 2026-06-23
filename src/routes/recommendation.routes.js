import { Router } from "express";
import {
    getTrending,
    getForYou,
    getSimilar,
    getFeed,
} from "../controllers/recommendation.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes (no auth needed — cold-start friendly)
router.route("/trending").get(getTrending);
router.route("/similar/:videoId").get(getSimilar);

// Authenticated routes
router.route("/for-you").get(verifyJWT, getForYou);
router.route("/feed").get(verifyJWT, getFeed);

export default router;
