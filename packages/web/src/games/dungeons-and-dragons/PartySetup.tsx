import type { Campaign, DndParty } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PlusIcon } from "../../components/icons";
import { D20Die } from "../../components/offline/D20Die";
import { Button, EmptyState, QueryBoundary } from "../../components/ui";
import { charactersQueryFn, deleteCharacter } from "../../lib/dnd-campaigns";
import { qk } from "../../lib/query-keys";
import { CharacterCard } from "./components/CharacterCard";
import { CharacterSheetModal } from "./components/CharacterSheetModal";
import { CreateCharacterModal } from "./components/CreateCharacterModal";
import { HeroBanner } from "./components/ui";

// Party setup: assemble or adjust THIS group's roster, then begin (or
// continue) the campaign. Character sheets are per party — two groups running
// the same one-shot never share adventurers or story trees.

type Props = {
  campaign: Campaign;
  party: DndParty;
  onStart: () => void;
};

export function PartySetup({ campaign, party, onStart }: Props) {
  const queryClient = useQueryClient();
  const [recruiting, setRecruiting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const charactersQuery = useQuery({
    queryKey: qk.dndCharacters(party.id),
    queryFn: charactersQueryFn(party.id),
    refetchInterval: (query) =>
      query.state.data?.characters.some((ch) => ch.status === "processing") ? 2500 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCharacter,
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.dndCharacters(party.id) }),
  });

  // Derive the previewed character from the live query so ledger edits show
  // up immediately after a save invalidates the list.
  const viewing =
    charactersQuery.data?.characters.find((ch) => ch.id === viewingId && ch.sheet) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6">
      <HeroBanner
        eyebrow={campaign.title}
        title={party.name}
        subtitle="Assemble the party, then step into the world."
      />

      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="font-fantasy text-2xs font-bold uppercase tracking-eyebrow text-amber-300/80">
          The party
        </h2>
        <Button variant="tinted" tone="amber" size="sm" onClick={() => setRecruiting(true)}>
          <PlusIcon className="h-4 w-4" />
          Recruit an adventurer
        </Button>
      </div>

      <QueryBoundary
        query={charactersQuery}
        loadingLabel="Opening the party ledger…"
        isEmpty={(data) => data.characters.length === 0}
        empty={
          <EmptyState
            tone="amber"
            icon={<D20Die count={20} className="h-6 w-6" />}
            title="No adventurers yet"
            description="Upload each player's character-sheet PDF and the scribes will copy them into this party's ledger."
            action={
              <Button variant="tinted" tone="amber" onClick={() => setRecruiting(true)}>
                Recruit the first adventurer
              </Button>
            }
          />
        }
      >
        {(data) => (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {data.characters.map((character) => (
              <li key={character.id}>
                <CharacterCard
                  character={character}
                  onView={() => setViewingId(character.id)}
                  onDelete={() => deleteMutation.mutate(character.id)}
                  deleting={deleteMutation.isPending && deleteMutation.variables === character.id}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>

      <div className="mt-2 flex flex-col items-center gap-2 pb-4">
        <Button variant="tinted" tone="amber" size="lg" onClick={onStart}>
          Begin the adventure
        </Button>
        <p className="text-3xs text-amber-200/40">
          The story tree opens where this party last left it.
        </p>
      </div>

      {recruiting && (
        <CreateCharacterModal
          campaignId={campaign.id}
          partyId={party.id}
          onClose={() => setRecruiting(false)}
        />
      )}
      {viewing && <CharacterSheetModal character={viewing} onClose={() => setViewingId(null)} />}
    </div>
  );
}
