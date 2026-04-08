import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useGameBackOverride } from "../../hooks/useGameBackOverride";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface RulesViewerProps {
  url: string;
  onClose: () => void;
}

export function RulesViewer({ url, onClose }: RulesViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageWidth, setPageWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const { setBackOverride } = useGameBackOverride();

  // Override navbar back button to close the viewer
  useEffect(() => {
    setBackOverride(() => onClose());
    return () => setBackOverride(null);
  }, [setBackOverride, onClose]);

  // Responsive page width
  useEffect(() => {
    function updateWidth() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setPageWidth(Math.min(w - 48, 800));
      }
    }
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`}
    >
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      <div
        className="absolute inset-0 bg-surface-950/90 backdrop-blur-sm"
        onClick={handleClose}
        role="presentation"
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Header bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-surface-950/80 px-6 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06V3.56a.75.75 0 00-.546-.722A9.006 9.006 0 0015 2.5a9.006 9.006 0 00-4.25 1.065v13.255zM9.25 4.565A9.006 9.006 0 005 2.5a9.006 9.006 0 00-2.454.338A.75.75 0 002 3.56v11.5a.75.75 0 00.954.722A7.462 7.462 0 015 15.5a7.462 7.462 0 014.25 1.32V4.565z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Game Rules</span>
            {numPages > 0 && (
              <span className="text-xs tabular-nums text-gray-500">
                {numPages} {numPages === 1 ? "page" : "pages"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Scrollable PDF area */}
        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="mx-auto flex max-w-[832px] flex-col items-center gap-3">
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex items-center gap-2 py-20 text-sm text-gray-500">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  Loading rules...
                </div>
              }
              error={
                <div className="py-20 text-center text-sm text-red-400">
                  Failed to load PDF. Please try again.
                </div>
              }
            >
              {Array.from({ length: numPages }, (_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: PDF pages are positional
                  key={i}
                  className="mb-3 last:mb-0 overflow-hidden rounded-lg shadow-2xl shadow-black/40 ring-1 ring-white/[0.06]"
                >
                  <Page
                    pageNumber={i + 1}
                    width={pageWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                </div>
              ))}
            </Document>
          </div>
        </div>
      </div>
    </div>
  );
}
