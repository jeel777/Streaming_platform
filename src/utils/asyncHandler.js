// this is the way to handle async functions in express routes without try catch block in every route handler
// promise.resolve() is used to wrap the requestHandler function, which allows us to handle both synchronous and asynchronous functions.
const asyncHandler=(requestHandler)=>{
   return (req,res,next)=>{
        Promise.resolve(requestHandler(req,res,next)).catch((err)=>next(err))
    }

}
export {asyncHandler}

// this is the way to handle async functions in express routes without try catch block in every route handler
// const asyncHandler= (fn)=> async(req,res,next)=>{
//     try {
//         await fn(req,res,next);
//     } catch (error) {
//         res.status(error.code || 500).json({
//             success :false,
//             message:error.message
//         })
//     }
// } 