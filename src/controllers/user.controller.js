// this is the controller for user related operations, such as registering a user, logging in a user, etc.


import {asyncHandler} from "../utils/asyncHandler.js";

const registerUser=asyncHandler(async(req,res)=>{
    res.status(200).json({
        message:"OK"
    })
})

export {registerUser}