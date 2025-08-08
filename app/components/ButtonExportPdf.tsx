"use client";

import { useEffect, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export default function ButtonExportPdf() {
  const [isExporting, setIsExporting] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && !(window as any).html2canvas) {
      (window as any).html2canvas = html2canvas;
    }
  }, []);

  const handleClick = async () => {
    const container = document.getElementById("summary-container");
    if (!container || isExporting) return;

    setIsExporting(true);
    try {
      const images = Array.from(container.querySelectorAll("img"));
      await Promise.all(
        images.map(img =>
          img.complete && img.naturalHeight !== 0
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );

      // Clone and sanitize colors to avoid unsupported CSS color spaces (oklch)
      const cloned = container.cloneNode(true) as HTMLElement;
      cloned.id = "summary-container-export";
      cloned.style.backgroundColor = "#ffffff";
      const style = document.createElement("style");
      style.textContent = `
        #summary-container-export, #summary-container-export * {
          color: #0f172a !important;
          background: transparent !important;
          background-color: #ffffff !important;
          border-color: #e5e7eb !important;
          box-shadow: none !important;
        }
        /* Remove gradients that may use oklch */
        [class*="bg-gradient"], [class*="from-"], [class*="to-"], [class*="via-"] {
          background-image: none !important;
        }
      `;
      cloned.appendChild(style);
      document.body.appendChild(cloned);

      // Ensure images in the cloned node are loaded
      const clonedImages = Array.from(cloned.querySelectorAll("img"));
      await Promise.all(
        clonedImages.map(img =>
          img.complete && img.naturalHeight !== 0
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );

      // Rasterize the sanitized clone
      const canvas = await html2canvas(cloned, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        foreignObjectRendering: true,
        removeContainer: true,
      });
      document.body.removeChild(cloned);

      // Build a multipage PDF from the big canvas by slicing
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const outputImageWidth = pageWidth;
      const outputImageHeight = Math.floor((canvas.height * outputImageWidth) / canvas.width);
      const pageHeightInSourcePx = Math.floor((pageHeight * canvas.width) / pageWidth);

      const sliceCanvas = document.createElement("canvas");
      const sliceCtx = sliceCanvas.getContext("2d");
      sliceCanvas.width = canvas.width;

      let sy = 0;
      let isFirst = true;
      while (sy < canvas.height) {
        const sliceHeight = Math.min(pageHeightInSourcePx, canvas.height - sy);
        sliceCanvas.height = sliceHeight;
        sliceCtx?.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceCtx?.drawImage(canvas, 0, sy, canvas.width, sliceHeight, 0, 0, sliceCanvas.width, sliceHeight);

        const sliceData = sliceCanvas.toDataURL("image/jpeg", 1.0);
        if (!isFirst) pdf.addPage();
        pdf.addImage(
          sliceData,
          "JPEG",
          0,
          0,
          outputImageWidth,
          Math.floor((sliceHeight * outputImageWidth) / canvas.width),
          undefined,
          "FAST"
        );
        isFirst = false;
        sy += sliceHeight;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const blob = pdf.output("blob");
      const blobUrl = URL.createObjectURL(blob);
      const tempLink = document.createElement("a");
      tempLink.href = blobUrl;
      tempLink.download = `youtube-summary-${timestamp}.pdf`;
      document.body.appendChild(tempLink);
      tempLink.click();
      console.log("blobUrl", blobUrl);
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(tempLink);
      }, 0);
      console.log("Export: PDF ready");
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isExporting}
      className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-colors disabled:opacity-60 disabled:cursor-not-allowed print:hidden"
      aria-label="Export summary as PDF"
    >
      {isExporting ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 10l5 5 5-5" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15V3" />
        </svg>
      )}
      {isExporting ? "Exporting..." : "Export PDF"}
    </button>
  );
}
