import { FULL_DECK, sortHand } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { CardId, Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLANS } from "@boardgames/core/games/senso-battle-for-japan/types";
import type { ReactNode } from "react";
import { CardFan } from "../components/card-fan";
import { Badge, MicroLabel } from "../components/ui";
import "../games/senso-battle-for-japan/senso.css";
import { CARD_PAPER } from "../games/senso-battle-for-japan/colors";
import {
  ART_NAMES,
  artNamesFor,
  cardArtUrl,
  missingCardArt,
} from "../games/senso-battle-for-japan/components/card/card-art";
import SensoCard, { SensoCardBack } from "../games/senso-battle-for-japan/components/SensoCard";

// Dev-only gallery of the composed Sensō deck — every face and the back, at
// every size the game draws them, with the art blocks that are still missing
// called out. /dev/senso-cards?scene=<name>&trump=<clan>&frame=WxH
// Scenes: deck | ladder | fan | table | fringe

const SAMPLE: CardId[] = ["takeda-7", "uesugi-13", "oda-14", "ninja-jade"];
const LADDER_PX = [320, 160, 120, 72, 56, 48, 36, 20];

function Missing({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <Badge tone="amber" size="xs">
      missing {names.length}
    </Badge>
  );
}

function Labelled({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children}
      <MicroLabel>{label}</MicroLabel>
    </div>
  );
}

function DeckScene({ trump }: { trump: Clan }) {
  const missing = new Set<string>(missingCardArt());
  return (
    <div className="flex flex-wrap gap-3">
      {FULL_DECK.map((card) => (
        <Labelled
          key={card}
          label={
            <span className="flex items-center gap-1">
              {card}
              <Missing names={artNamesFor(card).filter((n) => missing.has(n))} />
            </span>
          }
        >
          <div style={{ width: 160 }}>
            <SensoCard card={card} size="hand" trump={trump} />
          </div>
        </Labelled>
      ))}
      {CLANS.map((clan) => (
        <Labelled key={clan} label={`${clan} · clan-only`}>
          <div style={{ width: 160 }}>
            <SensoCard card={`${clan}-14`} size="hand" clanOnly glowing={clan === trump} />
          </div>
        </Labelled>
      ))}
      <Labelled label="back">
        <SensoCardBack size="hand" className="w-40" />
      </Labelled>
    </div>
  );
}

/** One card of each kind at every width the game renders, `play` LOD below 160. */
function LadderScene({ trump }: { trump: Clan }) {
  return (
    <div className="flex flex-col gap-6">
      {LADDER_PX.map((px) => (
        <div key={px} className="flex items-end gap-3">
          <MicroLabel className="w-12">{px}px</MicroLabel>
          {SAMPLE.map((card) => (
            <div key={card} style={{ width: px }}>
              <SensoCard card={card} size={px >= 160 ? "hand" : "play"} trump={trump} />
            </div>
          ))}
          <div style={{ width: px }}>
            <SensoCard
              card="takeda-14"
              size={px >= 160 ? "hand" : "mini"}
              clanOnly
              className="w-full"
            />
          </div>
          <SensoCardBack
            size={px >= 160 ? "hand" : "mini"}
            style={{ width: px }}
            className="w-full"
          />
        </div>
      ))}
    </div>
  );
}

/** The real fan, at the round-8 hand size, so squeeze and crop are the real ones. */
function FanScene({ trump }: { trump: Clan }) {
  const hand = sortHand(
    [
      "takeda-14",
      "takeda-10",
      "takeda-3",
      "uesugi-13",
      "uesugi-8",
      "uesugi-2",
      "oda-12",
      "oda-11",
      "oda-6",
      "mori-9",
      "mori-7",
      "ninja-wood",
      "ninja-jade",
    ],
    trump,
  );
  return (
    <div className="h-fan w-full">
      <CardFan
        cards={hand}
        getCardId={(c) => c}
        renderCard={(card, { isHovered }) => (
          <SensoCard card={card} size="hand" trump={trump} glowing={isHovered} />
        )}
        renderPreview={(card) => <SensoCard card={card} size="hand" trump={trump} />}
      />
    </div>
  );
}

