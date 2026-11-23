
"use client";
/* eslint-disable @next/next/no-img-element -- Generated SVG data URLs are displayed and downloaded directly. */

import { useRef, useState } from "react";

interface DiagramViewerProps {
  image: string;
  svg?: string;
  title?: string;
}

export default function DiagramViewer({
  image,
  svg,
  title = "Educational Diagram"
}: DiagramViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function downloadSVG() {
    if (!svg) return;

    const blob = new Blob([svg], {
      type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "educational-diagram.svg";
    link.click();

    URL.revokeObjectURL(url);
  }

  function downloadPNG() {
    if (!svg) return;

    const blob = new Blob([svg], {
      type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = 3200;
      canvas.height = 2200;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((png) => {
        if (png) {
          const pngUrl = URL.createObjectURL(png);
          const link = document.createElement("a");

          link.href = pngUrl;
          link.download = "educational-diagram.png";
          link.click();

          URL.revokeObjectURL(pngUrl);
        }

        URL.revokeObjectURL(url);
      }, "image/png");
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError(true);
    };

    img.src = url;
  }

  async function fullscreen() {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setError(true);
    }
  }

  return (
    <section className="w-full space-y-3">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">
          {title}
        </h2>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            className="rounded-lg border px-3 py-2"
            aria-label="Zoom out"
          >
            −
          </button>

          <button
            onClick={() => setZoom(1)}
            className="rounded-lg border px-3 py-2"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            onClick={() => setZoom(Math.min(2.5, zoom + 0.25))}
            className="rounded-lg border px-3 py-2"
            aria-label="Zoom in"
          >
            +
          </button>

          <button
            onClick={fullscreen}
            className="rounded-lg border px-3 py-2"
          >
            Fullscreen
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-auto rounded-xl border border-gray-200 bg-white p-3"
        style={{ maxHeight: "85vh" }}
      >
        {error ? (
          <p className="p-5 text-red-600">
            Diagram display failed. Please generate again.
          </p>
        ) : (
          
<img
  src={image}
  alt={title}
  onError={() => setError(true)}
  draggable={false}
  className="mx-auto block h-auto"
  style={{
    width: `${zoom * 100}%`,
    minWidth: "0",
    maxWidth: "none",
    height: "auto",
    objectFit: "contain"
  }}
/>

        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={downloadSVG}
          disabled={!svg}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Download SVG
        </button>

        <button
          onClick={downloadPNG}
          disabled={!svg}
          className="rounded-lg bg-gray-800 px-4 py-2 text-white disabled:opacity-50"
        >
          Download PNG
        </button>
      </div>

      <p className="text-xs text-gray-500">
        AI-generated educational diagram · Zoomable SVG
      </p>

    </section>
  );
}
