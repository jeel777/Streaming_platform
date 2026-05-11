// this is the router for user related routes, such as registering a user, logging in a user, etc.

import {Router} from "express";
import {registerUser} from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middleware.js"; // this is the multer middleware that we will use to handle file uploads for avatar and coverImage fields in the user registration route.


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



export default router;

