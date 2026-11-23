
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Read the runtime request before entering the handler's error boundary so
  // Next.js Cache Components can mark this route as request-time rendered.
  const { searchParams } = new URL(request.url);

  try {
    const query = searchParams.get("q");

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: "Please enter a search topic" },
        { status: 400 }
      );
    }

    const apiUrl = new URL(
      "https://en.wikipedia.org/w/api.php"
    );

    apiUrl.search = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrlimit: "8",
      prop: "extracts|pageimages|info",
      exintro: "1",
      explaintext: "1",
      exsentences: "5",
      piprop: "thumbnail",
      pithumbsize: "500",
      inprop: "url",
      format: "json",
      origin: "*",
    }).toString();

    const response = await fetch(apiUrl.toString(), {
      headers: {
        "User-Agent": "AI-Knowledge-Vault/1.0",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error("Wikipedia search failed");
    }

    const data = await response.json();

    const pages = Object.values(
      data.query?.pages || {}
    ) as Array<{
      pageid: number;
      title: string;
      extract?: string;
      thumbnail?: { source: string };
      fullurl?: string;
    }>;

    const results = pages.map((page) => ({
      id: page.pageid,
      title: page.title,
      description: page.extract || "No description available.",
      image: page.thumbnail?.source || null,
      url: page.fullurl || 
        `https://en.wikipedia.org/?curid=${page.pageid}`,
    }));

    return NextResponse.json({
      query,
      total: results.length,
      results,
    });

  } catch (error) {
    console.error("Search error:", error);

    return NextResponse.json(
      { error: "Unable to search right now." },
      { status: 500 }
    );
  }
}
