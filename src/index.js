import dotenv from "dotenv"
import connectDB from "./db/index.js"
import {app} from "./app.js"
import { startTranscriptionWorker } from "./queues/transcription.queue.js"
import { startThumbnailWorker } from "./queues/thumbnail.queue.js"
import { startViewCounterFlush, stopViewCounterFlush } from "./services/viewCounter.service.js"
import { disconnectRedis } from "./config/redis.js"

dotenv.config({
    path:'./.env'
})

let server;

// i called async func that return promise we can handle it with then and catch.
connectDB()
.then(()=>{
    server = app.listen(process.env.PORT || 8000,()=>{
        console.log(`server is running at port ${process.env.PORT}`);

        // Start background workers and services
        try {
            startTranscriptionWorker();
            startThumbnailWorker();
            startViewCounterFlush();
        } catch (err) {
            console.warn("[Startup] Some background services failed to start:", err.message);
            console.warn("[Startup] The API will still work, but background jobs may not process.");
        }
    })
})
.catch((err)=>{
    console.log("MongoDB connection error",err);
})

// ── Graceful Shutdown ────────────────────────────────────────────────
// Handles SIGTERM (Docker/K8s stop) and SIGINT (Ctrl+C)
const gracefulShutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop accepting new connections
    if (server) {
        server.close(() => {
            console.log("[Shutdown] HTTP server closed");
        });
    }

    try {
        // 2. Flush buffered view counts to MongoDB
        await stopViewCounterFlush();

        // 3. Disconnect Redis
        await disconnectRedis();

        console.log("[Shutdown] ✅ Graceful shutdown complete");
        process.exit(0);
    } catch (err) {
        console.error("[Shutdown] Error during shutdown:", err);
        process.exit(1);
    }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));













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