import type { RevealedClueView, Team } from "@boardgames/core/games/decrypto/types";
import { fmtCode } from "../../logic/desk";
import {
  pct,
  type ReviewRound,
  type ReviewRow,
  type ReviewTx,
  SOURCE_LABEL,
  type TierLine,
} from "../../logic/review";

// The debrief's tapes: every round as a teletype strip that prints open. An
// open strip lays each transmission out as a table the eye can run down —
// clue, keyword, the team's read, the rival's read — with the reasons under
// each clue on labelled lines (Link, and in full: Cover, Team; Rival).

export type TapeDetail = "brief" | "full";

/** One read's cell: the digit it picked for a clue, right or wrong. */
function ReadCell({
  digit,
  truth,
  side,
}: {
  digit: number | null;
  truth: number;
  side: "team" | "rival";
}) {
  if (digit === null) {
    return (
      <span className="dc-tp-v na" title={side === "rival" ? "No interception" : "No read"}>
        —
      </span>
    );
  }
  const right = digit === truth;
  const tone = side === "team" ? (right ? "good" : "miss") : right ? "leak" : "safe";
  const title =
    side === "team" ? (right ? "Read right" : "Misread") : right ? "Rival read it" : "Rival missed";
  return (
    <span className={`dc-tp-v ${tone}`} title={title}>
      {right ? "✓" : "✗"}
      <b>{digit}</b>
    </span>
  );
}

