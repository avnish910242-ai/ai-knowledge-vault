import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://ai-knowledge-vault-lv9n.onrender.com/sitemap.xml",
  };
}