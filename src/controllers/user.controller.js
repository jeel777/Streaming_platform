// this is the controller for user related operations, such as registering a user, logging in a user, etc.


import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";


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

    const avtarLocalPath=req.files?.avatar[0]?.path; // this retrieves the local file path of the avatar image uploaded by the user. It checks if the req.files object exists and if it contains an avatar file. If it does, it retrieves the path of the first avatar file and stores it in the avtarLocalPath variable.
    const coverImageLocalPath=req.files?.coverImage[0]?.path; // this retrieves the local file path of the cover image uploaded by the user. It checks if the req.files object exists and if it contains a coverImage file. If it does, it retrieves the path of the first coverImage file and stores it in the coverImageLocalPath variable.

    if(!avtarLocalPath){
        throw new ApiError(400,"Avatar image is required") 
    }
    if(!coverImageLocalPath){
        throw new ApiError(400,"Cover image is required") 
     }

    const avatar=await uploadOnCloudinary(avtarLocalPath); // this uploads the avatar image to Cloudinary using the uploadOnCloudinary function. The local file path of the avatar image is passed as an argument to the function, and the response from Cloudinary is stored in the avatar variable.
    const coverImage=await uploadOnCloudinary(coverImageLocalPath); // this uploads the cover image to Cloudinary using the uploadOnCloudinary function. The local file path of the cover image is passed as an argument to the function, and the response from Cloudinary is stored in the coverImage variable.


     if(!avatar){
        throw new ApiError(500,"Failed to upload avatar image")
     }
    if(!coverImage){    
            throw new ApiError(500,"Failed to upload cover image")
    }

    const user=await User.create({
        fullname,
        email,
        password,
        username:username.toLowerCase(),
        avatar:avatar.url,
        coverImage:coverImage.url 
    
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

    await generateAccessAndRefreshTokens(user._id)

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
            $set:{refreshToken:null}
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
 
     const user= User.findById(decodedToken.id);
 
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
 
     const {accessToken,newrefreshToken}=await generateAccessAndRefreshTokens(user._id);
 
     return res.status(200).
     cookie("refreshToken",newrefreshToken,options)
     .cookie("accessToken",accessToken,options)
     .json(
         new ApiResponse(200,{accessToken,newrefreshToken},"Access token refreshed successfully")
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


export {registerUser,loginUser,logoutUser,refreshAcessToken}
