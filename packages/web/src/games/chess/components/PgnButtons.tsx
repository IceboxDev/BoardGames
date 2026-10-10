import { type PgnInput, toPgn } from "@boardgames/core/games/chess/pgn";
import { useState } from "react";
import { Button } from "../../../components/ui";

/** Copy / download the game as PGN — pastes straight into lichess or chess.com. */
export function PgnButtons({ input }: { input: PgnInput }) {
  const [copied, setCopied] = useState(false);
  const pgn = () => toPgn(input);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pgn());
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard blocked (no permission / insecure context): download instead.
      download();
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([pgn()], { type: "application/x-chess-pgn" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${input.white}-vs-${input.black}.pgn`.replace(/[^\w.-]+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button size="xs" variant="secondary" onClick={copy} title="Copy the game as PGN">
        {copied ? "Copied ✓" : "Copy PGN"}
      </Button>
      <Button
        size="xs"
        variant="secondary"
        onClick={download}
        title="Download the game as a .pgn file"
      >
        Download PGN
      </Button>
    </>
  );
}
