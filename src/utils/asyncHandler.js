// this is the way to handle async functions in express routes without try catch block in every route handler
// promise.resolve() is used to wrap the requestHandler function, which allows us to handle both synchronous and asynchronous functions.
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
    }

}
export { asyncHandler }

// this is the way to handle async functions in express routes without try catch block in every route handler