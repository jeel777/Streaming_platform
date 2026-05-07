// DB is in another continent so always use async await to connect to database and start server to avoid any issues with error handling and scalability. It is better to separate the database connection and server setup into different files for better organization and maintainability.
import moongoose from "mongoose";
import { DB_NAME } from "../constant.js";

const connectDB=async()=>{
    try {

       const connectionInstance= await moongoose.connect(`${process.env.MONGO_URL}/${DB_NAME}`)
        console.log(`\n Mongodb connected !! DB_host:${connectionInstance.connection.host}`);
        
    } catch (error) {
        console.error("Mongodb connection error ",error);
        process.exit(1) // exit the process with failure code
    }
}

export default connectDB