// this is a custom error class that extends the built-in Error class in JavaScript. 
// It is designed to provide a standardized way to handle API errors in a Node.js application. 
// The ApiError class includes additional properties 
// such as statusCode, data, success, and errors to provide more context about the error that occurred.
class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        stack = ""
    ){
        super(message)

        this.statusCode = statusCode
        this.data = null
        this.message = message
        this.success = false
        this.errors = errors

        if(stack){
            this.stack = stack
        } else {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export { ApiError }