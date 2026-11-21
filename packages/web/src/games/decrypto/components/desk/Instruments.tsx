import type { DecryptoPlayerView, Team } from "@boardgames/core/games/decrypto/types";
import { useEffect, useRef, useState } from "react";
import { type LampState, teamName } from "../../logic/desk";

// The desk's small instruments: jewel lamps, the token trays and the round
// counter's nixie tubes.

export function Lamp({ state }: { state: LampState }) {
  return <i className={`dc-lamp ${state}`} aria-hidden />;
}

/** Two-digit nixie readout over the painted tubes. */
export function Nixie({ value, label, hot }: { value: number; label: string; hot?: boolean }) {
  const digits = String(Math.max(0, value)).padStart(2, "0").split("");
  return (
    <div className={`dc-nixie${hot ? " hot" : ""}`} role="img" aria-label={`${label} ${value}`}>
      <div className="dc-tubes" aria-hidden>
        {digits.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a tube's place is its identity
          <span key={i} className="dc-tube">
            <b>{d}</b>
          </span>
        ))}
      </div>
      <span className="dc-engr" aria-hidden>
        {label}
      </span>
    </div>
  );
}

type Kind = "i" | "m";

/** One row of a tray: two wells, the chips in them and the threshold warning. */
function TrayRow({
  kind,
  count,
  dropped,
  label,
  warn,
}: {
  kind: Kind;
  count: number;
  dropped: number | null;
  label: string;
  warn: { one: string; two: string; twoTone: "won" | "lost" };
}) {
  const state = count >= 2 ? warn.twoTone : count === 1 ? "on" : "";
  return (
    <div className="dc-tray-row">
      <span className="dc-engr">{label}</span>
      <span className="dc-wells" role="img" aria-label={`${label}: ${count} of 2`}>
        {[0, 1].map((i) => (
          <span key={i} className="dc-well">
            {i < count && <i className={`dc-token ${kind}${dropped === i ? " drop" : ""}`} />}
          </span>
        ))}
      </span>
      <span className={`dc-warn ${state}`}>
        {count >= 2 ? warn.two : count === 1 ? warn.one : "—"}
      </span>
    </div>
  );
}

/**
 * A team's token tray: white interception chips (two win) and black
 * miscommunication chips (two lose). A chip that arrives while the player
 * watches drops in; the interceptor variant's tray has one row of "tokens".
 */
export function TokenTray({ view, team }: { view: DecryptoPlayerView; team: Team }) {
  const tok = view.tokens[team] ?? { interceptions: 0, miscommunications: 0 };
  const prev = useRef(tok);
  const [drop, setDrop] = useState<{ kind: Kind; index: number } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = tok;
    if (tok.interceptions > p.interceptions) {
      setDrop({ kind: "i", index: tok.interceptions - 1 });
    } else if (tok.miscommunications > p.miscommunications) {
      setDrop({ kind: "m", index: tok.miscommunications - 1 });
    } else return;
    const id = setTimeout(() => setDrop(null), 420);
    return () => clearTimeout(id);
  }, [tok]);

  const interceptor = view.variant === "interceptor" && team === 1;
  const mine = team === view.team;
  return (
    <div className={`dc-tray ${team === 0 ? "w" : "b"}`}>
      <div className="dc-tray-name">
        <span className={`dc-tdot t${team}`} />
        {teamName(view, team)}
        {mine && <em>· yours</em>}
      </div>
      <div className="dc-tray-rows">
        <TrayRow
          kind="i"
          count={tok.interceptions}
          dropped={drop?.kind === "i" ? drop.index : null}
          label={interceptor ? "Tokens" : "Intercepts"}
          warn={{ one: "1 from victory", two: "Victory", twoTone: "won" }}
        />
        {!interceptor && (
          <TrayRow
            kind="m"
            count={tok.miscommunications}
            dropped={drop?.kind === "m" ? drop.index : null}
            label="Misreads"
            warn={{ one: "1 from defeat", two: "Defeat", twoTone: "lost" }}
          />
        )}
      </div>
    </div>
  );
}
