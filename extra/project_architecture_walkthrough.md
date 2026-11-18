# 🎬 Streaming Platform — Complete Architecture Walkthrough (Interview Ready)

> This document walks you through the **entire project architecture** — how a user interacts with it, what happens at every layer, and the technical decisions behind each feature. Use this to explain your project confidently in any interview.

---

## 📌 One-Liner Pitch

> "I built a **production-grade backend for a video streaming platform** (like YouTube's API layer) using **Node.js, Express, MongoDB, and Cloudinary**, with three AI-powered features: thumbnail suggestions via Gemini, transcription via local Whisper, and a multi-strategy recommendation engine."

---

## 🏗️ High-Level Architecture

```mermaid
graph TB
    subgraph Client["🌐 Client (Postman / Frontend)"]
        REQ[HTTP Request]
    end

    subgraph Server["⚙️ Express Server (Port 8000)"]
        MW["Middlewares<br/>CORS · JSON · Cookie Parser · Multer"]
        AUTH["Auth Middleware<br/>JWT Verification"]
        ROUTES["Router Layer<br/>10 Route Files"]
        CTRL["Controller Layer<br/>10 Controllers"]
        SVC["Service Layer<br/>4 Services"]
    end

    subgraph Data["💾 Data & Storage"]
        MONGO["MongoDB Atlas<br/>8 Collections"]
        CLOUD["Cloudinary CDN<br/>Videos · Images"]
    end

    subgraph AI["🤖 AI Services"]
        GEMINI["Google Gemini 2.0 Flash<br/>Thumbnails · Summaries"]
        WHISPER["OpenAI Whisper (Local)<br/>Transcription"]
        FFMPEG["FFmpeg<br/>Frame Extraction · Audio"]
    end

    REQ --> MW --> AUTH --> ROUTES --> CTRL --> SVC
    CTRL --> MONGO
    CTRL --> CLOUD
    SVC --> GEMINI
    SVC --> WHISPER
    SVC --> FFMPEG
    SVC --> MONGO
    SVC --> CLOUD
```

---

## 📂 Project Structure — What Each Folder Does

```
streaming_platform/
├── src/
│   ├── index.js              ← Entry point: loads .env, connects DB, starts server
│   ├── app.js                ← Express app: middlewares + all 10 route mounts
│   ├── constant.js           ← DB_NAME constant
│   ├── db/index.js           ← MongoDB Atlas connection with mongoose
│   ├── models/               ← 8 Mongoose schemas (User, Video, Transcript, etc.)
│   ├── controllers/          ← 10 controller files (business logic)
│   ├── services/             ← 4 service files (AI pipelines, recommendations)
│   ├── routes/               ← 10 route files (endpoint definitions)
│   ├── middlewares/           ← Auth (JWT verification) + Multer (file uploads)
│   └── utils/                ← ApiError, ApiResponse, asyncHandler, Cloudinary
├── scripts/
│   ├── transcribe.py         ← Python Whisper script (called from Node via spawn)
│   └── test_apis.sh          ← Shell script to test all endpoints
├── .venv/                    ← Python virtual environment for Whisper
├── public/temp/              ← Temporary files during processing (auto-cleaned)
└── .env                      ← All secrets (Mongo, JWT, Cloudinary, Gemini)
```

---

## 🚀 The User Journey — Step by Step

### 🔵 Step 1: Server Starts

> "When I run `npm run dev`, here's what happens..."

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Index as index.js
    participant DB as MongoDB Atlas
    participant App as Express App

    Dev->>Index: npm run dev (nodemon)
    Index->>Index: dotenv.config() loads .env
    Index->>DB: connectDB() → mongoose.connect()
    DB-->>Index: ✅ Connected to cluster
    Index->>App: app.listen(8000)
    App-->>Dev: 🟢 Server running at port 8000
