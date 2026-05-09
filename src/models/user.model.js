import mongoose,{Schema} from "mongoose"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"

const UserSchema=new Schema({

    username:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true, // removes whitespace from both ends of a string
        index:true // creates an index on the username field for faster queries searching
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true,
    },
    fullname:{
        type:String,
        required:true,
        trim:true,
        index:true
    },
    avatar:{
        type:String, // will use cloudinary url
        required:true
    },
    coverImage:{
        type:String,  // will use cloudinary url
    },
    watchHistory:[
        {
            type:Schema.Types.ObjectId,
            ref:"Video"
        }
    ],
    password:{
        type:String,
        required:[true,'Password is required']
    },
    refreshToken:{
        type:String
    }
},
{
    timestamps:true
}
)


// used to bcrypt the password before saving the user document to the database.
UserSchema.pre("save",async function(next){ // this refers to the current user document being saved

if(!this.isModified("password")){ // if the password field has not been modified, we can skip hashing and move to the next middleware or save operation
    return next();
}

this.password=await bcrypt.hash(this.password,10) // this.password is the plain text password that the user has set, and we are hashing it with a salt round of 10 for security. 
next();             // The hashed password will then be stored in the database instead of the plain text password.
})



// used to compare password
UserSchema.methods.isPasswordCorrect=async function(password){
    return await bcrypt.compare(password,this.password)
}

UserSchema.methods.generateAccessToken=function(){
    return jwt.sign(
        {   id:this._id,
            username:this.username,
            email:this.email,
            fullname:this.fullname,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {expiresIn:process.env.ACCESS_TOKEN_EXPIRES_IN}
    )
}

UserSchema.methods.generateRefreshToken=function(){
    return jwt.sign(
        {   id:this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {expiresIn:process.env.REFRESH_TOKEN_EXPIRES_IN}
    )
}
    

export const User=mongoose.model("User",UserSchema)