
import { GoogleGenAI } from "@google/genai";
import DOMPurify from "isomorphic-dompurify";

const MAX_QUESTION_LENGTH = 300;
const MAX_SVG_LENGTH = 500000;

function cleanSvg(raw: string): string {
  let svg = raw
    .replace(/```(?:svg|xml)?/gi, "")
    .replace(/```/g, "")
    .trim();

  // Extract the complete SVG document.
  const match = svg.match(/<svg\b[\s\S]*?<\/svg>/i);

  if (!match) {
    throw new Error("Gemini did not return a valid SVG.");
  }

  svg = match[0].trim();

  if (svg.length > MAX_SVG_LENGTH) {
    throw new Error("Generated diagram is too large.");
  }

  // Ensure a fixed canvas.
  svg = svg.replace(/^<svg\b[^>]*>/i, (openingTag) => {
    let tag = openingTag;

    if (!/\bwidth\s*=/.test(tag)) {
      tag = tag.replace("<svg", '<svg width="1600"');
    }

    if (!/\bheight\s*=/.test(tag)) {
      tag = tag.replace("<svg", '<svg height="1100"');
    }

    if (!/\bviewBox\s*=/.test(tag)) {
      tag = tag.replace("<svg", '<svg viewBox="0 0 1600 1100"');
    }

    return tag;
  });

  // Sanitize SVG.
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: {
      svg: true,
      svgFilters: true
    },
    FORBID_TAGS: [
      "script",
      "foreignObject",
      "iframe",
      "object",
      "embed",
      "audio",
      "video"
    ],
    FORBID_ATTR: [
      "onload",
      "onclick",
      "onerror",
      "onmouseover"
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    RETURN_TRUSTED_TYPE: false
  }).trim();

  if (!/<svg\b/i.test(clean) || !/<\/svg>/i.test(clean)) {
    throw new Error("SVG sanitization failed.");
  }

  // Do not accept an empty white SVG.
  const hasDrawing = /<(path|rect|circle|ellipse|line|polyline|polygon|text|use)\b/i.test(clean);

  if (!hasDrawing) {
    throw new Error("Gemini created an empty diagram. Please generate again.");
  }

  return clean;
}


