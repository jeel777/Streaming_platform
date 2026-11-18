# 🎯 Backend Features — Interview Deep Dive

Based on your actual codebase. Every answer references **your real code**.

---

## Quick Architecture Overview (Say This First)

> "It's a REST API built with **Node.js + Express + MongoDB** (Mongoose ODM). Authentication uses **JWT with dual tokens** — short-lived access token + long-lived refresh token, both stored in **HttpOnly cookies** to prevent XSS. I use **MongoDB aggregation pipelines** heavily for joins across collections (subscribers, likes, comments) since MongoDB doesn't have native SQL-style joins. The API follows a **controller → service → model** layered architecture with centralized error handling."

### Your API Route Map
| Base Path | Feature | Key HTTP Methods |
|---|---|---|
| `/api/v1/users` | Auth, profile, watch history | POST, GET, PATCH |
| `/api/v1/videos` | Video CRUD, search, pagination | GET, POST, PATCH, DELETE |
| `/api/v1/subscriptions` | Subscribe/unsubscribe channels | POST, GET |
| `/api/v1/playlists` | Playlist CRUD, add/remove videos | POST, GET, PATCH, DELETE |
| `/api/v1/likes` | Toggle like on video/comment/tweet | POST, GET |
| `/api/v1/comments` | Comment CRUD with pagination | POST, GET, PATCH, DELETE |
| `/api/v1/ai` | AI thumbnails, transcription | POST, GET, PATCH |

---

## 1. JWT Authentication with HttpOnly Cookies

### How It Works in Your Code

```
Registration → Login → Access Token (short-lived) + Refresh Token (long-lived)
                        ↓                            ↓
                   Sent in HttpOnly cookie      Saved in DB + HttpOnly cookie
                        ↓                            ↓
                   Used for API requests       Used to get new access token
```

**Key implementation details from your code:**