```

**What happens internally:**
1. [`index.js`](file:///Users/jeel/Desktop/streaming_platform/src/index.js) loads environment variables via `dotenv`
2. Calls [`connectDB()`](file:///Users/jeel/Desktop/streaming_platform/src/db/index.js) — an async function that connects to MongoDB Atlas using `mongoose.connect()`
3. On success, starts Express on port 8000
4. On failure, exits with `process.exit(1)` — fail-fast pattern

**Interview point:** *"The DB is on another continent, so every DB call is async/await. I separated the DB connection into its own module for clean organization."*

---

### 🔵 Step 2: Request Hits the Server

Every request passes through this middleware chain in [`app.js`](file:///Users/jeel/Desktop/streaming_platform/src/app.js):

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | `cors()` | Allows cross-origin requests. `credentials: true` so cookies work. |
| 2 | `express.json({ limit: "16kb" })` | Parses JSON bodies, caps at 16KB to prevent abuse. |
| 3 | `express.urlencoded({ extended: true })` | Parses form data. |
| 4 | `express.static("public")` | Serves static files (temp frames, etc.). |
| 5 | `cookieParser()` | Parses cookies so we can read JWT tokens from `req.cookies`. |

Then the request is routed to one of **10 route modules**, all prefixed with `/api/v1/`:

| Route Prefix | Module | Auth? |
|-------------|--------|-------|
| `/api/v1/users` | User CRUD, Auth | Mixed |
| `/api/v1/videos` | Video CRUD | ✅ |
| `/api/v1/comments` | Comments | ✅ |
| `/api/v1/likes` | Like/Unlike | ✅ |
| `/api/v1/playlists` | Playlist CRUD | ✅ |
| `/api/v1/tweets` | Community posts | ✅ |
| `/api/v1/subscriptions` | Subscribe/Unsubscribe | ✅ |
| `/api/v1/ai` | AI Thumbnails | ✅ |
| `/api/v1/ai/transcripts` | Transcription + Search | ✅ |
| `/api/v1/recommendations` | Trending, For-You, Similar, Feed | Mixed |

---

### 🔵 Step 3: User Registers → `POST /api/v1/users/register`

```mermaid
sequenceDiagram
    participant Client
    participant Multer as Multer Middleware
    participant Ctrl as User Controller
    participant Cloud as Cloudinary
    participant DB as MongoDB

    Client->>Multer: POST with avatar + coverImage files
    Multer->>Multer: Saves files to public/temp/
    Multer->>Ctrl: req.files populated
    Ctrl->>Ctrl: Validate all fields present
    Ctrl->>DB: Check if user exists ($or: email/username)
    DB-->>Ctrl: No duplicate found
    Ctrl->>Cloud: Upload avatar
    Cloud-->>Ctrl: avatar URL
    Ctrl->>Cloud: Upload coverImage (optional)
    Cloud-->>Ctrl: coverImage URL
    Ctrl->>DB: User.create({...})
    Note over DB: pre("save") hook → bcrypt.hash(password, 10)
    DB-->>Ctrl: User document created
    Ctrl->>DB: findById().select("-password -refreshToken")
    Ctrl-->>Client: 201 { user data without password }
```

**Key technical details:**

1. **Multer middleware** ([`multer.middleware.js`](file:///Users/jeel/Desktop/streaming_platform/src/middlewares/multer.middleware.js)) — handles `multipart/form-data`, saves files to `public/temp/` before uploading to Cloudinary
2. **Validation** — checks all fields are non-empty using `.some(field => field?.trim() === "")`
3. **Duplicate check** — `User.findOne({ $or: [{ email }, { username }] })` — checks BOTH in one query
4. **Cloudinary upload** ([`cloudinary.js`](file:///Users/jeel/Desktop/streaming_platform/src/utils/cloudinary.js)) — uploads with `resource_type: "auto"`, then **deletes the local file** via `fs.unlinkSync()`
5. **Password hashing** — Mongoose `pre("save")` hook on the User model automatically hashes with bcrypt (salt round 10) before saving. Only triggers if `this.isModified("password")` — so updating email won't re-hash.
6. **Response** — returns user data WITHOUT password and refreshToken using `.select("-password -refreshToken")`

---

### 🔵 Step 4: User Logs In → `POST /api/v1/users/login`

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as User Controller
    participant DB as MongoDB
    participant JWT as JWT Library

    Client->>Ctrl: { email/username, password }
    Ctrl->>DB: findOne({ $or: [email, username] })
    DB-->>Ctrl: User document (with hashed password)
    Ctrl->>Ctrl: user.isPasswordCorrect(password)
    Note over Ctrl: bcrypt.compare(plain, hashed)
    Ctrl->>JWT: generateAccessToken()
    Note over JWT: Payload: {id, username, email, fullname}<br/>Secret: ACCESS_TOKEN_SECRET<br/>Expires: 1 day
    Ctrl->>JWT: generateRefreshToken()
    Note over JWT: Payload: {id}<br/>Secret: REFRESH_TOKEN_SECRET<br/>Expires: 7 days
    Ctrl->>DB: Save refreshToken to user document
    Ctrl-->>Client: 200 + Set-Cookie headers + JSON body
```

