import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Study Library",
  description: "Understand educational topics in Hindi and save study notes for offline reading.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Study Library" },
  applicationName: "AI Study Library",
};

export const viewport: Viewport = { themeColor: "#4f46e5" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
