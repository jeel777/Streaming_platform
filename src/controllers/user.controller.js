// this is the controller for user related operations, such as registering a user, logging in a user, etc.
// keep comments sort easy to read 

import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import {v2 as cloudinary} from "cloudinary";
import mongoose from "mongoose";


const generateAccessAndRefreshTokens=async(userId)=>{ // this function generates access and refresh tokens for a user based on their user ID. It takes the user ID as an argument and returns an object containing the generated access token and refresh token.

try {
    const user=await User.findById(userId);
    const accessToken=user.generateAccessToken();
    const refreshToken=user.generateRefreshToken();

    user.refreshToken=refreshToken;
    await user.save({validateBeforeSave:false}) // this saves the user document with the new refresh token. The validateBeforeSave option is set to false to skip validation, as we are only updating the refresh token and not modifying any other fields that require validation.;

    return {accessToken,refreshToken}

} catch (error) {
    throw new ApiError(500,"Failed to generate tokens")
}


}

const registerUser=asyncHandler(async(req,res)=>{
   
    const {fullname,email,password,username}=req.body;
    console.log("email",email);
    
    if(
        [fullname,email,password,username].some((field)=>field?.trim()=== "") // this checks if any of the required fields (fullname, email, password, username) are empty or contain only whitespace.
    ){
        throw new ApiError(400,"All fields are required") // if any of the required fields are empty, an ApiError is thrown with a status code of 400 and a message indicating that all fields are required.
    }

    const existingUser=await User.findOne({
        $or:[
            {email},
            {username}
        ]
 }   ) // this checks if a user with the same email or username already exists in the database. It uses the $or operator to check for either condition. If a user is found, it will be stored in the existingUser variable.

    if(existingUser){
        throw new ApiError(409,"User with this email or username already exists") // if a user with the same email or username already exists in the database, an ApiError is thrown with a status code of 409 and a message indicating that a user with this email or username already exists.
    }

    const avatarLocalPath=req.files?.avatar?.[0]?.path; // this retrieves the local file path of the avatar image uploaded by the user. It checks if the req.files object exists and if it contains an avatar file. If it does, it retrieves the path of the first avatar file and stores it in the avatarLocalPath variable.
    const coverImageLocalPath=req.files?.coverImage?.[0]?.path; // this retrieves the local file path of the cover image uploaded by the user. Uses optional chaining on coverImage since it may not be provided.

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar image is required") 
    }



    const avatar=await uploadOnCloudinary(avatarLocalPath); // this uploads the avatar image to Cloudinary using the uploadOnCloudinary function. The local file path of the avatar image is passed as an argument to the function, and the response from Cloudinary is stored in the avatar variable.
    const coverImage=coverImageLocalPath ? await uploadOnCloudinary(coverImageLocalPath) : null; // upload cover image only if provided


     if(!avatar){
        throw new ApiError(500,"Failed to upload avatar image")
     }

    const user=await User.create({
        fullname,
        email,
        password,
        username:username.toLowerCase(),
        avatar:avatar.url,
        coverImage:coverImage?.url || "" 
    
    })// this creates a new user in the database using the User model. The user's fullname, email, password, username, avatar URL, and cover image URL are passed as arguments to the create method. The created user is stored in the user variable.
    
    const createdUser=await User.findById(user._id).select("-password -refreshToken") // this retrieves the created user from the database using the findById method of the User model. The user's password is excluded from the retrieved data using the select method with "-password". The retrieved user is stored in the createdUser variable.

    if(!createdUser){
        throw new ApiError(500,"Failed to create user")
    }


    // Finally, a successful response is sent back to the client with a status code of 201 (Created) and a JSON object containing the created user data and a success message. The ApiResponse class is used to structure the response in a consistent format.
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )


})

