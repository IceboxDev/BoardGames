import { SEAL } from "../card-layout";
import ArtLayer from "./ArtLayer";
import { SealFallback } from "./fallbacks";

/** The vermilion 勢 stamp on the advantage suit — bottom-left, like a print's seal. */
export default function TrumpSeal() {
  return <ArtLayer name="seal-advantage" box={SEAL} layer="seal" fallback={<SealFallback />} />;
}
