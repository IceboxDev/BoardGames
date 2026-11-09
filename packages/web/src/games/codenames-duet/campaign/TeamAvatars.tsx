import type { CampaignSummary } from "@boardgames/core/protocol";
import { Avatar } from "../../../components/ui";

type Team = Pick<CampaignSummary, "members" | "partnerKind" | "guestName">;

/** The campaign's pair as overlapping avatars: its members, plus a guest or the AI partner. */
export function TeamAvatars({ campaign }: { campaign: Team }) {
  return (
    <span className="flex shrink-0 -space-x-2">
      {campaign.members.map((m) => (
        <Avatar key={m.userId} name={m.name} image={m.image} size="xs" ring />
      ))}
      {campaign.partnerKind === "guest" && campaign.guestName && (
        <Avatar name={campaign.guestName} size="xs" ring />
      )}
      {campaign.partnerKind === "ai" && <Avatar name="AI" size="xs" ring />}
    </span>
  );
}