const loginUser=asyncHandler(async(req,res)=>{
    const {email,password,username}=req.body;
    if(!username && !email){
        throw new ApiError(400,"Email or username is required")
    }
    if(!password){
        throw new ApiError(400,"Password is required")
    }

    const user=await User.findOne({
        $or:[{email},{username}]
    })

    if(!user){
        throw new ApiError(404,"User not found")
    }

    const ispasswordmatch=await user.isPasswordCorrect(password)

    if(!ispasswordmatch){
        throw new ApiError(401,"Invalid password")
    }

    const {accessToken,refreshToken}=await generateAccessAndRefreshTokens(user._id) // this calls the generateAccessAndRefreshTokens function with the user's ID to generate new access and refresh tokens. The generated tokens are destructured into accessToken and refreshToken variables.

    const loggedInUser=await User.findById(user._id).select("-password -refreshToken") // this retrieves the logged-in user's data from the database using the findById method of the User model. The user's password and refresh token are excluded from the retrieved data using the select method with "-password -refreshToken". The retrieved user data is stored in the loggedInUser variable.
  
   // this is options for setting the refresh token in the cookie. The httpOnly option is set to true to prevent client-side JavaScript from accessing the cookie, enhancing security. The secure option is set to true in production environments to ensure that the cookie is only sent over HTTPS. The sameSite option is set to "strict" to prevent the cookie from being sent in cross-site requests, providing additional protection against CSRF attacks. The maxAge option is set to 7 days (in milliseconds) to specify the duration for which the refresh token cookie will be valid.
    const options={
        httpOnly:true,
        secure:process.env.NODE_ENV==="production",
        sameSite:"strict",
        maxAge:7*24*60*60*1000 // 7 days
    }

    return res.status(200).
    cookie("refreshToken",refreshToken,options)
    .cookie("accessToken",accessToken,options)
    .json(
        new ApiResponse(200,
            {
                user:loggedInUser,
                accessToken,
                refreshToken
             },
             "User logged in successfully"  
            )
            

        
    )
})

const logoutUser=asyncHandler(async(req,res)=>{

    await User.findByIdAndUpdate(req.user._id,
        {
            $unset:{refreshToken:1} // removes the feild from document
        },
        {
            new:true
        }
    ) // this updates the user's document in the database to set the refreshToken field to null, effectively invalidating the refresh token and logging the user out.

    const options={
        httpOnly:true,
        secure:process.env.NODE_ENV==="production",
        sameSite:"strict",
        maxAge:0 // setting the maxAge to 0 will immediately expire the cookie, effectively removing it from the client's browser.
    }

    return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options).
    json(
        new ApiResponse(200,null,"User logged out successfully")
    )

})

const refreshAcessToken=asyncHandler(async(req,res)=>{
    const incomingRefreshToken=req.cookies.refreshToken || req.body.refreshToken; // this retrieves the incoming refresh token from either the cookies of the request or the request body. It checks if the req.cookies object exists and if it contains a refreshToken cookie. If it does, it retrieves the value of the refreshToken cookie. If not, it checks the request body for a refreshToken field and retrieves its value.

    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized: No refresh token provided") // if no refresh token is found in either the cookies or the request body, an ApiError is thrown with a status code of 401 and a message indicating that the request is unauthorized because no refresh token was provided.
    }

   try {
     const decodedToken=jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET);
 
     const user= await User.findById(decodedToken.id);
 
     if(!user){
         throw new ApiError(401,"Unauthorized: Invalid refresh token");
     }
     
     if(user.refreshToken !== incomingRefreshToken){
         throw new ApiError(401,"token expired, please login again")
     }
     
 // this is options for setting the new refresh token in the cookie. The httpOnly option is set to true to prevent client-side JavaScript from accessing the cookie, enhancing security. The secure option is set to true in production environments to ensure that the cookie is only sent over HTTPS. The sameSite option is set to "strict" to prevent the cookie from being sent in cross-site requests, providing additional protection against CSRF attacks. The maxAge option is set to 7 days (in milliseconds) to specify the duration for which the new refresh token cookie will be valid.
     const options={
         httpOnly:true,
         secure:process.env.NODE_ENV==="production",
         sameSite:"strict",
         maxAge:7*24*60*60*1000 // 7 days
     }
 
     const {accessToken,refreshToken}=await generateAccessAndRefreshTokens(user._id);
 
     return res.status(200).
     cookie("refreshToken",refreshToken,options)
     .cookie("accessToken",accessToken,options)
     .json(
         new ApiResponse(200,{accessToken,refreshToken},"Access token refreshed successfully")
     )
   } catch (error) {
    throw new ApiError(401,error?.message || "Unauthorized: Invalid refresh token")
   }

    // 1. We retrieved the incoming refresh token from either the cookies or the request body.
    // 2. We verified the incoming refresh token using the jwt.verify method and decoded the token to extract the user ID.
    // 3. We retrieved the user from the database using the extracted user ID.
    // 4. We checked if the user exists and if the refresh token stored in the user's document matches the incoming refresh token. If not, we threw an ApiError indicating that the token is invalid or expired.
    // 5. If the refresh token is valid, we generated new access and refresh tokens for the user using the generateAccessAndRefreshTokens function.
    // 6. Finally, we set the new refresh token in the cookie and sent a successful response back to the client with the new access token and refresh token.
    
})