/** The conflict table's cards at the phone scale. */
function TableScene({ trump }: { trump: Clan }) {
  return (
    <div className="flex flex-col gap-4">
      {[0.6, 0.41].map((k) => (
        <div key={k} className="flex items-end gap-4">
          <MicroLabel className="w-16">×{k}</MicroLabel>
          <div
            className="flex items-end gap-2"
            style={{ transform: `scale(${k})`, transformOrigin: "left bottom" }}
          >
            {SAMPLE.map((card) => (
              <div key={card} style={{ width: 120, height: 180 }}>
                <SensoCard card={card} size="play" trump={trump} className="h-full" />
              </div>
            ))}
            <div style={{ width: 80 }}>
              <SensoCard card={`${trump}-14`} size="hand" clanOnly glowing />
            </div>
            <div className="flex items-end gap-2">
              {CLANS.map((clan) => (
                <div key={clan} style={{ width: 36 }}>
                  <SensoCard card={`${clan}-14`} size="mini" clanOnly className="w-full" />
                </div>
              ))}
            </div>
            <div className="flex">
              {[0, 1, 2].map((i) => (
                <SensoCardBack
                  key={i}
                  size="mini"
                  className="rounded-card-md"
                  style={{ width: 28, height: 42, marginLeft: i ? -17 : 0 }}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Every block over paper, white and dark — alpha fringes show here first. */
function FringeScene() {
  const grounds = { paper: CARD_PAPER, white: "#ffffff", dark: "#0f172b" };
  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grounds).map(([name, bg]) => (
        <div
          key={name}
          className="flex flex-wrap items-center gap-3 p-3"
          style={{ background: bg }}
        >
          <MicroLabel className="w-12">{name}</MicroLabel>
          {ART_NAMES.map((n) => {
            const url = cardArtUrl(n);
            const tile = n === "paper-grain" || n === "back-pattern";
            return url ? (
              tile ? (
                <div
                  key={n}
                  title={n}
                  style={{
                    width: 96,
                    height: 96,
                    backgroundImage: `url(${url})`,
                    backgroundSize: 32,
                  }}
                />
              ) : (
                <img
                  key={n}
                  src={url}
                  alt={n}
                  title={n}
                  style={{ width: 96, height: 96, objectFit: "contain" }}
                />
              )
            ) : null;
          })}
        </div>
      ))}
    </div>
  );
}

const SCENES: Record<string, (trump: Clan) => ReactNode> = {
  deck: (t) => <DeckScene trump={t} />,
  ladder: (t) => <LadderScene trump={t} />,
  fan: (t) => <FanScene trump={t} />,
  table: (t) => <TableScene trump={t} />,
  fringe: () => <FringeScene />,
};

export default function SensoCardsPreview() {
  const params = new URLSearchParams(window.location.search);
  const frame = params.get("frame");
  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    return (
      <iframe
        title="preview-frame"
        src={window.location.pathname + window.location.search.replace(/[?&]frame=[^&]*/, "")}
        style={{ width: w || 390, height: h || 844, border: "1px solid #333" }}
      />
    );
  }
  const scene = params.get("scene") ?? "deck";
  const trumpParam = params.get("trump");
  const trump: Clan = CLANS.includes(trumpParam as Clan) ? (trumpParam as Clan) : "takeda";
  const missing = missingCardArt();
  return (
    <div className="senso-kanji min-h-screen bg-surface-950 p-4 text-fg-primary">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MicroLabel>
          senso-cards · {scene} · trump {trump}
        </MicroLabel>
        <Badge tone={missing.length ? "amber" : "emerald"} size="xs">
          {missing.length
            ? `${missing.length}/${ART_NAMES.length} blocks missing`
            : "all art present"}
        </Badge>
        {missing.length > 0 && (
          <span className="text-3xs text-fg-muted">{missing.join(" · ")}</span>
        )}
      </div>
      {(SCENES[scene] ?? SCENES.deck)(trump)}
    </div>
  );
}
