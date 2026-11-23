import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://ai-knowledge-vault-lv9n.onrender.com",
      lastModified: new Date(),
    },
  ];
}