**The Dual JWT System:**

| Token | Purpose | Lifetime | Storage | Payload |
|-------|---------|----------|---------|---------|
| **Access Token** | Authenticate each API request | 1 day | HttpOnly Cookie + JSON body | `{ id, username, email, fullname }` |
| **Refresh Token** | Get a new access token without re-login | 7 days | HttpOnly Cookie + DB | `{ id }` only |

**Cookie security options:**
```javascript
{
    httpOnly: true,     // JavaScript can't access → prevents XSS
    secure: true,       // Only sent over HTTPS (in production)
    sameSite: "strict", // Not sent in cross-site requests → prevents CSRF
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
}
```

**Interview point:** *"Why two tokens? The access token is short-lived so if it leaks, the damage window is small. The refresh token is long-lived but stored as HttpOnly cookie — JavaScript can never access it, so XSS attacks can't steal it. And I store the refresh token in the DB too — on every refresh, I compare the incoming token with what's in the DB. If they don't match, someone may have stolen the old one, so I reject it."*

---

### 🔵 Step 5: Auth Middleware Protects Routes

Every protected route passes through [`verifyJWT`](file:///Users/jeel/Desktop/streaming_platform/src/middlewares/auth.middleware.js):

```
Request → Extract token (cookie OR Authorization header) → jwt.verify() → Find user in DB → Attach to req.user → next()
```

**It checks two places for the token:**
1. `req.cookies.accessToken` — for browser/cookie-based clients
2. `req.header("Authorization").replace("Bearer ", "")` — for mobile/Postman clients

If valid, the **entire user document** (minus password & refreshToken) is attached to `req.user` — so every downstream controller has user info without another DB query.

---

### 🔵 Step 6: Token Refresh Flow → `POST /api/v1/users/refresh-token`

```mermaid
sequenceDiagram
    participant Client
    participant Ctrl as Controller
    participant DB as MongoDB

    Client->>Ctrl: Send refreshToken (cookie or body)
    Ctrl->>Ctrl: jwt.verify(token, REFRESH_SECRET)
    Ctrl->>DB: Find user by decoded.id
    Ctrl->>Ctrl: Compare DB refreshToken === incoming token
    Note over Ctrl: If mismatch → reject (token rotation security)
    Ctrl->>Ctrl: Generate NEW access + refresh tokens
    Ctrl->>DB: Save NEW refreshToken (old one is now invalid)
    Ctrl-->>Client: New token pair in cookies + JSON
```

**This is single-use rotation** — the old refresh token becomes invalid after use. If an attacker replays it, the comparison fails.

---

### 🔵 Step 7: User Logs Out → `POST /api/v1/users/logout`

1. `$unset: { refreshToken: 1 }` — removes the field from the DB entirely
2. Clears both cookies with `maxAge: 0` — browser immediately deletes them
3. Even if someone has the old tokens, they won't work because:
   - Access token will expire naturally (1 day max)
   - Refresh token is gone from DB — comparison will fail

---

## 🎥 Core Features — How Each One Works

### Feature 1: Video Upload & Management

**Upload:** `POST /api/v1/videos`

```mermaid
graph LR
    A["Client uploads<br/>video + thumbnail"] --> B["Multer saves<br/>to public/temp/"]
    B --> C["Upload to<br/>Cloudinary CDN"]
    C --> D["Save URL + metadata<br/>to MongoDB"]
    D --> E["Return video<br/>document"]
```

- Videos and thumbnails go to Cloudinary (CDN) — not stored on server
- Duration comes from Cloudinary's response (`videoFile.duration`)
- Tags are parsed from comma-separated string or JSON array
- `ispublished: true` by default — owner can toggle

**View video:** `GET /api/v1/videos/:videoId`
- Atomically increments `views` with `$inc: { views: 1 }`
- Adds to user's `watchHistory` with `$addToSet` (no duplicates)
- Returns video with owner details + like count + `isLiked` flag — all in **one aggregation pipeline**

**Delete video:** Full cascade cleanup:
```
Cloudinary: destroy video (resource_type: "video") + destroy thumbnail (image)
MongoDB: Comment.deleteMany + Like.deleteMany + User.updateMany($pull watchHistory)
MongoDB: Video.findByIdAndDelete
```
*"No orphaned data anywhere — not on the CDN, not in the database."*

---

### Feature 2: Channel Profile (MongoDB Aggregation Pipeline)

`GET /api/v1/users/c/:username` — Uses a **5-stage aggregation pipeline:**

```mermaid
graph TD
    A["$match<br/>Find user by username"] --> B["$lookup #1<br/>Join subscriptions where user = channel<br/>→ Gets SUBSCRIBERS"]
    B --> C["$lookup #2<br/>Join subscriptions where user = subscriber<br/>→ Gets SUBSCRIBED TO"]
    C --> D["$addFields<br/>subscribersCount = $size(subscribers)<br/>channelSubscribedToCount = $size(subscribedTo)<br/>isSubscribed = check if current user is in subscribers"]
    D --> E["$project<br/>Select only needed fields"]
```

**Interview point:** *"I used two lookups on the SAME subscriptions collection but with different join conditions — `foreignField: 'channel'` gives me subscribers, `foreignField: 'subscriber'` gives me who I'm subscribed to. And `$addFields` with `$in` checks if the current viewer is subscribed, so the frontend can show the subscribe/unsubscribe button."*

---

### Feature 3: Watch History (Nested Aggregation)

`GET /api/v1/users/watch-history` — **Sub-pipeline inside $lookup:**

```
User → $lookup videos (from watchHistory array)
         └── Inside that: $lookup users (get video owner)
              └── $project only fullname, username, avatar
         └── $addFields: owner = $first of owner array
```

**Why `new mongoose.Types.ObjectId(req.user._id)`?** — In aggregation pipeline, Mongoose doesn't auto-cast strings to ObjectIds like it does in `findById()`. We have to manually convert.

---

## 🤖 AI Feature 1: Thumbnail Suggestions

### Pipeline Overview

```mermaid
sequenceDiagram
    participant Creator
    participant API as POST /ai/thumbnails/:videoId
    participant DB as MongoDB
    participant Cloud as Cloudinary
    participant FFMPEG as FFmpeg
    participant Gemini as Gemini 2.0 Flash

    Creator->>API: "Suggest thumbnails for my video"
    API->>DB: Verify ownership
    API->>Cloud: Download video to temp folder
    API->>FFMPEG: Extract 8 frames (skip first/last 5%)
    FFMPEG-->>API: 8 JPEG frames
    
    loop For each frame
        API->>Cloud: Upload frame to Cloudinary
    end
    
    API->>Gemini: Send all frames as base64 + prompt
    Note over Gemini: Multi-modal analysis:<br/>Visual Appeal · Composition<br/>Clarity · Emotion · Action
    Gemini-->>API: Top 3 ranked suggestions (JSON)
    API->>DB: Save suggestions to video.thumbnailSuggestions
    API-->>Creator: Return 3 suggestions with URLs, scores, analysis
```

### Technical Deep Dive

| Step | What Happens | Code Location |
|------|-------------|---------------|
| Download | `http.get()` with redirect handling | [`thumbnail.service.js`](file:///Users/jeel/Desktop/streaming_platform/src/services/thumbnail.service.js#L21-L52) |
| Frame extraction | Skip first/last 5% duration, extract N evenly-spaced frames | [`thumbnail.service.js`](file:///Users/jeel/Desktop/streaming_platform/src/services/thumbnail.service.js#L62-L112) |
| Frame count | `<30s → 5 frames`, `<120s → 8 frames`, `else → 10 frames` | [`thumbnail.service.js`](file:///Users/jeel/Desktop/streaming_platform/src/services/thumbnail.service.js#L193) |
| Gemini prompt | Multi-modal: text + all images as base64 `inlineData` | [`gemini.service.js`](file:///Users/jeel/Desktop/streaming_platform/src/services/gemini.service.js#L24-L91) |
| Response format | `responseMimeType: "application/json"` forces structured output | [`gemini.service.js`](file:///Users/jeel/Desktop/streaming_platform/src/services/gemini.service.js#L9) |
| Cleanup | `finally` block deletes all temp files even if errors occur | [`thumbnail.service.js`](file:///Users/jeel/Desktop/streaming_platform/src/services/thumbnail.service.js#L262-L265) |

**Apply a suggestion:** `PATCH /ai/thumbnails/:videoId` — Deletes old thumbnail from Cloudinary, sets the chosen frame URL as the new thumbnail.

---

## 🤖 AI Feature 2: Video Transcription

### Pipeline Overview

```mermaid
sequenceDiagram
    participant Creator
    participant API as POST /ai/transcripts/:videoId
    participant DB as MongoDB
    participant FFMPEG as FFmpeg
    participant Python as Python (child_process.spawn)
    participant Whisper as Whisper Model (Local)

    Creator->>API: "Transcribe my video" { model: "base" }
    API->>DB: Create transcript doc (status: "processing")
    API->>DB: Download video from Cloudinary
    API->>FFMPEG: Extract audio (16kHz mono MP3)
    FFMPEG-->>API: audio.mp3
    API->>Python: spawn(.venv/bin/python3, transcribe.py, audio.mp3)
    Python->>Whisper: Load model + transcribe
    Whisper-->>Python: { text, segments, language, duration }
    Python-->>API: JSON on stdout
    API->>DB: Update transcript (status: "completed")
    API->>DB: Video.hasTranscript = true
    API-->>Creator: Full transcript with segments
```

### The Node ↔ Python Bridge

```javascript
// Node.js spawns a Python child process
const childProcess = spawn(VENV_PYTHON, [TRANSCRIBE_SCRIPT, audioPath, "--model", model]);

// Capture stdout (transcript JSON) and stderr (errors) separately
childProcess.stdout.on("data", (data) => stdout += data.toString());
childProcess.stderr.on("data", (data) => stderr += data.toString());

// On exit, parse the JSON output
childProcess.on("close", (code) => {
    const result = JSON.parse(stdout);  // ← This is the transcript
});
```

**Why Whisper locally instead of OpenAI API?**
- **Cost:** Zero per-minute cost (free forever)
- **Privacy:** Audio never leaves the server
- **Flexibility:** Choose model size — `tiny` for speed, `large` for accuracy

### Transcript Search: `GET /ai/transcripts/search?q=keyword`

```mermaid
graph TD
    A["User searches 'machine learning'"] --> B["MongoDB $text search<br/>on fullText index"]
    B --> C["$meta textScore<br/>for relevance ranking"]
    C --> D["$lookup video + owner details"]
    D --> E["$filter segments<br/>using $regexMatch"]
    E --> F["Return: video info +<br/>matching segments with timestamps"]
```

This is like **YouTube's search-within-video** — you search a word and get the exact timestamp where it appears.

### AI Summary: `POST /ai/transcripts/:videoId/summary`

Chains the transcript into Gemini to generate:
- **Summary** (2-4 sentences)
- **Key Topics** (3-7 topics)
- **Chapter Markers** (timestamp + title) — like YouTube chapters

---

## 🤖 AI Feature 3: Recommendation Engine

### 4 Strategies

```mermaid
graph TB
    subgraph S1["Strategy 1: Trending"]
        T1["Score = views×1 + likes×3 + comments×2 − age_days×0.5"]
        T2["No auth needed (cold-start friendly)"]
    end

    subgraph S2["Strategy 2: Personalized (For You)"]
        P1["Signal A: Videos by creators you watched"]
        P2["Signal B: Collaborative filtering<br/>(users who liked same videos also liked...)"]
        P3["Falls back to trending if no history"]
    end

    subgraph S3["Strategy 3: Similar Videos"]
        S3A["Tag matching (weight: 5x)"]
        S3B["Same creator (weight: 2x)"]
        S3C["Title keyword overlap"]
    end

    subgraph S4["Strategy 4: Subscription Feed"]
        SF["Latest videos from subscribed channels"]
    end
```

### Trending Score Formula

```
trendingScore = (views × 1.0) + (likes × 3.0) + (comments × 2.0) − (ageInDays × 0.5)
```

| Weight | Reasoning |
|--------|-----------|
| Views × 1.0 | Passive engagement — lowest signal |
| Likes × 3.0 | Intentional action — strongest signal |
| Comments × 2.0 | Active engagement — strong signal |
| Age × -0.5 | Decay — fresh content can surface even with fewer views |

### Collaborative Filtering (Personalized Feed)

```mermaid
graph LR
    A["You liked<br/>Video A, B, C"] --> B["Find users who<br/>ALSO liked A, B, C<br/>(cap at 50 users)"]
    B --> C["What else did<br/>THOSE users like?"]
    C --> D["Filter out<br/>videos you've<br/>already watched"]
    D --> E["Score: collaborative=2<br/>+ watched_creator=1<br/>+ views×0.001"]
    E --> F["If results < limit,<br/>pad with trending"]
```

**Interview point:** *"The cap of 50 similar users prevents expensive fan-out queries. And if personalized results are too few — like a new user who has only watched 2 videos — I pad the remaining slots with trending so the page is never empty."*

---

## 🛡️ Error Handling Architecture

### The Three Layers

| Layer | Implementation | File |
|-------|---------------|------|
| **Custom Error Class** | `ApiError extends Error` with statusCode, errors array | [`ApiError.js`](file:///Users/jeel/Desktop/streaming_platform/src/utils/ApiError.js) |
| **Async Wrapper** | `asyncHandler` wraps every controller — catches Promise rejections, calls `next(err)` | [`asyncHandler.js`](file:///Users/jeel/Desktop/streaming_platform/src/utils/asyncHandler.js) |
| **Global Error Handler** | Last middleware in Express — converts `ApiError` to JSON | [`app.js`](file:///Users/jeel/Desktop/streaming_platform/src/app.js#L41-L52) |

```javascript
// Every controller is wrapped:
const myController = asyncHandler(async (req, res) => {
    // If this throws, asyncHandler catches it and passes to global error handler
    throw new ApiError(400, "Bad request");
});

// Global handler at the bottom of app.js:
app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
        errors: err.errors,
        stack: process.env.NODE_ENV !== "production" ? err.stack : undefined
    });
});
```

**Interview point:** *"I never use try-catch in controllers. The asyncHandler utility wraps every controller in Promise.resolve().catch(next), so any thrown error — whether it's my ApiError or an unhandled rejection — automatically flows to the global error handler. It keeps every controller clean and consistent."*

---

## 📊 Data Models — Schema Design

### 8 Collections

```mermaid
erDiagram
    USER {
        string username UK
        string email UK
        string fullname
        string avatar
        string coverImage
        string password
        string refreshToken
        array watchHistory
    }

    VIDEO {
        string videoFile
        string thumbnail
        string title
        string description
        number duration
        number views
        boolean ispublished
        array tags
        array thumbnailSuggestions
        boolean hasTranscript
        ref owner
    }

    TRANSCRIPT {
        string fullText
        array segments
        string language
        number duration
        string summary
        array chapters
        array keyTopics
        string status
        string modelUsed
        ref video
    }

    COMMENT {
        string content
        ref video
        ref owner
    }

    LIKE {
        ref video
        ref comment
        ref tweet
        ref likeby
    }

    PLAYLIST {
        string name
        string description
        array videos
        ref owner
    }

    SUBSCRIPTION {
        ref subscriber
        ref channel
    }

    TWEET {
        string content
        ref owner
    }

    USER ||--o{ VIDEO : "owns"
    USER ||--o{ COMMENT : "writes"
    USER ||--o{ LIKE : "likes"
    USER ||--o{ PLAYLIST : "creates"
    USER ||--o{ TWEET : "posts"
    USER ||--o{ SUBSCRIPTION : "subscribes"
    VIDEO ||--o{ COMMENT : "has"
    VIDEO ||--o{ LIKE : "has"
    VIDEO ||--|| TRANSCRIPT : "has one"
    PLAYLIST }o--o{ VIDEO : "contains"
```

### Key Design Decisions

| Decision | Reasoning |
|----------|-----------|
| **Like model is polymorphic** — has `video`, `comment`, AND `tweet` fields | One Like model handles all like-able entities. Only one of the three refs is set per document. |
| **watchHistory is an array in User** | Using `$addToSet` for dedup. If it grew huge, you'd move to a separate collection. |
| **Transcript is a separate collection** (not embedded in Video) | Transcripts can be huge (thousands of segments). Separate collection means full-text index works natively. |
| **thumbnailSuggestions embedded in Video** | Small, bounded array (max 3 items). No need for a separate collection. |
| **mongoose-aggregate-paginate-v2** on Video & Comment | Enables cursor-based pagination on aggregation pipelines — essential for infinite scroll. |

---

## 🔧 Utility Patterns

### Standardized API Response

```javascript
// Every success response follows this structure:
class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }
}
```

### Cloudinary Upload + Local Cleanup

```javascript
const uploadOnCloudinary = async (localFilePath) => {
    const response = await cloudinary.uploader.upload(localFilePath, {
        resource_type: "auto"  // auto-detect: image, video, raw
    });
    fs.unlinkSync(localFilePath);  // ← Always clean up local file
    return response;
};
```

If upload fails, the `catch` block still deletes the local file — no orphaned temp files.

---

## 💡 What I'd Add for Production (Scaling Answers)

| Concern | Solution |
|---------|----------|
| AI pipelines blocking API | **BullMQ** job queue — thumbnail & transcription jobs run asynchronously |
| Repeated recommendation queries | **Redis** caching with TTL for trending & personalized feeds |
| Whisper is CPU-intensive | Move to a **separate worker service** that scales independently |
| Video processing at scale | **AWS Lambda** or **Cloud Functions** for frame extraction |
| Real-time features | **Socket.io** for live comments, notifications |
| Search at scale | **Elasticsearch** instead of MongoDB `$text` for better full-text search |

---

## 🗣️ How to Present This in an Interview

### Opening (30 seconds)
> "I built a production-grade backend for a video streaming platform using Node.js, Express, MongoDB, and Cloudinary. It handles the full lifecycle — auth, video upload, social features — plus three AI features that go beyond basic CRUD."

### Walk Through the Journey (2-3 minutes)
> "When a user hits the server, the request goes through CORS, JSON parser, cookie parser. If the route is protected, the JWT auth middleware verifies the token — checks cookies first, then Authorization header. The User model handles password hashing via a pre-save hook with bcrypt, and token generation is built into the schema methods."

### Highlight What's Interesting (2-3 minutes)
> "But what makes this project stand out are three things..."
> 1. **AI Thumbnails** — FFmpeg extracts frames, Gemini analyzes them multi-modally
> 2. **Local Whisper Transcription** — Node spawns a Python process, captures JSON from stdout
> 3. **4-Strategy Recommendation Engine** — trending with decay scoring, collaborative filtering, tag-based similarity, subscription feed

### Handle Follow-ups
Use the deep-dive sections above for questions about:
- Auth/security → Dual JWT + token rotation + HttpOnly cookies
- Data modeling → Why certain schemas are embedded vs referenced
- Scaling → Job queues, Redis, separate workers
- Error handling → asyncHandler + global error handler pattern
- Why MongoDB → Document-oriented data, aggregation pipelines for recommendations

---

> [!TIP]
> **Practice saying these flows out loud.** The best candidates don't just know the code — they can narrate the request journey like a story. Start with "when a user does X" and walk through each layer.
