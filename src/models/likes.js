const mongoose ,{Schema}= require('mongoose'); 
const comment = require('./comment');


const LikeSchema=new Schema(
    {

        video:{
            type:Schema.Types.ObjectId,
            ref:"Video",
            required:true
        },
        comment:{
            type:Schema.Types.ObjectId,
            ref:"Comment",
            required:true
        },
        tweet:{
            type:Schema.Types.ObjectId,
            ref:"Tweet",
            required:true
        },
        likeby:{
            type:Schema.Types.ObjectId,
            ref:"User",
            required:true
        },
    },{
        timestamps:true
    }

)

export const Like = mongoose.model("Like", LikeSchema);