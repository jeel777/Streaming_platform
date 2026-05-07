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

export {app}