// this is the router for user related routes, such as registering a user, logging in a user, etc.

import {Router} from "express";
import {loginUser, registerUser,logoutUser} from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middleware.js"; // this is the multer middleware that we will use to handle file uploads for avatar and coverImage fields in the user registration route.
import { verifyJWT } from "../middlewares/auth.middleware.js"; 
import { refreshAcessToken } from "../controllers/user.controller.js";

const router=Router();

router.route("/register").post(
    upload.fields([ // this is the multer middleware 
    // that will handle file uploads for the avatar and 
    // coverImage fields in the user registration route. 
        {
            name:"avatar",
            maxCount:1
        },
        {
            name:"coverImage",
            maxCount:1
        }
    ]),
    
    registerUser)

router.route("/login").post(loginUser


)
                        // in verifyJWT i wrote next because after verifying the token, we want to pass control to the next middleware or route handler, which in this case is the logoutUser controller function. By calling next(), we allow the request to continue through the middleware stack and reach the logoutUser function where we can implement the logic for logging out the user.
router.route("/logout").post(verifyJWT ,logoutUser) // this is the route for logging out a user. It will be implemented in the logoutUser controller function.
router.route("/refresh-token").post(refreshAcessToken) // this is the route for refreshing the access token. It will be implemented in the refreshAcessToken controller function.
export default router;

