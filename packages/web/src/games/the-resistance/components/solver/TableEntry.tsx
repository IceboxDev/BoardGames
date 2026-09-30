import type { ResistanceRecord } from "@boardgames/core/games/the-resistance/record";
import {
  failsNeeded,
  openProposal,
  spyCount,
  tablePosition,
  teamSize,
} from "@boardgames/core/games/the-resistance/rules";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Chip,
  Eyebrow,
  Input,
  PageMain,
  SegmentedControl,
  Stepper,
  Surface,
} from "../../../../components/ui";
import {
  finishedPerspectives,
  type PerspectiveOption,
  PUBLIC_PERSPECTIVE,
  SOLVER_BASE,
  seatNamer,
} from "../../logic/solver";
import { loadTable, type SavedTable, saveTable } from "../../logic/storage";
import {
  entryStep,
  hasStarted,
  propose,
  recordResult,
  recordVotes,
  resize,
  setRoles,
  undo,
} from "../../logic/table-entry";
import { SolverDashboard } from "./SolverDashboard";

/** `solo/table/:id` — a tabletop game entered as it's played, analysed live. */
export default function TableEntry() {
  const { id = "" } = useParams();
  const [table, setTable] = useState<SavedTable | null>(() => loadTable(id));
  useEffect(() => {
    if (table) saveTable({ ...table, updatedAt: Date.now() });
  }, [table]);
  if (!table) return <Navigate to={SOLVER_BASE} replace />;
  return <TableEditor table={table} onChange={setTable} />;
}

function TableEditor({
  table,
  onChange,
}: {
  table: SavedTable;
  onChange: (next: SavedTable) => void;
}) {
  const navigate = useNavigate();
  const { record } = table;
  const name = useMemo(() => seatNamer(record.names), [record.names]);
  const setRecord = (next: ResistanceRecord) => onChange({ ...table, record: next });

  const perspectives = useMemo((): PerspectiveOption[] => {
    const options: PerspectiveOption[] = [];
    if (table.me) {
      const knownSpies =
        table.me.role === "spy"
          ? [...new Set([table.me.seat, ...table.knownSpies])].sort((a, b) => a - b)
          : [];
      options.push({
        id: "me",
        label: `Me (${name(table.me.seat)})`,
        perspective: { kind: "seat", seat: table.me.seat, role: table.me.role, knownSpies },
      });
    }
    if (record.roles) {
      return [
        ...options,
        ...finishedPerspectives(record, name).filter((o) => !o.id.startsWith("seat-")),
      ];
    }
    return [...options, PUBLIC_PERSPECTIVE];
  }, [table.me, table.knownSpies, record, name]);

  return (
    <PageMain width="full" padding="tight" className="overflow-y-auto">
      <SolverDashboard
        key={perspectives.map((p) => p.id).join()}
        record={record}
        perspectives={perspectives}
        header={
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={table.title}
              onChange={(e) => onChange({ ...table, title: e.target.value.slice(0, 80) })}
              aria-label="Game title"
              className="max-w-xs"
            />
            <Badge size="sm" tone="neutral">
              {record.playerCount} players · {spyCount(record.playerCount)} spies
            </Badge>
            <span className="ml-auto" />
            <Button size="sm" variant="secondary" onClick={() => setRecord(undo(record))}>
              Undo
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(SOLVER_BASE)}>
              Done
            </Button>
          </div>
        }
        entry={
          <Surface variant="raised" padding="lg" className="flex flex-col gap-4">
            {!hasStarted(record) && <SetupFields table={table} onChange={onChange} />}
            <StepEntry record={record} onRecord={setRecord} />
          </Surface>
        }
      />
    </PageMain>
  );
}