const changeCurrentUserPassword=asyncHandler(async(req,res)=>{

    const {oldPassword,newPassword}= req.body


    // now i got old and new password 
    // now i want to find user in database and check if old password is correct or not
    // how will i find user in database?
    // i will find user in database by id which is stored in req.user.id because this route is protected and user is authenticated so we have user id in req.user object

    const user=await User.findById(req.user._id)

    // now i have user 
    // i will comapre the password 

    const isOldPasswordCorrect=await user.isPasswordCorrect(oldPassword)

    if(!isOldPasswordCorrect){
        throw new ApiError(401,"Old password is incorrect")
    }

    user.password=newPassword; 
    await user.save({validateBeforeSave:false})// this saves the updated user document to the database. The validateBeforeSave option is set to false to skip validation, as we are only updating the password and not modifying any other fields that require validation. 

    return res.status(200).json(
        new ApiResponse(200,null,"Password changed successfully")
    )
    


})

// this is a controller function to get the current user details. It is a protected route, so the user must be authenticated to access it. The user's details are stored in the req.user object, which is populated by the authentication middleware. The function simply returns the user's details in the response with a success message.
const getCurrentUser=asyncHandler(async(req,res)=>{
    return res.status(200).json(
        new ApiResponse(200,req.user,"Current user retrieved successfully")
    )
})

const updateCurrentUserDetails=asyncHandler(async(req,res)=>{
    // we can give options according to our need 
    // generally use differrent endpoints to update files , images 
    // so all text data will not gone for update files,images etc..

    const {fullname,email}=req.body;

    if(!fullname && !email){
        throw new ApiError(400,"At least one field is required to update") 
    }

    const user=await User.findByIdAndUpdate(req.user._id,
        {
        $set:{
            fullname,
            email
        }
    },
    {new:true}
    ).select("-password") // why we select password here because we don't want to return password in response

    return res.status(200).json(
        new ApiResponse(200,user,"User details updated successfully")
    )
})

const updateUserAvatar=asyncHandler(async(req,res)=>{

    const AvatarLocalPath=req.file?.path;
    if(!AvatarLocalPath){
        throw new ApiError(400,"Avatar image is required")
    }

    const Avatar=await uploadOnCloudinary(AvatarLocalPath);

    if(!Avatar.url){
        throw new ApiError(500,"Failed to upload avatar image")
    }

    const user=await User.findById(req.user._id).select("avatar");
    const oldAvatarUrl=user?.avatar;

    const updatedUser=await User.findByIdAndUpdate(req.user._id,
        {
            $set:{avatar:Avatar.url}
        },{new:true}
    ).select("-password")

    if(oldAvatarUrl){
        const oldAvatarPublicId=oldAvatarUrl
            .split("/upload/")[1]
            ?.replace(/^v\d+\//,"")
            ?.replace(/\.[^/.]+$/,"");

        if(oldAvatarPublicId){
            try {
                await cloudinary.uploader.destroy(oldAvatarPublicId);
            } catch (error) {
                console.error("Failed to delete old avatar image from cloudinary:", error);
            }
        }
    }

    return res.status(200).json(
        new ApiResponse(200,updatedUser,"Avatar image updated successfully")
    )

    

})


const updateUserCoverImage=asyncHandler(async(req,res)=>{

    const coverImageLocalPath=req.file?.path;
    if(!coverImageLocalPath){
        throw new ApiError(400,"Cover image is required")
    }

    const coverImage=await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImage.url){
        throw new ApiError(500,"Failed to upload cover image")
    }

    await User.findByIdAndUpdate(req.user._id,
        {
            $set:{coverImage:coverImage.url}
        },{new:true}
    ).select("-password")

    return res.status(200).json(
        new ApiResponse(200,null,"Cover image updated successfully")
    )
})

