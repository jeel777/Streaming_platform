// this is the router for user related routes, such as registering a user, logging in a user, etc.

import {Router} from "express";
import {loginUser, 
    registerUser,
    logoutUser,
    changeCurrentUserPassword,
    getCurrentUser,
    updateCurrentUserDetails,  
    updateUserAvatar,updateUserCoverImage,
    getUserChannelProfile,
    getwatchHostory
} from "../controllers/user.controller.js";
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

router.route("/login").post(loginUser)
                        // in verifyJWT i wrote next because after verifying the token, we want to pass control to the next middleware or route handler, which in this case is the logoutUser controller function. By calling next(), we allow the request to continue through the middleware stack and reach the logoutUser function where we can implement the logic for logging out the user.
router.route("/logout").post(verifyJWT ,logoutUser) // this is the route for logging out a user. It will be implemented in the logoutUser controller function.
router.route("/refresh-token").post(refreshAcessToken) // this is the route for refreshing the access token. It will be implemented in the refreshAcessToken controller function.

router.route("/change-password").post(verifyJWT, changeCurrentUserPassword) // this is the route for changing the current user's password. It will be implemented in the changeCurrentUserPassword controller function.
router.route("/getCurrentUser").get(verifyJWT,getCurrentUser)

router.route("/update-current-user-details").patch(verifyJWT,updateCurrentUserDetails) // this is the route for updating the current user's details. It will be implemented in the getCurrentUser controller function, where we will first get the current user's details and then update them based on the request body.
router.route("/update-avatar").patch(verifyJWT,upload.single("avatar"),updateUserAvatar)

router.route("/update-cover-image").patch(verifyJWT,upload.single("coverImage"),updateUserCoverImage)
router.route("/c/:get-channel-profile").get(verifyJWT,getUserChannelProfile) // why /c/: ? because we want to get the channel profile of a user, and we can use the username as a parameter in the route. So the route will be /c/:username, where :username is the username of the user whose channel profile we want to get. This is a common convention used by many platforms, such as YouTube, where they use /c/ for channel profiles.

router.route("/watch-history").get(verifyJWT,getwatchHostory)


export default router;

