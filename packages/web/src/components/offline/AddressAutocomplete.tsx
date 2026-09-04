import { useEffect, useRef } from "react";
import { Input } from "../ui/Input";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
};

// Minimal shape of the Google Places Autocomplete API we use. Avoids pulling
// in the full @types/google.maps dependency for one tiny integration point.
type PlacesNamespace = {
  Autocomplete: new (
    el: HTMLInputElement,
    opts?: { types?: string[]; fields?: string[] },
  ) => PlacesAutocomplete;
};
type PlacesAutocomplete = {
  addListener(event: string, cb: () => void): { remove(): void };
  getPlace(): { formatted_address?: string; name?: string };
};
type MapsApi = {
  places?: PlacesNamespace;
  importLibrary?: (name: string) => Promise<unknown>;
};
type GoogleGlobal = { maps?: MapsApi };

const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

// Module-level singletons so we never load the script twice nor re-inject the
// pac-container styles when the form re-renders.
let placesPromise: Promise<PlacesNamespace> | null = null;
let pacStylesInjected = false;

function getGoogle(): GoogleGlobal | undefined {
  return (window as unknown as { google?: GoogleGlobal }).google;
}

function loadPlaces(apiKey: string): Promise<PlacesNamespace> {
  if (placesPromise) return placesPromise;
  placesPromise = (async () => {
    if (typeof window === "undefined") throw new Error("No window");

    // Already fully loaded by another caller.
    const ready = getGoogle()?.maps?.places;
    if (ready?.Autocomplete) return ready;

    // Inject the bootstrap loader once. With `loading=async` the actual
    // libraries import lazily — wait via `importLibrary`.
    if (!document.querySelector("script[data-google-maps-loader]")) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&v=weekly`;
        script.async = true;
        script.defer = true;
        script.dataset.googleMapsLoader = "1";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Maps loader"));
        document.head.appendChild(script);
      });
    }

    // Wait for the bootstrap to expose `importLibrary` then ask for places.
    const start = Date.now();
    while (!getGoogle()?.maps?.importLibrary) {
      if (Date.now() - start > 8000) throw new Error("Google Maps loader did not initialize");
      await new Promise((r) => setTimeout(r, 50));
    }
    const importLibrary = getGoogle()?.maps?.importLibrary;
    if (!importLibrary) throw new Error("importLibrary missing");
    const places = (await importLibrary("places")) as PlacesNamespace;
    if (!places?.Autocomplete) throw new Error("Places.Autocomplete missing");
    return places;
  })();
  // Reset the singleton on failure so a retry is possible.
  placesPromise.catch(() => {
    placesPromise = null;
  });
  return placesPromise;
}

function injectPacStyles() {
  if (pacStylesInjected) return;
  pacStylesInjected = true;
  // The `pac-container` is appended to <body> by Google Places, outside the
  // modal portal. Stack it above the modal layer via the --z-tooltip token —
  // a runtime-injected <style> resolves :root vars fine, so --z-* works here.
  //
  // The COLORS stay literal, and NOT because they're off-palette: the item
  // text is exactly gray-200, the border exactly white/10. This block never
  // passes through Tailwind's compiler, so the palette vars it would
  // reference are only emitted while some *compiled class elsewhere* happens
  // to use them — a var this file alone depends on can vanish when an
  // unrelated component drops a class. --z-* are hand-declared in index.css's
  // @theme and always present, hence the asymmetry. (The bg is a near-miss
  // anyway: 2/255 off surface-900.)
  const style = document.createElement("style");
  style.textContent = `
    .pac-container {
      z-index: var(--z-tooltip, 300) !important;
      background: rgb(15 17 21 / 0.96);
      border: 1px solid rgb(255 255 255 / 0.1);
      border-radius: 0.75rem;
      backdrop-filter: blur(12px);
      box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.6);
      font-family: inherit;
      margin-top: 6px;
      overflow: hidden;
    }
    .pac-item {
      padding: 0.5rem 0.75rem;
      font-size: 0.8125rem;
      color: rgb(229 231 235);
      border-top: 1px solid rgb(255 255 255 / 0.05);
      cursor: pointer;
    }
    .pac-item:first-child { border-top: none; }
    .pac-item:hover, .pac-item-selected { background: rgb(255 255 255 / 0.06); }
    .pac-item-query, .pac-matched { color: rgb(255 255 255); font-weight: 600; }
    .pac-icon { display: none; }
    .pac-logo:after { filter: invert(0.8); opacity: 0.5; }
  `;
  document.head.appendChild(style);
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  id,
  className,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!API_KEY) return;
    if (!inputRef.current) return;
    let cancelled = false;
    let listener: { remove(): void } | null = null;

    loadPlaces(API_KEY)
      .then((places) => {
        if (cancelled || !inputRef.current) return;
        injectPacStyles();
        const ac = new places.Autocomplete(inputRef.current, {
          types: ["geocode"],
          fields: ["formatted_address", "name"],
        });
        listener = ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const address = place?.formatted_address ?? inputRef.current?.value ?? "";
          onChangeRef.current(address);
        });
      })
      .catch((err) => {
        // Fall back to plain text input — no autocomplete but still usable.
        // Surface the reason so the developer can diagnose env / restriction
        // issues.
        console.warn("[AddressAutocomplete]", err);
      });

    return () => {
      cancelled = true;
      if (listener) listener.remove();
    };
  }, []);

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Address"}
      autoComplete="off"
      disabled={disabled}
      className={className}
    />
  );
}