const getUserChannelProfile=asyncHandler(async(req,res)=>{

    // in this i will use aggregation pipeline to get the user details along with the number of subscribers and videos they have uploaded

    const {username}=req.params;
    
    if(!username?.trim()){
        throw new ApiError(400,"Username is required")  
    }

    const channel=await User.aggregate([ // this is the aggregation pipeline to get the user details along with the number of subscribers and videos they have uploaded. The pipeline consists of multiple stages that are executed in sequence to transform the data and produce the desired output. 
        
            { // first pipeline stage
                $match:{
                    username:username.toLowerCase() 
                }
            },
            { // second pipeline stage
                $lookup:{ // in lookup stage we will join the user collection with the subscription collection to get the number of subscribers and videos they have uploaded

                    from :"subscriptions", // this is the name of the collection we want to join with
                    localField:"_id",  // this is the field from the user collection that we want to match with the foreign field in the subscriptions collection
                    foreignField:"channel", // this is the field from the subscriptions collection that we want to match with the local field in the user collection
                    as:"subscribers" // this is the name of the field that will be added to the user document to store the joined data from the subscriptions collection

                } // from this loopup i will get my subscribers, means how many people are subscribed to my channel
            },
            {
                $lookup:{
                    from:"subscriptions",
                    localField:"_id",
                    foreignField:"subscriber",
                    as:"subscribedTo"
                
                } // from this lookup i will get my subscriptions, means to which channels i am subscribed,
            },
            {
                $addFields:{ 
                    subscribersCount:{ // this is my channels subscribers count, means how many people are subscribed to my channel
                        $size:"$subscribers"
                    },
                    channelSubscribedToCount:{ // this is my channels subscribed to count, means to how many channels i am subscribed
                        $size:"$subscribedTo"
                    },
                    isSubscribed:{
                        $cond:{
                            if:{
                                $in:[req.user._id,"$subscribers.subscriber"]
                            },
                            then:true, // if subscribed give true to frontend 
                            else:false // else give false to frontend
                        }
                    }
                }
            },
            {
                
                $project:{ // select fields which we have to send to frontend 
                    username:1,
                    fullname:1,
                    email:1,
                    avatar:1,
                    coverImage:1,
                    subscribersCount:1,
                    channelSubscribedToCount:1,
                    isSubscribed:1
                }


            }
        
    ])

    if(!channel || channel.length===0){
        throw new ApiError(404,"Channel not found")
    }

    return res.status(200).json(
        new ApiResponse(200,channel[0],"Channel profile retrieved successfully")
    )



})


const getwatchHostory=asyncHandler(async(req,res)=>{
    const user=await User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId(req.user._id) // why we are using mongoose.Types.ObjectId because in aggregation pipeline we have to match the _id field with the user id which is in string format, so we have to convert it to ObjectId format using mongoose.Types.ObjectId
            } 
        },{
            $lookup:{

                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchedVideos",
                // from this lookup i will get all the videos which are in my watch history, means all the videos which i have watched, and they will be stored in the watchedVideos field of the user document
           
                pipeline:[ // this is the pipeline to get the owner details of each video in the watch history, because in the video model we have a field called owner which is a reference to the user model, so we will use lookup to get the owner details of each video in the watch history and store it in the owner field of each video document in the watchedVideos array
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",

                            pipeline:[
                                {
                                    $project:{
                                        fullname:1,
                                        username:1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    },{
                        $addFields:{ // this is to add the owner field to each video document in the watchedVideos array, because the lookup will return an array of owner details for each video, but we want to have a single owner object for each video, so we will use $addFields to add the owner field to each video document and set it to the first element of the owner array returned by the lookup
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
           
           
            }
        }
    ])

    return res.status(200).json(
        new ApiResponse(200,user[0]?.watchedVideos || [],"Watch history retrieved successfully")
    )
})





export {registerUser,loginUser,logoutUser,refreshAcessToken,changeCurrentUserPassword,getCurrentUser,updateCurrentUserDetails,updateUserAvatar,updateUserCoverImage,getUserChannelProfile,getwatchHostory}