function SetupFields({
  table,
  onChange,
}: {
  table: SavedTable;
  onChange: (t: SavedTable) => void;
}) {
  const { record } = table;
  const n = record.playerCount;
  const setRecord = (next: ResistanceRecord) => onChange({ ...table, record: next });
  const seats = Array.from({ length: n }, (_, i) => i);
  const spiesVisible = table.me?.role === "spy" && !record.variants.blindSpies;

  return (
    <div className="flex flex-col gap-4">
      <Eyebrow size="md">Table</Eyebrow>
      <div className="flex flex-wrap items-end gap-6">
        <Stepper
          label="Players"
          value={n}
          min={5}
          max={10}
          size="sm"
          onChange={(count) =>
            onChange({ ...table, me: null, knownSpies: [], record: resize(record, count) })
          }
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-secondary">Variants</span>
          <div className="flex gap-2">
            <Chip
              size="sm"
              pressed={record.variants.targeting}
              onClick={() =>
                setRecord({
                  ...record,
                  variants: { ...record.variants, targeting: !record.variants.targeting },
                })
              }
            >
              Targeting
            </Chip>
            <Chip
              size="sm"
              pressed={record.variants.blindSpies}
              onClick={() =>
                setRecord({
                  ...record,
                  variants: { ...record.variants, blindSpies: !record.variants.blindSpies },
                })
              }
            >
              Blind Spies
            </Chip>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {seats.map((seat) => (
          <Input
            key={seat}
            value={record.names?.[seat] ?? ""}
            placeholder={`P${seat + 1}`}
            aria-label={`Seat ${seat + 1} name`}
            onChange={(e) =>
              setRecord({
                ...record,
                names: seats.map((i) =>
                  i === seat ? e.target.value.slice(0, 40) : (record.names?.[i] ?? ""),
                ),
              })
            }
          />
        ))}
      </div>
      <SeatChoice
        label="First leader"
        n={n}
        name={seatNamer(record.names)}
        value={[record.firstLeader]}
        onToggle={(seat) => setRecord({ ...record, firstLeader: seat })}
      />
      <SeatChoice
        label="I sat at (optional — analyses from your view)"
        n={n}
        name={seatNamer(record.names)}
        value={table.me ? [table.me.seat] : []}
        onToggle={(seat) =>
          onChange({
            ...table,
            knownSpies: [],
            me: table.me?.seat === seat ? null : { seat, role: table.me?.role ?? "resistance" },
          })
        }
      />
      {table.me && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-fg-secondary">I was</span>
          <SegmentedControl<"resistance" | "spy">
            size="xs"
            shape="pill"
            value={table.me.role}
            onChange={(role) =>
              onChange({ ...table, knownSpies: [], me: table.me ? { ...table.me, role } : null })
            }
            options={[
              { value: "resistance", label: "Resistance", tone: "sky" },
              { value: "spy", label: "Spy", tone: "rose" },
            ]}
          />
        </div>
      )}
      {spiesVisible && table.me && (
        <SeatChoice
          label={`My fellow spies (${spyCount(n) - 1})`}
          n={n}
          name={seatNamer(record.names)}
          value={table.knownSpies}
          disabled={[table.me.seat]}
          onToggle={(seat) =>
            onChange({
              ...table,
              knownSpies: table.knownSpies.includes(seat)
                ? table.knownSpies.filter((s) => s !== seat)
                : [...table.knownSpies, seat].slice(-(spyCount(n) - 1)),
            })
          }
        />
      )}
    </div>
  );
}

