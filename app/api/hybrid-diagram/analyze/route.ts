
import { GoogleGenAI } from "@google/genai";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const ALLOWED_HOSTS = [
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
  "api.openverse.org"
];

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      ALLOWED_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const imageUrl = body?.image;
    const title = body?.title || "Educational diagram";
    const description = body?.description || "";

    if (
      typeof imageUrl !== "string" ||
      !isAllowedImageUrl(imageUrl)
    ) {
      return Response.json(
        {
          success: false,
          error: "Invalid or unsupported image URL."
        },
        { status: 400 }
      );
    }

    const imageResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "AIKnowledgeVault/1.0"
      }
    });

    if (!imageResponse.ok) {
      throw new Error("Could not download selected image.");
    }

    const contentType =
      imageResponse.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
      throw new Error("Selected URL is not an image.");
    }

    const imageBuffer = await imageResponse.arrayBuffer();

    if (imageBuffer.byteLength > MAX_IMAGE_SIZE) {
      throw new Error("Image is too large. Choose a smaller image.");
    }

    if (imageBuffer.byteLength === 0) {
      throw new Error("Selected image is empty.");
    }

    const base64 = Buffer.from(imageBuffer).toString("base64");
    const imageData = `data:${contentType.split(";")[0]};base64,${base64}`;

    if (body?.imageOnly === true) {
      return Response.json({ success: true, imageData });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          success: false,
          error: "GEMINI_API_KEY is missing."
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are an expert educational diagram analyst.

Analyze the supplied original educational image.

IMAGE TITLE: ${String(title).slice(0, 200)}
IMAGE DESCRIPTION: ${String(description).slice(0, 2000)}

Return accurate educational information in Hindi and English.

IMPORTANT:
- Preserve the meaning of the original image.
- Never invent labels for unclear parts.
- Do not guess coordinates for uncertain structures.
- Explain only what is visibly supported by the image.
- Use simple Hindi suitable for students.
- Include English names in brackets.

Return ONLY valid JSON in this exact structure:

{
  "titleHindi": "हिंदी शीर्षक",
  "titleEnglish": "English title",
  "summary": "सरल हिंदी में संक्षिप्त परिचय",
  "labels": [
    {
      "english": "Part name",
      "hindi": "हिंदी नाम",
      "explanation": "इस भाग का कार्य",
      "x": 50,
      "y": 50
    }
  ],
  "howItWorks": [
    "पहला बिंदु",
    "दूसरा बिंदु",
    "तीसरा बिंदु"
  ],
  "process": [
    "पहला चरण",
    "दूसरा चरण",
    "तीसरा चरण"
  ],
  "keyFacts": [
    "तथ्य 1",
    "तथ्य 2",
    "तथ्य 3"
  ]
}

COORDINATES:
- x and y are percentages from 0 to 100.
- Coordinates indicate approximate positions of visible parts.
- Never pretend coordinates are exact.
- Maximum 8 labels.
- If a part is unclear, omit it.

Return JSON only.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: contentType.split(";")[0],
            data: base64
          }
        }
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 6000
      }
    });

    let raw = response.text || "";

    raw = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end === -1) {
      throw new Error("Gemini returned invalid JSON.");
    }

    const analysis = JSON.parse(raw.slice(start, end + 1)) as {
      titleHindi?: unknown;
      titleEnglish?: unknown;
      summary?: unknown;
      labels: unknown[];
      howItWorks: unknown[];
      process: unknown[];
      keyFacts: unknown[];
    };

    if (
      !Array.isArray(analysis.labels) ||
      !Array.isArray(analysis.howItWorks) ||
      !Array.isArray(analysis.process) ||
      !Array.isArray(analysis.keyFacts)
    ) {
      throw new Error("Gemini returned incomplete analysis.");
    }

    analysis.labels = analysis.labels
      .slice(0, 8)
      .map((rawLabel: unknown) => {
        const label = rawLabel && typeof rawLabel === "object"
          ? rawLabel as Record<string, unknown>
          : {};
        return {
        english: String(label.english || "").slice(0, 100),
        hindi: String(label.hindi || "").slice(0, 100),
        explanation: String(label.explanation || "").slice(0, 500),
        x: Math.max(0, Math.min(100, Number(label.x) || 50)),
        y: Math.max(0, Math.min(100, Number(label.y) || 50))
        };
      });

    return Response.json({
      success: true,
      analysis,
      imageData
    });

  } catch (error) {
    console.error("Hybrid diagram analysis error:", error);

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Image analysis failed."
      },
      { status: 500 }
    );
  }
}
