import { useCallback, useState } from "react";
import { cn } from "../../lib/cn";

// A photo that paints instantly and sharpens when it arrives.
//
// The caller hands over a tiny blurred stand-in (a ~24px data URI the server
// generated next to the real photo) plus the real image's intrinsic size. The
// stand-in is drawn underneath, scaled and blurred past the box edges so its
// soft border never shows; the real image sits on top at opacity 0 and fades
// in once it has loaded. `width`/`height` attributes let the browser reserve
// the box before any byte lands, so nothing shifts. The parent decides the
// frame (an `aspect-photo` box, a fixed height…) — this component only fills
// it.
//
// Two edge cases are handled so a photo can never stay invisible: an image the
// browser already has cached fires no `load` event after mount, so the ref
// callback checks `complete`; and a failed load reveals the placeholder tint
// rather than a broken-image glyph.

type BlurUpImageProps = {
  src: string;
  /** Data URI of the blurred stand-in. */
  placeholder: string;
  width: number;
  height: number;
  alt: string;
  /** Hint the browser to fetch this one first (the hero photo). */
  priority?: boolean;
  className?: string;
  imgClassName?: string;
};

export function BlurUpImage({
  src,
  placeholder,
  width,
  height,
  alt,
  priority = false,
  className,
  imgClassName,
}: BlurUpImageProps) {
  const [loaded, setLoaded] = useState(false);
  const reveal = useCallback(() => setLoaded(true), []);
  const attach = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <img
        aria-hidden="true"
        src={placeholder}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
      />
      <img
        ref={attach}
        src={src}
        alt={alt}
        width={width}
        height={height}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        onLoad={reveal}
        onError={reveal}
        data-loaded={loaded ? "true" : "false"}
        className={cn(
          "relative h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none",
          loaded ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </div>
  );
}
