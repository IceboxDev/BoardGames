import { canonicalDecryptoModel } from "@boardgames/core/games/decrypto/ai/models";
import type {
  DecryptoPlayerView,
  RoundSummaryView,
  Team,
} from "@boardgames/core/games/decrypto/types";
import { artUrl } from "../../logic/art";
import { fmtCode, hasHumanTeammate, operatorName, seatActivity, teamName } from "../../logic/desk";
import { verdictFor } from "../../logic/verdict";
import { TeamChat } from "../TeamChat";
import { Lamp } from "./Instruments";
import { VerdictLines } from "./Verdict";

// The two rails beside the desk: the operators (both teams' seats with their
// lamps, and the team line when a teammate is a person) and the history,
// one telegram per revealed transmission.

const CREST: Record<string, "crest-scout" | "crest-analyst" | "crest-mastermind"> = {
  "decrypto-medium": "crest-scout",
  "decrypto-hard": "crest-analyst",
  "decrypto-expert": "crest-mastermind",
};

function sealUrl(team: Team): string | undefined {
  return artUrl(team === 0 ? "seal-white" : "seal-black");
}

function Avatar({
  view,
  seat,
  name,
  image,
}: {
  view: DecryptoPlayerView;
  seat: number;
  name: string;
  image: string | null;
}) {
  const entry = view.seats.find((s) => s.seat === seat);
  const crest = entry?.isAi ? CREST[canonicalDecryptoModel(entry.model ?? "")] : undefined;
  const src = crest ? artUrl(crest) : image;
  return (
    <span
      className="dc-avatar"
      style={src ? { backgroundImage: `url("${src}")` } : undefined}
      aria-hidden
    >
      {src ? null : name === "You" ? "YOU" : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function phaseLine(view: DecryptoPlayerView): string {
  const tx = view.transmissions[view.txIdx];
  const who = tx ? teamName(view, tx.team) : "";
  switch (view.phase) {
    case "clueWriting":
      return "Encryptors are writing";
    case "guessing":
      return `Transmission ${view.txIdx + 1} of ${view.transmissions.length} · ${who}'s code`;
    case "reveal":
      return `Revealing ${who}'s code`;
    case "roundEnd":
      return "Round closing";
    case "gameOver":
      return "Game over";
    default:
      return "Dealing codes";
  }
}

export function Operators({
  view,
  playerNames,
  images,
  onChat,
}: {
  view: DecryptoPlayerView;
  playerNames: readonly (string | null)[];
  images: readonly (string | null)[];
  onChat: (text: string) => void;
}) {
  const teams: Team[] = view.team === 0 ? [0, 1] : [1, 0];
  return (
    <div className="dc-ops">
      <div className="dc-ops-status">
        <span className="dc-ops-emblem" aria-hidden />
        <div>
          <div className="text-sm font-semibold text-fg-strong">
            Round {Math.max(view.round, 1)}{" "}
            <span className="font-normal text-fg-muted">of {view.maxRounds}</span>
          </div>
          <div className="text-xs text-fg-secondary">{phaseLine(view)}</div>
        </div>
      </div>

      {teams.map((team) => {
        const seal = sealUrl(team);
        return (
          <div key={team} className="dc-ops-team">
            <div className="dc-ops-th">
              {seal ? (
                <span className="seal" style={{ backgroundImage: `url("${seal}")` }} />
              ) : (
                <span className={`dc-tdot t${team}`} />
              )}
              {teamName(view, team)}
              {team === view.team && <em>your team</em>}
            </div>
            {view.seats
              .filter((s) => s.team === team)
              .map((s) => {
                const name = operatorName(view, s.seat, playerNames);
                const activity = seatActivity(view, s.seat);
                const role = s.isAi
                  ? "AI"
                  : s.seat === view.seat
                    ? ""
                    : team === view.team
                      ? "teammate"
                      : "opponent";
                return (
                  <div key={s.seat} className={`dc-op${s.seat === view.seat ? " me" : ""}`}>
                    <Avatar view={view} seat={s.seat} name={name} image={images[s.seat] ?? null} />
                    <div className="dc-op-name">
                      {name}
                      {role && <span>{role}</span>}
                      {s.isEncryptor && <span className="enc">encryptor</span>}
                    </div>
                    <div className="dc-op-act">
                      {activity.text && (
                        <>
                          <Lamp state={activity.lamp} />
                          {activity.text}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}

      {hasHumanTeammate(view) && view.phase !== "gameOver" && (
        <div className="dc-chat">
          <div className="dc-ops-th">Team line</div>
          <TeamChat view={view} playerNames={playerNames} onChat={onChat} />
        </div>
      )}
    </div>
  );
}

function Telegram({
  view,
  round,
  tx,
}: {
  view: DecryptoPlayerView;
  round: number;
  tx: RoundSummaryView["transmissions"][number];
}) {
  const seal = sealUrl(tx.team);
  const verdict = verdictFor(view, { round, ...tx });
  return (
    <div className={`dc-tg ${verdict.tone}`}>
      <div className="dc-tg-h">
        {seal ? <img src={seal} alt="" /> : <span className={`dc-tdot t${tx.team}`} />}
        {teamName(view, tx.team)} {fmtCode(tx.code)}
      </div>
      <div>
        {tx.skipped || !tx.clues
          ? tx.skipReason === "ai"
            ? "No clues — the AI encryptor failed"
            : "No clues before the timer ran out"
          : tx.clues.join(" / ")}
      </div>
      <VerdictLines verdict={verdict} details={false} compact />
    </div>
  );
}

/** The history rail: newest round first, one telegram per transmission. */
export function History({ view }: { view: DecryptoPlayerView }) {
  const live =
    view.phase !== "gameOver" && !view.roundSummaries.some((r) => r.round === view.round);
  const rounds = [...view.roundSummaries].reverse();
  return (
    <div className="dc-hist">
      {live && view.round > 0 && <div className="dc-hist-rh">Round {view.round} · on the line</div>}
      {rounds.map((r) => (
        <div key={r.round}>
          <div className="dc-hist-rh">Round {r.round}</div>
          {r.transmissions.map((t) => (
            <Telegram key={t.team} view={view} round={r.round} tx={t} />
          ))}
        </div>
      ))}
      {rounds.length === 0 && !live && (
        <p className="text-xs text-fg-muted">Revealed codes will collect here.</p>
      )}
    </div>
  );
}