function SeatChoice({
  label,
  n,
  name,
  value,
  onToggle,
  disabled = [],
}: {
  label: string;
  n: number;
  name: (seat: number) => string;
  value: readonly number[];
  onToggle: (seat: number) => void;
  disabled?: readonly number[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-secondary">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: n }, (_, seat) => (
          <Chip
            // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
            key={seat}
            size="sm"
            pressed={value.includes(seat)}
            disabled={disabled.includes(seat)}
            onClick={() => onToggle(seat)}
          >
            {name(seat)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function StepEntry({
  record,
  onRecord,
}: {
  record: ResistanceRecord;
  onRecord: (next: ResistanceRecord) => void;
}) {
  const n = record.playerCount;
  const name = seatNamer(record.names);
  const pos = tablePosition(record);
  const open = openProposal(record);
  const step = entryStep(record);
  const [picks, setPicks] = useState<number[]>([]);
  const [mission, setMission] = useState<number | null>(null);
  const [rejecters, setRejecters] = useState<number[]>([]);
  const [fails, setFails] = useState(0);
  const [spies, setSpies] = useState<number[]>([]);
  const chosen =
    mission !== null && pos.openMissions.includes(mission) ? mission : pos.openMissions[0];
  const size = chosen === undefined ? 0 : teamSize(n, chosen);
  const toggle = (list: number[], seat: number, max = n) =>
    list.includes(seat)
      ? list.filter((s) => s !== seat)
      : list.length < max
        ? [...list, seat]
        : list;
  const reset = () => {
    setPicks([]);
    setRejecters([]);
    setFails(0);
  };

  if (step === "over") {
    const need = spyCount(n);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-fg-strong">
          {pos.winner === "resistance" ? "The Resistance won." : "The Spies won."}{" "}
          {record.roles ? "Roles entered — grading uses them." : "Who were the spies?"}
        </p>
        {!record.roles && (
          <>
            <SeatChoice
              label={`Spies (${spies.length}/${need})`}
              n={n}
              name={name}
              value={spies}
              onToggle={(seat) => setSpies((cur) => toggle(cur, seat, need))}
            />
            <div>
              <Button
                size="sm"
                variant="primary"
                disabled={spies.length !== need}
                onClick={() => onRecord(setRoles(record, spies))}
              >
                Reveal roles
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (step === "votes" && open) {
    const yes = n - rejecters.length;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-primary">
          <span className="font-semibold">{name(open.leader)}</span> proposed{" "}
          {open.team.map(name).join(", ")}. Tap everyone who{" "}
          <span className="text-rose-300">rejected</span>.
        </p>
        <SeatChoice
          label={`Rejected by (${yes}–${rejecters.length}: ${yes * 2 > n ? "approved" : "rejected"})`}
          n={n}
          name={name}
          value={rejecters}
          onToggle={(seat) => setRejecters((cur) => toggle(cur, seat))}
        />
        <div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onRecord(
                recordVotes(
                  record,
                  Array.from({ length: n }, (_, s) => !rejecters.includes(s)),
                ),
              );
              reset();
            }}
          >
            Record vote
          </Button>
        </div>
      </div>
    );
  }

  if (step === "result" && open) {
    const needed = failsNeeded(n, open.mission);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-primary">
          Mission {open.mission + 1}: {open.team.map(name).join(", ")}
          {needed > 1 && <span className="text-fg-muted"> · needs 2 fails</span>}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-fg-secondary">Fail cards</span>
          <SegmentedControl<number>
            size="sm"
            shape="pill"
            value={fails}
            onChange={setFails}
            options={Array.from({ length: open.team.length + 1 }, (_, k) => ({
              value: k,
              label: String(k),
              tone: k === 0 ? "sky" : "rose",
            }))}
          />
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onRecord(recordResult(record, fails));
              reset();
            }}
          >
            {fails < needed ? "Record success" : "Record failure"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-primary">
        <span className="font-semibold">{name(pos.leader)}</span> leads
        {pos.rejections > 0 && (
          <span className="text-amber-300"> · {pos.rejections} rejected this round</span>
        )}
        . Pick the {size} they propose.
      </p>
      {pos.openMissions.length > 1 && (
        <SegmentedControl<number>
          size="xs"
          shape="pill"
          value={chosen ?? null}
          onChange={(m) => {
            setMission(m);
            setPicks([]);
          }}
          options={pos.openMissions.map((m) => ({ value: m, label: `Mission ${m + 1}` }))}
        />
      )}
      <SeatChoice
        label={`Team (${picks.length}/${size})`}
        n={n}
        name={name}
        value={picks}
        onToggle={(seat) => setPicks((cur) => toggle(cur, seat, size))}
      />
      <div>
        <Button
          size="sm"
          variant="primary"
          disabled={picks.length !== size || chosen === undefined}
          onClick={() => {
            if (chosen === undefined) return;
            onRecord(propose(record, chosen, picks));
            reset();
          }}
        >
          Record proposal
        </Button>
      </div>
    </div>
  );
}
