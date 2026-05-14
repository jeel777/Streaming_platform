import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { ApiResponse } from "../utils/ApiResponse.js";

export const verifyJWT=asyncHandler(async(req,res,next)=>{

try {
    
    const token=req.cookies?.accessToken || req. // this retrieves the access token from the cookies of the incoming request. It checks if the req.cookies object exists and if it contains an accessToken cookie. If it does, it retrieves the value of the accessToken cookie and stores it in the token variable.
    header("Authorization")?.replace("Bearer ","") // if the access token is not found in the cookies, it checks the Authorization header of the request. It retrieves the value of the Authorization header and removes the "Bearer " prefix from it to extract the token.

    if(!token){
        throw new ApiError(401,"Unauthorized: No token provided") // if no token is found in either the cookies or the Authorization header, an ApiError is thrown with a status code of 401 and a message indicating that the request is unauthorized because no token was provided.
    }

    const decoded=jwt.verify(token,process.env.ACCESS_TOKEN_SECRET) // this verifies the token using the jwt.verify method. It takes the token and the secret key (ACCESS_TOKEN_SECRET) as arguments. If the token is valid, it decodes the token and stores the decoded payload in the decoded variable.

    const user=await User.findById(decoded.id).select("-password -refreshToken") // this retrieves the user from the database using the user ID extracted from the decoded token. It uses the User model to find the user by their ID and stores the user document in the user variable.

    if(!user){
        throw new ApiError(401,"Unauthorized: Invalid token") 
     }
     req.user=user; // if the user is found, it attaches the user document to the req object as req.user. This allows subsequent middleware or route handlers to access the authenticated user's information.

     next(); // finally, it calls the next() function to pass control to the next middleware or route handler in the Express.js request-response cycle.


} catch (error) {
    throw new ApiError(401,error?.message || "Unauthorized: Invalid token") 
}






})