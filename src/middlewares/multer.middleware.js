import multer from "multer";

// this is the configuration for multer, which is a middleware for handling multipart/form-data, which is primarily used for uploading files.

const storage = multer.diskStorage({
  destination: function (req, file, cb) { // cb is a callback function that takes error and destination path as arguments 
    cb(null, './public/temp')   // this is the destination path where the file will be stored temporarily before uploading to cloudinary            
  },

  // this function is responsible for naming the file that will be stored in the destination path
  filename: function (req, file, cb) {
    cb(null, file.originalname) // this is the name of the file that will be stored in the destination path
  }
})

export const upload = multer({ storage: storage })