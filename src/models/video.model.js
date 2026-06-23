import mongoose, {Schema} from 'mongoose';
// mongoose-aggregate-paginate-v2 is a plugin for Mongoose that 
// provides pagination capabilities for MongoDB aggregate queries. 
// It allows you to easily paginate the results of an aggregate query, 
// which is useful when you have a large dataset and want to display it in smaller chunks on the frontend. 
// The plugin provides methods to specify the page number, page size, and other pagination options, 
// making it easier to manage and display paginated data in your application.
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';



const VideoSchema=new Schema(

    {

        videoFile:{
            type:String, // will use cloudinary url
            required:true

        },
        thumbnail:{
            type:String, // will use cloudinary url
            required:true
        },
        title:{ 
            type:String,
            required:true,
        },
        description:{
            type:String,
            required:true
        },
        duration:{  
            type:Number, // in seconds 
            required:true
        },
        views:{
            type:Number,
            default:0
        },
        ispublished:{
            type:Boolean,
            default:true
        },
        owner:{
            type:Schema.Types.ObjectId,
            ref:"User",
            required:true
        },
        tags:[{
            type:String,
            lowercase:true,
            trim:true,
        }],
        thumbnailSuggestions:[{
            frameUrl: { type: String },
            score: { type: Number },
            analysis: { type: String },
            suggestedText: { type: String },
            timestamp: { type: Number },
        }],


    
},
    {
        timestamps:true
    }

)
VideoSchema.plugin(mongooseAggregatePaginate)

export const Video=mongoose.model("Video",VideoSchema)