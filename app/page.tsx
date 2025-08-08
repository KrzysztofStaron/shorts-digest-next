import { cookies } from "next/headers";
import { summarizeShorts } from "@/actions/summarize-shorts";
import InputUrlWithPreview from "./components/InputUrlWithPreview";
import ButtonSubmitGenerate from "./components/ButtonSubmitGenerate";
import ButtonExportPdf from "./components/ButtonExportPdf";
import type { ReactNode } from "react";
import { Suspense } from "react";
import ImageFromPrompt from "./components/ImageFromPrompt";

function emphasizeKeywordsFromMarkup(text: string) {
  // Inline renderer for ***highlight*** and **bold**
  // Processes in two passes to avoid nesting issues: first *** then **
  const processPattern = (
    inputs: Array<string | ReactNode>,
    pattern: RegExp,
    wrap: (content: string, key: string) => ReactNode
  ): Array<string | ReactNode> => {
    const outputs: Array<string | ReactNode> = [];
    inputs.forEach((segment, idx) => {
      if (typeof segment !== "string") {
        outputs.push(segment);
        return;
      }
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(segment))) {
        const start = match.index;
        const end = start + match[0].length;
        if (start > lastIndex) outputs.push(segment.slice(lastIndex, start));
        const inner = match[1];
        outputs.push(wrap(inner, `${idx}-${start}-${end}`));
        lastIndex = end;
      }
      if (lastIndex < segment.length) outputs.push(segment.slice(lastIndex));
    });
    return outputs;
  };

  // Start with raw text as a single segment
  let parts: Array<string | ReactNode> = [text];

  // ***highlight***
  parts = processPattern(parts, /\*\*\*([\s\S]*?)\*\*\*/g, (content, key) => (
    <mark key={`hl-${key}`} className="bg-orange-100 text-slate-900 px-1 rounded">
      <strong>
        <em>{content}</em>
      </strong>
    </mark>
  ));

  // **bold**
  parts = processPattern(parts, /\*\*([\s\S]*?)\*\*/g, (content, key) => <strong key={`b-${key}`}>{content}</strong>);

  return parts;
}

function renderSummaryMarkdown(summary: string) {
  const lines = summary.split(/\r?\n/);
  const elements: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-6 space-y-2 text-slate-700">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushList();
      return;
    }

    // Parse inline images in the form: ![Alt](Prompt to generate the image)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    if (imageRegex.test(line)) {
      flushList();
      imageRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      const rowChildren: ReactNode[] = [];
      while ((match = imageRegex.exec(line))) {
        const start = match.index;
        const end = start + match[0].length;
        const before = line.slice(lastIndex, start).trim();
        if (before) {
          rowChildren.push(
            <p key={`p-before-img-${idx}-${start}`} className="text-slate-700 leading-relaxed">
              {emphasizeKeywordsFromMarkup(before)}
            </p>
          );
        }
        const alt = match[1] || "Generated image";
        const prompt = match[2];
        rowChildren.push(
          <div key={`img-${idx}-${start}`} className="my-4">
            <Suspense
              fallback={
                <div className="w-full max-w-md h-64 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center animate-pulse text-slate-500">
                  Generating image...
                </div>
              }
            >
              <ImageFromPrompt alt={alt} prompt={prompt} />
            </Suspense>
          </div>
        );
        lastIndex = end;
      }
      const after = line.slice(lastIndex).trim();
      if (after) {
        rowChildren.push(
          <p key={`p-after-img-${idx}-${lastIndex}`} className="text-slate-700 leading-relaxed">
            {emphasizeKeywordsFromMarkup(after)}
          </p>
        );
      }
      elements.push(
        <div key={`img-block-${idx}`} className="space-y-2">
          {rowChildren}
        </div>
      );
      return;
    }

    // ATX-style headings: #, ##, ### ...
    const atx = line.match(/^(#{1,6})\s+(.*)$/);
    if (atx) {
      flushList();
      const headingText = atx[2].replace(/:$/, "");
      elements.push(
        <h3 key={`h-atx-${idx}`} className="text-slate-800 font-semibold mt-6 mb-2">
          {emphasizeKeywordsFromMarkup(headingText)}
        </h3>
      );
      return;
    }

    // Bold heading like **Section:**
    const boldHeading = line.match(/^\*\*(.+?)\*\*:?$/);
    if (boldHeading) {
      flushList();
      elements.push(
        <h3 key={`h-bold-${idx}`} className="text-slate-800 font-semibold mt-6 mb-2">
          {emphasizeKeywordsFromMarkup(boldHeading[1])}
        </h3>
      );
      return;
    }

    // Bulleted or numbered list items
    if (/^[-\u2013\u2014*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const content = line.replace(/^(?:[-\u2013\u2014*]|\d+\.)\s+/, "");
      listItems.push(
        <li key={`li-${idx}`} className="leading-relaxed">
          {emphasizeKeywordsFromMarkup(content)}
        </li>
      );
      return;
    }

    flushList();
    if (line.endsWith(":")) {
      elements.push(
        <h3 key={`h3-${idx}`} className="text-slate-800 font-semibold mt-6 mb-2">
          {emphasizeKeywordsFromMarkup(line.replace(/:$/, ""))}
        </h3>
      );
    } else {
      elements.push(
        <p key={`p-${idx}`} className="text-slate-700 leading-relaxed">
          {emphasizeKeywordsFromMarkup(line)}
        </p>
      );
    }
  });

  flushList();
  return <div className="space-y-1">{elements}</div>;
}

