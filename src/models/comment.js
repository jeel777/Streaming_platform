const mongoose ,{Schema}= require('mongoose'); 
const mongooseaggregatePaginate = require('mongoose-aggregate-paginate-v2');

const CommentSchema = new Schema(
    {

        content:{
            type:String,
            required:true
        },

        video:{
            type:Schema.Types.ObjectId,
            ref:"Video",
            required:true
        },
        owner:{
            type:Schema.Types.ObjectId,
            ref:"User",
            required:true
        },
      





    },  {
            timestamps:true
        }

)



CommentSchema.plugin(mongooseaggregatePaginate); // Apply the pagination plugin to the Comment schema

export const Comment = mongoose.model("Comment", CommentSchema);