| Aspect | Your Implementation | Code Location |
|---|---|---|
| Password hashing | bcrypt with salt round 10 | [user.model.js L56-63](file:///Users/jeel/Desktop/streaming_platform/src/models/user.model.js#L56-L63) |
| Access token payload | `{id, username, email, fullname}` | [user.model.js L72-81](file:///Users/jeel/Desktop/streaming_platform/src/models/user.model.js#L72-L81) |
| Refresh token payload | `{id}` only (minimal) | [user.model.js L84-91](file:///Users/jeel/Desktop/streaming_platform/src/models/user.model.js#L84-L91) |
| Cookie options | `httpOnly: true, secure: production, sameSite: strict` | [user.controller.js L122-127](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L122-L127) |
| Token verification | Checks cookie first → then Authorization header | [auth.middleware.js L11-12](file:///Users/jeel/Desktop/streaming_platform/src/middlewares/auth.middleware.js#L11-L12) |
| Refresh flow | Verify refresh token → match DB → generate new pair | [user.controller.js L172-219](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L172-L219) |
| Logout | `$unset` refresh token from DB + clear cookies with `maxAge: 0` | [user.controller.js L147-170](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L147-L170) |

### What the Interviewer Wants to Hear

> "I use a **dual-token strategy**. The access token is short-lived (e.g., 15 min) and contains user identity. The refresh token is long-lived (7 days) and contains only the user ID — minimizing data exposure if compromised. Both are stored in **HttpOnly cookies** — JavaScript can't read them, which **prevents XSS attacks** from stealing tokens. I also set `sameSite: strict` to **prevent CSRF attacks** and `secure: true` in production to enforce HTTPS-only transmission."

### Cross Questions & Answers

---

#### ❓ "Why HttpOnly cookies instead of localStorage?"

> **localStorage is vulnerable to XSS.** If an attacker injects malicious JavaScript (e.g., through a comment or user-generated content), they can read `localStorage.getItem('token')` and steal the token. HttpOnly cookies are **inaccessible to JavaScript** — even if XSS occurs, the attacker can't extract the token. The browser automatically attaches HttpOnly cookies to every request, so the flow is seamless.

#### ❓ "If cookies prevent XSS, what about CSRF attacks?"

> "I handle CSRF with **two measures**:
> 1. `sameSite: 'strict'` — the browser won't send cookies on cross-origin requests. A malicious form on `evil.com` cannot trigger authenticated requests to my API.
> 2. My API only accepts `application/json` content type — HTML forms can't send JSON, so form-based CSRF attacks won't work.
>
> For extra security in production, I'd add a **CSRF token** (e.g., `csurf` middleware) for state-changing operations."

#### ❓ "Why do you store the refresh token in the database?"

> "To enable **server-side revocation**. When a user logs out, I `$unset` the refresh token from their document. Even if the cookie hasn't expired in the browser, the refresh attempt will fail because the DB token won't match. This also means I can force-logout all sessions by clearing the DB token — something you can't do with stateless JWT alone."

**Your code** — [user.controller.js L188-190](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L188-L190):
```javascript
if (user.refreshToken !== incomingRefreshToken) {
    throw new ApiError(401, "token expired, please login again")
}
```

#### ❓ "What happens if the access token expires mid-session?"

> "The frontend detects a 401 response, then calls my `/api/v1/users/refresh-token` endpoint. This endpoint:
> 1. Reads the refresh token from the cookie
> 2. Verifies it with `jwt.verify()`
> 3. Checks it matches the DB-stored token (not revoked)
> 4. Generates a **new pair** of tokens (token rotation)
> 5. Sets new cookies and responds
>
> This is called **refresh token rotation** — each refresh invalidates the old pair, reducing the window of compromise."

#### ❓ "Why does the access token have more claims than the refresh token?"

> "The access token carries `{id, username, email, fullname}` because it's used on **every request** — having user info avoids a DB lookup in the auth middleware... wait, actually I still do a DB lookup in my middleware."

**⚠️ Weakness to acknowledge:** Your [auth.middleware.js L20](file:///Users/jeel/Desktop/streaming_platform/src/middlewares/auth.middleware.js#L20) does `User.findById(decoded.id)` on every request despite having user info in the JWT. Say:
> "In my current implementation, I still hit the DB per request for freshness. In production, I'd **cache user data in Redis** (TTL = access token lifetime) and only hit DB on cache miss. This eliminates the DB query on most requests while keeping data fresh."

#### ❓ "What if someone steals the refresh token cookie?"

> "The damage is limited because:
> 1. `httpOnly` prevents JS extraction — they'd need a network-level attack (MITM), which `secure: true` prevents on HTTPS
> 2. `sameSite: strict` prevents cross-origin sending
> 3. **Token rotation**: When the legitimate user refreshes, the stolen token is invalidated. If the attacker refreshes first, the legitimate user's next refresh fails → they're forced to re-login → the attacker's stolen token is also invalidated
> 4. In production, I'd add **refresh token family tracking** — detect reuse and invalidate all tokens for that family"

---

## 2. Subscriptions

### How It Works in Your Code

**Schema** — a simple junction/join table pattern:
```javascript
// subscription.model.js — just two references
{ subscriber: ObjectId → User, channel: ObjectId → User }
```

**Key Patterns:**

| Feature | How | Code Reference |
|---|---|---|
| Toggle subscribe/unsubscribe | Find existing → delete if exists, create if not | [subscription.controller.js L9-60](file:///Users/jeel/Desktop/streaming_platform/src/controllers/subscription.controller.js#L9-L60) |
| Can't self-subscribe | `channelId === req.user._id.toString()` check | [L17-19](file:///Users/jeel/Desktop/streaming_platform/src/controllers/subscription.controller.js#L17-L19) |
| Get subscriber count | Aggregation with `$lookup` + `$size` | [user.controller.js L366-427](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L366-L427) |
| Check if current user subscribed | `$in` operator on aggregated subscribers | [user.controller.js L400-408](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L400-L408) |
| Mutual subscription check | Second `$lookup` back to subscriptions | [subscription.controller.js L99-135](file:///Users/jeel/Desktop/streaming_platform/src/controllers/subscription.controller.js#L99-L135) |
| Latest video from subscribed channels | Nested `$lookup` into videos with `$sort` + `$limit: 1` | [subscription.controller.js L193-217](file:///Users/jeel/Desktop/streaming_platform/src/controllers/subscription.controller.js#L193-L217) |

### What the Interviewer Wants to Hear

> "I use a **separate Subscription collection** (junction table pattern) instead of embedding subscriber arrays in the User document. This is important because:
> 1. A channel can have **millions of subscribers** — embedding would exceed MongoDB's 16MB document limit
> 2. Counting subscribers is a simple `$size` on the `$lookup` result — O(1) in the aggregation
> 3. The `isSubscribed` check uses `$in` to see if the current user's ID exists in the subscribers array — computed per request in the aggregation
> 4. I also compute **mutual subscriptions** (does channel X subscribe back to subscriber Y?) using a second `$lookup` — useful for features like 'subscribers you know'"

### Cross Questions & Answers

---

#### ❓ "Why a separate collection instead of an array in the User document?"

> "MongoDB documents have a **16MB size limit**. If I store subscribers as an array on the User document, a channel with 1 million subscribers would have 1M ObjectIds × 12 bytes = ~12MB just for that field. It would also make every User query slow. The junction table pattern:
> - Has no size limit (each subscription is its own document)
> - Can be indexed on `{subscriber, channel}` for O(1) lookups
> - Supports compound queries like 'who subscribed after date X'"

#### ❓ "Your toggle uses two DB operations (findOne + create/delete). What about race conditions?"

> "If two requests hit simultaneously, `findOne` could both return null, creating duplicate subscriptions. I'd fix this with a **compound unique index**:
> ```javascript
> subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true });
> ```
> This makes MongoDB reject the second `create()` with a duplicate key error, which I'd catch and handle gracefully. Alternatively, use `findOneAndUpdate` with `upsert: true`."

#### ❓ "How does the subscriber count perform at scale?"

> "Currently, `$lookup` + `$size` loads all subscription documents into memory to count them. For millions of subscribers, I'd instead:
> 1. **Maintain a `subscriberCount` field** on the User document (denormalized counter)
> 2. **Increment/decrement atomically** on subscribe/unsubscribe using `$inc: { subscriberCount: 1 }` or `$inc: { subscriberCount: -1 }`
> 3. This makes the count read O(1) instead of O(n)"

---

## 3. Playlists

### How It Works in Your Code

**Schema** — owner-based with video array:
```javascript
{ name, description, videos: [ObjectId → Video], owner: ObjectId → User }
```

| Feature | Key Detail | Code Reference |
|---|---|---|
| Full CRUD | Create, Read, Update, Delete | [playlist.controller.js](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js) |
| Authorization | Every mutation checks `playlist.owner === req.user._id` | [L133](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L133), [L174](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L174), [L205](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L205), [L253](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L253) |
| Duplicate prevention | `playlist.videos.includes(videoId)` check | [L218](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L218) |
| Get with videos populated | Aggregation pipeline with nested `$lookup` for video owners | [L40-104](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L40-L104) |
| Auto playlist cover | Uses first video's thumbnail as cover: `$arrayElemAt: ["$videos.thumbnail", 0]` | [L319-325](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L319-L325) |
| Only published videos shown | `$match: { ispublished: true }` in nested pipeline | [L53-55](file:///Users/jeel/Desktop/streaming_platform/src/controllers/playlist.controller.js#L53-L55) |

### Cross Questions

---

#### ❓ "Why embed video IDs in the playlist instead of a junction table?"

> "Because playlists have a **bounded, small number of videos** (typically <500). The 16MB document limit easily handles this. Embedding also preserves **video ordering** — the array position IS the playlist order. A junction table would need an extra `position` field and re-ordering logic."

#### ❓ "What happens to the playlist when a video is deleted?"

> "**This is a known issue in my codebase.** When I delete a video ([video.controller.js L376-384](file:///Users/jeel/Desktop/streaming_platform/src/controllers/video.controller.js#L376-L384)), I clean up comments, likes, and watch history, but I don't remove the video from playlists. The `$lookup` in `getPlaylistById` would return a null entry for the deleted video. I'd fix this by adding `Playlist.updateMany({}, { $pull: { videos: videoId } })` to the delete handler."

#### ❓ "Can you reorder videos in a playlist?"

> "Not in my current implementation. I'd add a `PATCH /playlists/:id/reorder` endpoint that accepts `{ videoId, newPosition }` and uses `Array.splice()` to move the video — the array index naturally represents order."

---

## 4. Likes (Toggle Pattern)

### How It Works in Your Code

**Schema — Polymorphic Like** (single collection for all likeable entities):
```javascript
{ video?: ObjectId, comment?: ObjectId, tweet?: ObjectId, likeby: ObjectId (required) }
```

| Feature | Key Detail | Code Reference |
|---|---|---|
| Toggle pattern | findOne → delete if exists, create if not | [like.controller.js L11-46](file:///Users/jeel/Desktop/streaming_platform/src/controllers/like.controller.js#L11-L46) |
| Polymorphic model | Same `Like` collection for videos, comments, tweets | [likes.js L4-28](file:///Users/jeel/Desktop/streaming_platform/src/models/likes.js#L4-L28) |
| Get liked videos | Aggregation: filter by `likeby` + `video exists` → `$lookup` video → `$replaceRoot` | [like.controller.js L119-178](file:///Users/jeel/Desktop/streaming_platform/src/controllers/like.controller.js#L119-L178) |
| Like count in video detail | `$lookup` likes + `$size` in video aggregation | [video.controller.js L224-244](file:///Users/jeel/Desktop/streaming_platform/src/controllers/video.controller.js#L224-L244) |
| `isLiked` per user | `$in: [req.user._id, "$likes.likeby"]` inside `$cond` | [video.controller.js L236-239](file:///Users/jeel/Desktop/streaming_platform/src/controllers/video.controller.js#L236-L239) |

### What the Interviewer Wants to Hear

> "I chose a **polymorphic like model** — one `Like` collection serves videos, comments, and tweets. Each like document has the `likeby` user and one of `{video, comment, tweet}` set. This avoids creating 3 separate like collections. The toggle pattern uses **find + conditional create/delete** — it's idempotent from the user's perspective (rapid clicking doesn't create issues)."

### Cross Questions

---

#### ❓ "Why a polymorphic model instead of separate VideoLike, CommentLike collections?"

> "Tradeoffs:
> - **Pro**: Single collection = simpler codebase, one aggregation pipeline for 'get all liked content', easier analytics
> - **Con**: Sparse fields (each doc has 2 null refs), querying is slightly less efficient because you need `{ video: { $exists: true } }` filters
> - At scale, I'd split them into **separate collections** for index efficiency — the `{video, likeby}` compound index on a polymorphic collection also indexes documents where video is null"

#### ❓ "How would you handle like counts at scale? The $lookup is O(n)."

> "Same as subscriptions — **denormalize with atomic counters**:
> ```javascript
> // On like toggle:
> await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: 1 } });
> // On unlike toggle:
> await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: -1 } });
> ```
> The `$lookup` for count is fine for now but would be a bottleneck for videos with millions of likes."

#### ❓ "What prevents a user from liking something twice?"

> "The `findOne({ video, likeby })` check before creating. But a **compound unique index** would be the bulletproof solution:
> ```javascript
> LikeSchema.index({ video: 1, likeby: 1 }, { unique: true, sparse: true });
> LikeSchema.index({ comment: 1, likeby: 1 }, { unique: true, sparse: true });
> ```
> The `sparse: true` ignores documents where the field is null — necessary for polymorphic schemas."

---

## 5. Comments (Paginated)

### How It Works in Your Code

| Feature | Key Detail | Code Reference |
|---|---|---|
| Paginated comments | `mongoose-aggregate-paginate-v2` plugin | [comment.controller.js L82-85](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L82-L85) |
| Newest first | `$sort: { createdAt: -1 }` | [L30-31](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L30-L31) |
| Like count per comment | `$lookup` likes → `$size` | [L50-61](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L50-L61) |
| `isLiked` per comment per user | `$in: [req.user._id, "$likes.likeby"]` | [L62-67](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L62-L67) |
| Cascade delete | Deleting a comment also deletes its likes: `Like.deleteMany({ comment })` | [L197](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L197) |
| Owner authorization | Only comment owner can update/delete | [L148](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L148), [L189](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L189) |
| Populate owner on create | `.populate("owner", "fullname username avatar")` | [L116-118](file:///Users/jeel/Desktop/streaming_platform/src/controllers/comment.controller.js#L116-L118) |

### Cross Questions

---

#### ❓ "Why `aggregatePaginate` instead of `.skip().limit()`?"

> "`.skip(n)` literally scans and discards `n` documents — O(n) for page 1000. `aggregatePaginate` uses the same under the hood but gives me **metadata** (`totalDocs`, `totalPages`, `hasNextPage`, `hasPrevPage`) which the frontend needs for pagination UI. For truly scalable pagination, I'd use **cursor-based pagination** — 'give me comments after this `createdAt` timestamp' using `$match: { createdAt: { $lt: lastSeenTimestamp } }` — which is always O(limit)."

#### ❓ "What about nested/threaded comments (replies)?"

> "My current schema is flat — every comment references the video directly. For threading, I'd add:
> ```javascript
> parentComment: { type: Schema.Types.ObjectId, ref: 'Comment', default: null }
> ```
> Then filter top-level comments (`parentComment: null`) and fetch replies separately. YouTube uses this approach — max 1 level of nesting. For deep threading (Reddit-style), I'd use a **materialized path** pattern: `path: '/rootId/parentId/thisId'`."

#### ❓ "Should the video owner be able to delete any comment on their video?"

> "Currently, only the comment owner can delete — but yes, the video owner should also have moderation rights. I'd change the authorization check:
> ```javascript
> const video = await Video.findById(comment.video);
> if (comment.owner.toString() !== req.user._id.toString() 
>     && video.owner.toString() !== req.user._id.toString()) {
>     throw new ApiError(403, 'Not authorized');
> }
> ```"

---

## 6. Watch History

### How It Works in Your Code

**Schema** — embedded array on User:
```javascript
watchHistory: [{ type: Schema.Types.ObjectId, ref: "Video" }]
```

| Feature | Key Detail | Code Reference |
|---|---|---|
| Add to history | `$addToSet` (no duplicates) when video is viewed | [video.controller.js L199-201](file:///Users/jeel/Desktop/streaming_platform/src/controllers/video.controller.js#L199-L201) |
| Get history | Aggregation: `$lookup` videos → nested `$lookup` owners → `$first` | [user.controller.js L442-491](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L442-L491) |
| Cleanup on video delete | `User.updateMany({}, { $pull: { watchHistory: videoId } })` | [video.controller.js L381-384](file:///Users/jeel/Desktop/streaming_platform/src/controllers/video.controller.js#L381-L384) |
| ObjectId conversion | `new mongoose.Types.ObjectId()` in aggregation `$match` | [user.controller.js L446](file:///Users/jeel/Desktop/streaming_platform/src/controllers/user.controller.js#L446) |

### Cross Questions

---

#### ❓ "Why `$addToSet` instead of `$push`?"

> "`$addToSet` only adds the value if it doesn't already exist in the array — built-in **deduplication**. With `$push`, watching a video 10 times adds it 10 times. `$addToSet` keeps it once."

#### ❓ "But then you lose the 'last watched' ordering. How do you fix that?"

> "Great catch — `$addToSet` doesn't update position if the video already exists. So rewatching a video won't move it to the top. To fix this, I'd use:
> ```javascript
> await User.findByIdAndUpdate(req.user._id, {
>     $pull: { watchHistory: videoId }       // remove first
> });
> await User.findByIdAndUpdate(req.user._id, {
>     $push: { watchHistory: { $each: [videoId], $position: 0 } }  // add to front
> });
> ```
> Or better: use a **separate WatchHistory collection** with timestamps:
> ```javascript
> { user: ObjectId, video: ObjectId, watchedAt: Date, watchDuration: Number }
> ```"

#### ❓ "The embedded array approach — what's the scaling limit?"

> "Each ObjectId is 12 bytes. A user who watches 10,000 videos = 120KB — well within the 16MB limit. But if we add watch timestamps, progress, etc., it grows fast. For a production platform, I'd move to a **separate collection** with TTL (auto-delete after 90 days) and cursor-based pagination."

---

## 7. Architecture-Level Cross Questions

---

#### ❓ "Explain your error handling strategy."

> "Three layers:
> 1. **`asyncHandler` wrapper** ([asyncHandler.js](file:///Users/jeel/Desktop/streaming_platform/src/utils/asyncHandler.js)) — catches all async errors and passes to `next()`, eliminating try-catch in every route
> 2. **`ApiError` class** ([ApiError.js](file:///Users/jeel/Desktop/streaming_platform/src/utils/ApiError.js)) — custom error with `statusCode`, `message`, and `errors` array for consistent error shape
> 3. **Global error handler** ([app.js L46-57](file:///Users/jeel/Desktop/streaming_platform/src/app.js#L46-L57)) — catches everything, returns JSON with stack trace in development only
>
> This means a thrown `new ApiError(404, 'Not found')` anywhere in the app becomes a proper `{ success: false, statusCode: 404, message: 'Not found' }` JSON response."

#### ❓ "Why MongoDB aggregation pipelines instead of multiple queries?"

> "Aggregation pipelines run **server-side in MongoDB** — the data transformation happens at the database level, not in Node.js. Doing multiple queries (find video → find likes → find owner) means:
> 1. Multiple network round-trips to the DB
> 2. Joining data in application memory (more RAM, more CPU)
> 3. No ability to compute fields like `likesCount` or `isSubscribed` at the DB level
>
> The aggregation does everything in **one round-trip**: `$match` → `$lookup` (join) → `$addFields` (compute) → `$project` (select fields). The tradeoff is readability — aggregation pipelines are harder to debug."

#### ❓ "What happens to Cloudinary assets when a video is deleted?"

> "I handle the **full asset lifecycle** ([video.controller.js L354-373](file:///Users/jeel/Desktop/streaming_platform/src/controllers/video.controller.js#L354-L373)):
> 1. Delete video file from Cloudinary (`resource_type: 'video'`)
> 2. Delete thumbnail from Cloudinary
> 3. Delete all associated comments
> 4. Delete all associated likes
> 5. Remove from all users' watch histories
>
> I also clean up old thumbnails when updating — extract the `public_id` from the URL and call `cloudinary.uploader.destroy()`."

#### ❓ "How do you handle video search?"

> "I use **MongoDB `$regex`** on title and description with case-insensitive matching ([video.controller.js L56-63](file:///Users/jeel/Desktop/streaming_platform/src/controllers/video.controller.js#L56-L63)). This works for small datasets but is O(n) — it scans every document. For production, I'd use:
> 1. **MongoDB Atlas Search** (Lucene-based full-text search with fuzzy matching, synonyms, and relevance scoring)
> 2. Or **Elasticsearch** as a dedicated search index synced via change streams"

#### ❓ "Your CORS config uses `process.env.CORS_ORIGIN`. What if you need multiple origins?"

> "Currently it's a single origin string. For multiple origins, I'd use a function:
> ```javascript
> cors({
>     origin: (origin, callback) => {
>         const whitelist = process.env.CORS_ORIGINS.split(',');
>         if (!origin || whitelist.includes(origin)) {
>             callback(null, true);
>         } else {
>             callback(new Error('Not allowed by CORS'));
>         }
>     },
>     credentials: true
> })
> ```"

---

## 8. Weaknesses to Acknowledge Proactively

Being upfront about these shows **self-awareness** — interviewers love it.

| Weakness | Where | What You'd Improve |
|---|---|---|
| **DB query per request** in auth middleware | [auth.middleware.js L20](file:///Users/jeel/Desktop/streaming_platform/src/middlewares/auth.middleware.js#L20) | Redis cache for user data |
| **No rate limiting** | No middleware | Express-rate-limit + Redis store |
| **No input sanitization** | Comment content, descriptions | `express-mongo-sanitize` to prevent NoSQL injection |
| **No compound unique indexes** | Likes, Subscriptions | Add `{ video: 1, likeby: 1, unique: true }` |
| **Sequential Cloudinary uploads** | Thumbnail service | `Promise.all()` for parallel uploads |
| **$regex search** is not scalable | Video search | MongoDB Atlas Search or Elasticsearch |
| **No pagination** on watch history | User controller | Add cursor-based pagination |
| **Video delete doesn't clean playlists** | Video controller | Add `Playlist.updateMany({ $pull })` |
| **View count not debounced** | Video controller L180-183 | Add per-user cooldown (Redis) to prevent refresh-spamming views |

---

## 9. The "Walk Me Through a Request" Question

Interviewers often say: **"Walk me through what happens when a user likes a video."**

```
1. Frontend sends POST /api/v1/likes/toggle/v/:videoId
   └── Cookie: accessToken=eyJhbG... (attached automatically by browser)

2. Express middleware chain:
   └── cookieParser() → extracts cookies into req.cookies
   └── verifyJWT middleware → reads req.cookies.accessToken
       → jwt.verify() with ACCESS_TOKEN_SECRET
       → User.findById(decoded.id) → attaches user to req.user
       → calls next()

3. toggleVideoLike controller:
   └── Validates videoId with mongoose.isValidObjectId()
   └── Video.findById(videoId) — confirms video exists
   └── Like.findOne({ video: videoId, likeby: req.user._id })
       ├── If found → Like.findByIdAndDelete() → responds { isLiked: false }
       └── If not found → Like.create() → responds { isLiked: true }

4. Response: { statusCode: 200, data: { isLiked: true }, message: "Video liked" }
```

---

## 10. Quick Cheat Sheet — Key Terms to Use

| Say This | Not This |
|---|---|
| "Junction table / join table pattern" | "I made a separate collection" |
| "Compound unique index" | "I check for duplicates" |
| "Token rotation strategy" | "I refresh the token" |
| "Polymorphic association" | "I put everything in one collection" |
| "Denormalized counter cache" | "I count using $size" |
| "Cursor-based pagination" | "I use skip and limit" |
| "Idempotent toggle" | "I check if it exists" |
| "Server-side revocation" | "I delete the token from DB" |
| "Aggregation pipeline" | "I use $lookup" |
| "Asset lifecycle management" | "I delete from Cloudinary" |

---

> [!TIP]
> **Interview pro tip:** When asked about any feature, structure your answer as:
> 1. **Schema design** — "Here's how I modeled the data..."
> 2. **API design** — "The endpoint is [METHOD] [path]..."
> 3. **Business logic** — "The key logic is... (toggle, authorization, etc.)"
> 4. **Query pattern** — "I use aggregation because..."
> 5. **Weakness + improvement** — "At scale, I'd change X to Y because..."
