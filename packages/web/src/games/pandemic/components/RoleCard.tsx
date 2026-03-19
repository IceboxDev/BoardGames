import type { RoleDef } from "@boardgames/core/games/pandemic/roles";
import { PORTRAIT_URLS } from "../rendering/role-portraits";

interface RoleCardProps {
  role: RoleDef;
  playerIndex?: number;
  width?: number;
  height?: number;
  variant?: "full" | "compact";
  active?: boolean;
}

export default function RoleCard({
  role,
  playerIndex,
  width = 200,
  height,
  variant = "full",
  active = false,
}: RoleCardProps) {
  if (variant === "compact") {
    return (
      <CompactCard
        role={role}
        playerIndex={playerIndex}
        width={width}
        height={height ?? Math.round(width * 1.35)}
        active={active}
      />
    );
  }

  return <FullCard role={role} playerIndex={playerIndex} width={width} active={active} />;
}

function FullCard({
  role,
  playerIndex,
  width,
  active,
}: {
  role: RoleDef;
  playerIndex?: number;
  width: number;
  active: boolean;
}) {
  const height = Math.round(width * 1.7);
  const portraitH = Math.round(width * 0.85);
  const pad = Math.round(width * 0.06);
  const nameSize = `clamp(11px, ${width * 0.07}px, 15px)`;
  const abilitySize = `clamp(9px, ${width * 0.055}px, 11px)`;
  const badgeSize = Math.max(18, Math.round(width * 0.1));
  const gradientH = Math.round(portraitH * 0.35);

  return (
    <div
      className={`relative flex flex-shrink-0 flex-col overflow-hidden ${active ? "ring-2 ring-white/80 ring-offset-2 ring-offset-surface-900" : ""}`}
      style={{
        width,
        height,
        borderRadius: 12,
        border: `2px solid ${role.pawnColor}`,
        background: "#0c0c14",
        boxShadow: `0 0 20px ${role.pawnColor}40, 0 2px 8px rgba(0,0,0,0.5)`,
      }}
    >
      {/* Portrait with gradient bleed */}
      <div className="relative flex-shrink-0 overflow-hidden" style={{ height: portraitH }}>
        <img
          src={PORTRAIT_URLS[role.id]}
          alt={role.name}
          className="h-full w-full object-cover object-top"
          draggable={false}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: gradientH,
            background: "linear-gradient(to bottom, transparent, #0c0c14)",
          }}
        />
      </div>

      {/* Accent divider */}
      <div
        className="flex-shrink-0"
        style={{
          height: 1,
          background: `${role.pawnColor}59`,
          marginTop: -1,
        }}
      />

      {/* Info panel — fills remaining space */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ padding: `${pad}px ${pad}px ${Math.round(pad * 1.1)}px` }}
      >
        {/* Name row — fixed height so abilities don't shift with 1-line vs 2-line names */}
        <div
          className="flex flex-shrink-0 items-start justify-between"
          style={{
            height: Math.round(width * 0.19),
            marginBottom: Math.round(pad * 0.4),
          }}
        >
          <span
            className="font-bold uppercase"
            style={{
              fontSize: nameSize,
              letterSpacing: "0.06em",
              color: "#f0f0f4",
              lineHeight: 1.2,
            }}
          >
            {role.name}
          </span>
          {playerIndex != null && (
            <span
              className="flex flex-shrink-0 items-center justify-center font-bold"
              style={{
                width: badgeSize,
                height: badgeSize,
                borderRadius: "50%",
                background: role.pawnColor,
                color: role.id === "scientist" ? "#222" : "#fff",
                fontSize: Math.round(badgeSize * 0.55),
                marginLeft: 6,
              }}
            >
              {playerIndex + 1}
            </span>
          )}
        </div>

        {/* Abilities */}
        <div className="flex min-h-0 flex-1 flex-col" style={{ gap: Math.round(pad * 0.5) }}>
          {role.abilities.map((ability) => (
            <div key={ability} className="flex items-start" style={{ gap: Math.round(pad * 0.45) }}>
              <span
                className="mt-[5px] flex-shrink-0 rounded-full"
                style={{
                  width: 5,
                  height: 5,
                  background: role.pawnColor,
                }}
              />
              <span
                style={{
                  fontSize: abilitySize,
                  lineHeight: 1.5,
                  color: "#a0a0aa",
                }}
              >
                {ability}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompactCard({
  role,
  playerIndex,
  width,
  height,
  active,
}: {
  role: RoleDef;
  playerIndex?: number;
  width: number;
  height: number;
  active: boolean;
}) {
  const nameSize = `clamp(9px, ${width * 0.075}px, 13px)`;
  const barH = Math.max(26, Math.round(height * 0.2));
  const badgeSize = Math.max(14, Math.round(barH * 0.65));

  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden ${active ? "ring-2 ring-white/80 ring-offset-2 ring-offset-surface-900" : ""}`}
      style={{
        width,
        height,
        borderRadius: 8,
        border: `2px solid ${role.pawnColor}`,
        boxShadow: `0 0 14px ${role.pawnColor}30, 0 2px 6px rgba(0,0,0,0.4)`,
      }}
    >
      <img
        src={PORTRAIT_URLS[role.id]}
        alt={role.name}
        className="absolute inset-0 h-full w-full object-cover object-top"
        draggable={false}
      />

      {/* Gradient fade into name bar */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: barH + 20,
          background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.85))",
        }}
      />

      {/* Name bar */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between"
        style={{
          height: barH,
          padding: `0 ${Math.round(width * 0.06)}px`,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          background: "rgba(0, 0, 0, 0.5)",
        }}
      >
        <span
          className="font-bold uppercase"
          style={{
            fontSize: nameSize,
            letterSpacing: "0.05em",
            color: "#f0f0f4",
            lineHeight: 1.1,
          }}
        >
          {role.name}
        </span>
        {playerIndex != null && (
          <span
            className="flex flex-shrink-0 items-center justify-center font-bold"
            style={{
              width: badgeSize,
              height: badgeSize,
              borderRadius: "50%",
              background: role.pawnColor,
              color: role.id === "scientist" ? "#222" : "#fff",
              fontSize: Math.round(badgeSize * 0.6),
              marginLeft: 4,
            }}
          >
            {playerIndex + 1}
          </span>
        )}
      </div>
    </div>
  );
}
