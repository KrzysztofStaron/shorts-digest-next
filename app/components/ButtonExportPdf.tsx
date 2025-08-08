"use client";

export default function ButtonExportPdf() {
  const handleClick = () => {
    // Give the browser a tick to ensure images/layout settle before printing
    requestAnimationFrame(() => window.print());
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-colors print:hidden"
      aria-label="Export summary as PDF"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 16v4m-6 0h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      Export PDF
    </button>
  );
}
