// this is the router for user related routes, such as registering a user, logging in a user, etc.

import {Router} from "express";
import {registerUser} from "../controllers/user.controller.js";


const router=Router();

router.route("/register").post(registerUser)


export default router;

