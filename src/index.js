import dotenv from "dotenv"
import connectDB from "./db/index.js";

dotenv.config({
    path:'./env'
})
connectDB()



// this is one way to connect to database and start server but it is not recommended as it can 
// cause issues with error handling and scalability. It is better to separate the database connection and 
// server setup into different files for better organization and maintainability.


// import express from "express";
// const app=express();

// ( async() =>{
//    try {
//    await moongoose.connect(`${process.env.MONGO_URL}/${DB_NAME}`)
//    app.on("error",(error)=>{
//     console.error("Error connecting to database",error);
//     throw error
//    })
//    app.listen(process.env.PORT,()=>{
//     console.log(`Server is running on port ${process.env.PORT}`)
//     })
//    } catch (error) {
//     console.error("Error connecting to database",error)
//     throw error
//    } 
// })()