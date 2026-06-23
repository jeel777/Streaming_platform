import express from "express"
// CORS stands for Cross-Origin Resource Sharing. 
// It is a security feature implemented by web browsers to restrict web pages from making requests to a different domain than the one that served the web page. 
// CORS allows servers to specify who can access their resources and how they can be accessed, 
// providing a way to relax the same-origin policy and enable cross-origin requests.
import cors from "cors" 
// Cookie-parser is a middleware for Express.js that parses cookies attached to the client request object.
import cookieParser from "cookie-parser"

const app=express();

app.use(cors({
    origin:process.env.CORS_ORIGIN,
    credentials:true
}))

app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({extended:true,limit:"16kb"}))
app.use(express.static("public")) // This line serves static files from the "public" directory.
app.use(cookieParser()) 

// importing routes
import userRoutes from "./routes/user.routes.js"
import videoRoutes from "./routes/video.routes.js"
import commentRoutes from "./routes/comment.routes.js"
import likeRoutes from "./routes/like.routes.js"
import playlistRoutes from "./routes/playlist.routes.js"
import tweetRoutes from "./routes/tweet.routes.js"
import subscriptionRoutes from "./routes/subscription.routes.js"
import thumbnailRoutes from "./routes/thumbnail.routes.js"
import recommendationRoutes from "./routes/recommendation.routes.js"

// routers declaration
app.use("/api/v1/users", userRoutes)
app.use("/api/v1/videos", videoRoutes)
app.use("/api/v1/comments", commentRoutes)
app.use("/api/v1/likes", likeRoutes)
app.use("/api/v1/playlists", playlistRoutes)
app.use("/api/v1/tweets", tweetRoutes)
app.use("/api/v1/subscriptions", subscriptionRoutes)
app.use("/api/v1/ai", thumbnailRoutes)
app.use("/api/v1/recommendations", recommendationRoutes)

// global error handler — converts ApiError into proper JSON responses
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Something went wrong";

    return res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        errors: err.errors || [],
        ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
});


export {app}