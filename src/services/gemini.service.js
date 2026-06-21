import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the Gemini client — uses free tier (Gemini 2.0 Flash)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4, // lower temperature for more consistent scoring
    },
});

/**
 * Analyze an array of video frame images and rank them as potential thumbnails.
 *
 * @param {Array<{buffer: Buffer, mimeType: string, timestamp: number}>} frames
 *   Each element contains the raw image buffer, its MIME type, and the
 *   timestamp (in seconds) where the frame was extracted.
 * @param {string} videoTitle - The title of the video for context.
 * @param {string} videoDescription - The description of the video for context.
 * @returns {Promise<Array>} Top 3 ranked suggestions with scores and analysis.
 */
const analyzeThumbnailCandidates = async (frames, videoTitle = "", videoDescription = "") => {
    // Build the multi-modal parts array: text prompt + all images
    const imageParts = frames.map((frame, index) => ({
        inlineData: {
            data: frame.buffer.toString("base64"),
            mimeType: frame.mimeType || "image/jpeg",
        },
    }));

    const prompt = `You are a professional YouTube thumbnail analyst and designer.
I am giving you ${frames.length} frames extracted from a video.
${videoTitle ? `Video title: "${videoTitle}"` : ""}
${videoDescription ? `Video description: "${videoDescription}"` : ""}

Analyze each frame (numbered 0 to ${frames.length - 1} in the order provided) and evaluate them as potential video thumbnails.

Score each frame from 1 to 10 on these criteria:
- **Visual Appeal**: Colors, contrast, brightness, overall attractiveness
- **Composition**: Rule of thirds, leading lines, framing, balance
- **Clarity**: Sharpness, focus, no motion blur
- **Emotion/Engagement**: Facial expressions, body language, human presence
- **Action/Interest**: Dynamic content, interesting subject matter

Then select the TOP 3 frames that would make the best thumbnails.

For each of the top 3, provide:
1. The frame index (0-based)
2. An overall score (weighted average, 1-10, one decimal)
3. A brief analysis explaining WHY this frame works as a thumbnail (2-3 sentences max)
4. A suggested clickable title overlay text for the thumbnail (short, engaging, 3-7 words)

Return ONLY valid JSON in this exact format:
{
  "suggestions": [
    {
      "frameIndex": 0,
      "score": 9.2,
      "analysis": "Strong composition with clear subject...",
      "suggestedText": "The Ultimate Guide to..."
    }
  ]
}

Order the suggestions array by score descending (best first). Return exactly 3 suggestions.
If fewer than 3 frames are provided, return as many as available.`;

    try {
        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response
        const parsed = JSON.parse(text);

        // Attach timestamp info from the original frames
        if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
            parsed.suggestions = parsed.suggestions.map((suggestion) => ({
                ...suggestion,
                timestamp: frames[suggestion.frameIndex]?.timestamp || 0,
            }));
        }

        return parsed.suggestions || [];
    } catch (error) {
        console.error("Gemini analysis error:", error);
        throw new Error(`Gemini thumbnail analysis failed: ${error.message}`);
    }
};

export { analyzeThumbnailCandidates };