function ClueNotes({
  row,
  index,
  tx,
  detail,
}: {
  row: ReviewRow;
  index: number;
  tx: ReviewTx;
  detail: TapeDetail;
}) {
  const full = detail === "full";
  const team = tx.decode.note?.picks[index];
  const rival = tx.intercept?.note?.picks[index];
  const rivalHit = row.interceptedAs !== null && row.interceptedAs === row.digit;
  const lines: { key: string; label: string; text: string | null | undefined; tone?: string }[] = [
    { key: "link", label: "Link", text: row.link },
    ...(full
      ? [
          { key: "cover", label: "Cover", text: row.cover, tone: "dim" },
          { key: "team", label: "Team", text: tx.decode.note?.standIn ? null : team?.why },
        ]
      : []),
    {
      key: "rival",
      label: "Rival",
      text: tx.intercept?.note?.standIn ? null : rival?.why,
      tone: rivalHit ? "hot" : undefined,
    },
  ];
  const shown = lines.filter((l) => l.text);
  if (shown.length === 0) return <div className="dc-tp-n empty" />;
  return (
    <dl className={`dc-tp-n${full ? "" : " brief"}`}>
      {shown.map((l) => (
        <div key={l.key} className={l.tone}>
          <dt>{l.label}</dt>
          <dd title={full ? undefined : (l.text ?? undefined)}>{l.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function TxTape({ tx, detail }: { tx: ReviewTx; detail: TapeDetail }) {
  const full = detail === "full";
  const search = tx.note?.search ?? null;
  const decodeNote = tx.decode.note;
  const interceptNote = tx.intercept?.note ?? null;
  return (
    <section className="dc-tp-side" aria-label={`${tx.teamName}, round ${tx.round}`}>
      <header className="dc-tp-oh">
        <span>
          <span className={`dc-tdot t${tx.team}`} /> {tx.teamName} · {tx.encryptor.name}
        </span>
        <b>{fmtCode(tx.code)}</b>
      </header>
      {tx.skipped || !tx.clues ? (
        <p className="dc-tp-empty">No clues were sent this round — a misread token.</p>
      ) : (
        <div className="dc-tp-grid">
          <span className="dc-tp-th">Clue</span>
          <span className="dc-tp-th">Keyword</span>
          <span className="dc-tp-th c">Team</span>
          <span className="dc-tp-th c">Rival</span>
          {tx.rows.map((row, i) => (
            <div key={row.clue} className="dc-tp-r">
              <span className="dc-tp-w">{row.clue}</span>
              <span className="dc-tp-k">
                <i>{row.digit}</i>
                {row.keyword ?? "?"}
              </span>
              <ReadCell digit={row.decodedAs} truth={row.digit} side="team" />
              <ReadCell
                digit={tx.intercept ? row.interceptedAs : null}
                truth={row.digit}
                side="rival"
              />
              <ClueNotes row={row} index={i} tx={tx} detail={detail} />
            </div>
          ))}
        </div>
      )}
      {tx.clues && (
        <div className="dc-tp-sum">
          <span>
            Team read <b>{fmtCode(tx.decode.code)}</b>{" "}
            <em className={tx.miscommunicated ? "miss" : "good"}>
              {tx.miscommunicated ? "misread" : "decoded"}
            </em>
          </span>
          <span>
            Rival read <b>{fmtCode(tx.intercept?.code ?? null)}</b>{" "}
            {tx.intercept ? (
              <em className={tx.intercepted ? "leak" : "safe"}>
                {tx.intercepted ? "intercepted" : "missed"}
              </em>
            ) : (
              <em className="safe">round 1</em>
            )}
          </span>
        </div>
      )}
      {full && (
        <div className="dc-tp-more">
          {tx.note?.standIn && <p>The AI was offline — a stand-in sent these clues.</p>}
          {tx.note?.tableRead && (
            <p>
              <span>Table</span> {tx.note.tableRead}
            </p>
          )}
          {search && (
            <p>
              <span>Search</span> read {search.pooled.join(" + ")} candidates · est. decode{" "}
              {pct(search.decode)} · leak {pct(search.intercept)}
              {search.playOut &&
                ` · played out: teammate ${search.playOut.decode}${search.playOut.intercept !== "0/0" ? `, rival ${search.playOut.intercept}` : ""}`}
            </p>
          )}
          {search?.alternatives.map((a) => (
            <p key={a.clues.join("|")}>
              <span>Weighed</span> “{a.clues.join(" / ")}” · decode {pct(a.decode)}, leak{" "}
              {pct(a.intercept)}
            </p>
          ))}
          {decodeNote && decodeNote.candidates.length > 1 && (
            <p>
              <span>Team</span> weighed{" "}
              {decodeNote.candidates.map((c) => fmtCode(c.code)).join(", ")}
              {decodeNote.verdict ? ` — ${decodeNote.verdict}` : ""}
            </p>
          )}
          {interceptNote && interceptNote.candidates.length > 1 && (
            <p>
              <span>Rival</span> weighed{" "}
              {interceptNote.candidates
                .map((c) => `${fmtCode(c.code)} (${SOURCE_LABEL[c.from]})`)
                .join(", ")}
              {interceptNote.verdict ? ` — ${interceptNote.verdict}` : ""}
            </p>
          )}
          {tx.intercept && tx.intercept.columns.length > 0 && (
            <p>
              <span>Rival saw</span>{" "}
              {tx.intercept.columns
                .map((c) => `${c.digit} “${c.guess}”${c.keyword ? ` (was ${c.keyword})` : ""}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** One round's strip: a single line closed, both transmissions printed open. */
export function RoundTape({
  round,
  open,
  detail,
  onOpen,
}: {
  round: ReviewRound;
  open: boolean;
  detail: TapeDetail;
  onOpen: () => void;
}) {
  return (
    <div className={`dc-tape-strip${open ? " on" : ""}`}>
      {/* biome-ignore lint/correctness/noRestrictedElements: the teletype strip itself is the control that prints the round open */}
      <button type="button" aria-expanded={open} onClick={onOpen}>
        <b>R{round.round}</b>
        {round.transmissions.map((tx) => (
          <span key={tx.key} className="tx">
            <span className={`dc-tdot t${tx.team}`} />
            <span className="code">{fmtCode(tx.code)}</span>
            <span className="cl">{tx.clues ? tx.clues.join(" / ") : "no clues"}</span>
            {tx.intercepted && <span className="st">Intercepted</span>}
            {tx.miscommunicated && <span className="st a">Misread</span>}
          </span>
        ))}
      </button>
      {open && (
        <div
          className="dc-tape-open"
          style={round.transmissions.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}
        >
          {round.transmissions.map((tx) => (
            <TxTape key={tx.key} tx={tx} detail={detail} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Both teams' keywords with every clue filed under each — the finished note sheet. */
export function KeywordBoard({
  teams,
  names,
  keywords,
  sheet,
}: {
  teams: readonly Team[];
  names: Record<Team, string>;
  keywords: readonly (readonly string[] | null)[];
  sheet: readonly (readonly (readonly RevealedClueView[])[])[];
}) {
  return (
    <div className="dc-kb">
      {teams.map((team) => (
        <section
          key={team}
          className={`dc-kb-team t${team}`}
          aria-label={`${names[team]} keywords`}
        >
          <h3>
            <span className={`dc-tdot t${team}`} /> {names[team]}
          </h3>
          <div className="dc-kb-cols">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="dc-kb-col">
                <span className="dc-kb-kw">
                  <i>{i + 1}</i>
                  {keywords[team]?.[i] ?? "?"}
                </span>
                <ul>
                  {(sheet[team]?.[i] ?? []).map((c) => (
                    <li key={`${c.round}-${c.clue}`}>
                      <small>R{c.round}</small>
                      {c.clue}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** How each AI tier at the table decides, and how it fared this game. */
export function TierLegend({ lines }: { lines: readonly TierLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="dc-tl-legend">
      {lines.map((l) => (
        <div key={l.tier} className="dc-tl-tier">
          <div className="hd">
            <b>{l.name}</b>
            <span>
              {l.sent > 0 && `sent ${l.sent} · decoded ${l.decoded} · leaked ${l.leaked}`}
              {l.sent > 0 && l.tried > 0 && " · "}
              {l.tried > 0 && `broke ${l.broke} of ${l.tried}`}
            </span>
          </div>
          <p>
            <span>Clues</span> {l.clues}
          </p>
          <p>
            <span>Guesses</span> {l.guesses}
          </p>
        </div>
      ))}
    </div>
  );
}