function buildPrompt(question: string): string {
  return `
You are a professional educational infographic designer,
scientific illustrator and expert SVG artist.

YOUR TASK:
Create a beautiful, highly readable educational infographic
for the following topic:

TOPIC: ${question}

The final result must look like a professionally designed
school textbook infographic, not a basic computer flowchart.

==============================
CANVAS AND DESIGN
==============================

- SVG width: 1600
- SVG height: 1100
- viewBox: 0 0 1600 1100
- White background.
- Use the entire canvas.
- Landscape educational poster layout.
- Bright, attractive, professional colours.
- Thick clean outlines.
- Rounded information boxes.
- Balanced spacing.
- High visual quality.

==============================
1. LARGE TITLE
==============================

At the top create a beautiful dark-blue rounded title banner.

- Main title in Hindi.
- English title below it in brackets.
- Large bold white Hindi text.
- Yellow English subtitle.
- Title font size: 48px or larger.

==============================
2. MAIN ILLUSTRATION
==============================

- Draw one large, recognizable and detailed illustration.
- The illustration should occupy most of the central area.
- Use realistic educational proportions.
- Use bright, clearly distinguishable colours.
- Use SVG paths, curves, shapes and gradients.
- Add visible directional arrows where required.
- Do not use generic empty boxes instead of illustrations.
- Never make the main illustration tiny.
- Keep all important parts clearly separated.

For human anatomy:
- Draw recognizable anatomical structures.
- Use blue for deoxygenated blood where relevant.
- Use red for oxygenated blood where relevant.
- Show the actual anatomical parts.
- Add accurate labels.

For physics:
- Draw the actual physical setup and forces.

For biology:
- Draw actual cells, organs or biological structures.

For geography:
- Draw recognizable maps or geographical structures.

For history:
- Create a clear visual timeline with important events.

For computer science:
- Draw actual computer architecture and connections.

Adapt the illustration to the requested topic.

==============================
3. LABELS AND CALLOUTS
==============================

- Place labels on both sides of the main illustration.
- Use Hindi names first.
- Show English names in brackets.
- Connect each label to the correct part using arrows.
- Use coloured rounded label boxes.
- Use black, bold, readable text.
- Label font size: 25px or larger.
- Keep arrows away from text.
- Do not allow arrows to cross unnecessarily.
- Avoid overlapping labels.
- Use a maximum of 8 important labels.
- Never put labels outside the canvas.

==============================
4. EXPLANATION SECTION
==============================

Create a large explanation panel at the bottom.

Divide it into three sections:

LEFT:
- Heading: मुख्य कार्य (How It Works)
- Explain the topic in simple Hindi.
- Use 3 short bullet points.

CENTER:
- Heading: प्रक्रिया (Process)
- Show the sequence using colourful connected boxes.
- Use clear arrows between steps.
- Use short Hindi labels.

RIGHT:
- Heading: महत्वपूर्ण तथ्य (Key Facts)
- Include 3 important facts.
- Use green check marks.
- Use simple Hindi.

==============================
5. TYPOGRAPHY
==============================

- Hindi must be readable.
- Use Noto Sans Devanagari as preferred font.
- Use Arial or sans-serif as fallback.
- Main title: 48px or larger.
- Section headings: 30px or larger.
- Labels: 25px or larger.
- Explanations: 22px or larger.
- Use bold text for important terms.
- Use dark text on light backgrounds.
- Do not use tiny text.

==============================
6. STRICT QUALITY RULES
==============================

Before returning the SVG, verify:

- The main illustration is large and recognizable.
- Every label points to the correct object.
- Hindi and English names are readable.
- No text overlaps another text.
- No arrows cover important labels.
- No objects are cut off.
- No important content is outside the canvas.
- The bottom explanation panel is visible.
- The composition is balanced and attractive.
- Scientific facts are accurate.
- There is no empty white canvas.

Do not invent scientific facts.
If a detail is uncertain, omit it rather than guessing.

==============================
7. SVG OUTPUT RULES
==============================

- Return ONLY valid SVG.
- Start with <svg and end with </svg>.
- Include width="1600" height="1100".
- Include viewBox="0 0 1600 1100".
- Include a white background rectangle.
- Use actual visible SVG elements.
- Use SVG text elements for labels.
- Use explicit coordinates.
- Use simple SVG shapes and paths.
- Do not use scripts.
- Do not use foreignObject.
- Do not use external images or URLs.
- Avoid complex filters.
- Do not return Markdown.
- Do not explain the output outside SVG.

FINAL REQUIREMENT:
The result must visually resemble a colourful,
high-quality Hindi-English educational infographic poster,
with a large central illustration, labelled parts,
arrows and a clear bottom explanation section.
`;
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body?.question;

    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      return Response.json(
        { success: false, error: "Please enter a topic." },
        { status: 400 }
      );
    }

    if (question.trim().length > MAX_QUESTION_LENGTH) {
      return Response.json(
        { success: false, error: "Topic must be under 300 characters." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { success: false, error: "GEMINI_API_KEY is missing." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: buildPrompt(question.trim()),
      config: {
        temperature: 0.2,
        maxOutputTokens: 16000
      }
    });

    const rawSvg = response.text || "";

    if (!rawSvg.trim()) {
      throw new Error("Gemini returned an empty response.");
    }

    const svg = cleanSvg(rawSvg);

    const image =
      "data:image/svg+xml;base64," +
      Buffer.from(svg, "utf8").toString("base64");

    return Response.json({
      success: true,
      image,
      svg,
      title: question.trim(),
      source: "AI-generated SVG",
      credit: "Generated using Gemini AI"
    });

  } catch (error) {
    console.error("Diagram generation error:", error);

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Diagram generate nahi ho paya."
      },
      { status: 500 }
    );
  }
}
