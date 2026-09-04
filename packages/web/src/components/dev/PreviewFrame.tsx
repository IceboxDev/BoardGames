// Shared `?frame=WxH` helper for the /dev/* preview pages: re-renders the
// current page inside an iframe of that CSS size so a headless browser
// (whose window has a 500px minimum width) can still lay out a true phone
// viewport. Media queries evaluate against the iframe.
//
// Callers check for the param themselves and bail into this component:
//   const frame = params.get("frame");
//   if (frame) return <PreviewFrame params={params} />;
//
// Used by ThemePreview today; migrating the other previews' hand-rolled
// copies (RsvpPreview, SkillPreview, DecryptoPreview, …) is a follow-up.

type PreviewFrameProps = {
  /** The page's already-parsed query params (must contain `frame`). */
  params: URLSearchParams;
  /** Fallback CSS size when the param is malformed. */
  fallbackWidth?: number;
  fallbackHeight?: number;
};

/** Positive-integer CSS pixel dimension, or the fallback for junk input. */
function dim(raw: number | undefined, fallback: number): number {
  return raw !== undefined && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export function PreviewFrame({
  params,
  fallbackWidth = 360,
  fallbackHeight = 644,
}: PreviewFrameProps) {
  const [w, h] = (params.get("frame") ?? "").split("x").map(Number);
  // Drop only the frame param, keeping the rest (?preset=…) intact
  // regardless of parameter order.
  const inner = new URLSearchParams(params);
  inner.delete("frame");
  const qs = inner.toString();
  return (
    <iframe
      title="preview-frame"
      src={window.location.pathname + (qs ? `?${qs}` : "")}
      style={{
        width: dim(w, fallbackWidth),
        height: dim(h, fallbackHeight),
        border: "1px solid #333",
      }}
    />
  );
}
