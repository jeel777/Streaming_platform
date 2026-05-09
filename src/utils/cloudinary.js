// this file is responsible for uploading files to cloudinary and deleting them from local storage after uploading
import {v2} from "cloudinary";
import fs from "fs";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// function to upload file to cloudinary
const uploadOnCloudinary=async(localFilePath)=>{

try {

    if(!localFilePath){
        throw new Error("No file path provided");
    }
    // uploading file to cloudinary
    const response=await cloudinary.uploader.upload({
        resource_type:"auto",
    })

    console.log("File has been uploaded on cloudinary successfully",response.url);
    return response;
    
} catch (error) {
    fs.unlinkSync(localFilePath); // deleting the file from local storage
    console.error("Error uploading file to cloudinary:", error);
    return null;
}


}

export {uploadOnCloudinary}
