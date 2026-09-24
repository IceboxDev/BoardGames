import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ErrorAlert } from "../ui/ErrorAlert";
import { LoadingState } from "../ui/LoadingState";
import { RulesShell } from "./RulesShell";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** A single PDF, or multiple booklets shown as tabs (Sky Team etc.). */
export type RulesViewerSource = string | { label: string; url: string }[];

interface RulesViewerProps {
  url: RulesViewerSource;
  onClose: () => void;
}

// Full-screen PDF viewer rendered at the `/play/:slug/rules` route (see
// RulesRoute). The chrome — header, tabs, close, the dialog contract and the
// once-only Back navigation — is `RulesShell`; this component only owns the
// PDF state (which booklet, how many pages, how wide).

export function RulesViewer({ url, onClose }: RulesViewerProps) {
  // Normalize: a plain string becomes a single-tab list. The tab bar is only
  // rendered when there's more than one booklet.
  const tabs = typeof url === "string" ? [{ label: "Rules", url }] : url;
  const [activeTab, setActiveTab] = useState(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageWidth, setPageWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  // Switching tab: clear page count so stale pages don't render against the
  // new document, and scroll the new PDF to the top. Optional-call on
  // `scrollTo` keeps this safe under jsdom (which doesn't implement it).
  const switchTab = useCallback(
    (i: number) => {
      if (i === activeTab) return;
      setActiveTab(i);
      setNumPages(0);
      containerRef.current?.scrollTo?.({ top: 0 });
    },
    [activeTab],
  );

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

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  return (
    <RulesShell
      meta={numPages > 0 ? `${numPages} ${numPages === 1 ? "page" : "pages"}` : undefined}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={switchTab}
      scrollRef={containerRef}
      onClose={onClose}
    >
      <div className="mx-auto flex max-w-[832px] flex-col items-center gap-3">
        <Document
          // Force remount on tab change so react-pdf cleanly reloads the
          // new file instead of incrementally diffing against the old one.
          key={activeTab}
          file={tabs[activeTab].url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<LoadingState label="Loading rules…" className="py-20" />}
          error={
            <ErrorAlert
              message="Failed to load PDF. Please try again."
              className="mx-auto my-20 max-w-md"
            />
          }
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: PDF pages are positional
              key={i}
              className="mb-3 last:mb-0 overflow-hidden rounded-card-lg shadow-2xl shadow-black/40 ring-1 ring-line-soft"
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
    </RulesShell>
  );
}
