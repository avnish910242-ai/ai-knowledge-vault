# AI Study Library

A student study workspace built with Next.js. Search a topic for a Hindi explanation, view a sourced educational image or an AI-generated 2D SVG fallback, and save the complete topic for offline reading.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Set `GEMINI_API_KEY` in `.env.local` for explanations, diagram analysis and generated SVG diagrams. The key is read by server routes and is not included in client code.

## Study library and offline use

Saved topics are stored in this browser's IndexedDB, including their explanation, subject, diagram analysis, image data and attribution. The library does not sync to other browsers or devices. A saved topic can be read offline after the app shell has been loaded once. Search and Gemini features need a connection.

The service worker caches the app shell and Next.js static assets. External 3D models are not currently provided; diagrams are identified as 2D images and are never presented as interactive models. Subject suggestions use local topic keywords and can be corrected from **Subjects**.

## Existing routes

- `/api/ask` — Gemini educational explanation
- `/api/hybrid-diagram` — Wikimedia Commons and Openverse search with Gemini relevance checks
- `/api/hybrid-diagram/analyze` — image analysis and local image copy for offline saving
- `/api/diagram` — sanitized Gemini SVG diagram fallback
- `/api/search` — Wikipedia search endpoint retained for compatibility
