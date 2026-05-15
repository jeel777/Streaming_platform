const mongoose ,{Schema}= require('mongoose');

const TweetSchema=new Schema(
    {
        content:{
            type:String,
            required:true
        },
        owner:{
            type:Schema.Types.ObjectId,
            ref:"User",
            required:true
        },
    },{
        timestamps:true
    }

)

export const Tweet = mongoose.model("Tweet", TweetSchema);