export default async function Page() {
  const jar = await cookies();
  const lastSummary = jar.get("last-summary")?.value ?? "";
  const lastError = jar.get("last-error")?.value ?? "";
  const lastUrl = jar.get("last-url")?.value ?? "https://www.youtube.com/watch?v=KSaS9m8O2Rc";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <main className="mx-auto max-w-4xl px-4 py-8 print:px-0 print:py-0">
        {/* Header */}
        <header className="text-center mb-12 print:hidden">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
              YouTube Video Digest
            </h1>
          </div>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Transform YouTube videos into actionable insights. <br /> Powered by Speech to text and intelligent
            summarization.
          </p>
        </header>

        {/* Main Form */}
        <section className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 mb-8 print:hidden">
          <form action={summarizeShorts} className="space-y-6">
            <div className="space-y-3">
              <label htmlFor="url" className="block text-sm font-semibold text-slate-700">
                YouTube Video URL
              </label>
              <InputUrlWithPreview defaultValue={lastUrl} />
            </div>

            <div className="flex items-center gap-4">
              <ButtonSubmitGenerate />

              <a
                href="https://www.youtube.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Browse YouTube Videos
              </a>
            </div>
          </form>
        </section>

        {/* Error Display */}
        {lastError && (
          <section className="bg-red-50 border-l-4 border-red-500 rounded-xl p-6 mb-8 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-red-800 font-semibold text-sm mb-1">Something went wrong</h3>
                <p className="text-red-700 text-sm leading-relaxed">{lastError}</p>
              </div>
            </div>
          </section>
        )}

        {/* Summary Display */}
        {lastSummary && (
          <section className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-8 py-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800">AI Summary Generated</h2>
              </div>
            </div>

            <div className="p-8">
              <div id="summary-container" className="max-w-none">
                {renderSummaryMarkdown(lastSummary)}
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Powered by GPT-5</span>
                  <span></span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Features */}
        {!lastSummary && !lastError && (
          <section className="grid md:grid-cols-3 gap-6 mt-12 print:hidden">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-800 mb-2">AI Transcription</h3>
              <p className="text-sm text-slate-600">
                Automatic audio transcription using OpenAI Whisper for accurate text extraction.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-800 mb-2">Smart Summarization</h3>
              <p className="text-sm text-slate-600">
                Extract key insights and actionable takeaways using advanced language models.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-lime-500 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-800 mb-2">Optimized for Actionability</h3>
              <p className="text-sm text-slate-600">
                Notes are crafted to highlight practical insights, and clear takeaways
              </p>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center print:hidden">
          <div className="inline-flex items-center gap-2 text-sm text-slate-500 bg-white rounded-full px-6 py-3 shadow-sm border border-slate-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Secure processing • No data stored • Privacy-focused
          </div>
        </footer>
      </main>
    </div>
  );
}
