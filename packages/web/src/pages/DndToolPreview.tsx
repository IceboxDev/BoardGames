import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import type {
  ActionCard,
  Campaign,
  CampaignCheckpoint,
  DndCharacter,
  DndCombat,
} from "@boardgames/core/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CampaignTome } from "../games/dungeons-and-dragons/components/CampaignTome";
import { CharacterCard } from "../games/dungeons-and-dragons/components/CharacterCard";
import { CharacterSheetModal } from "../games/dungeons-and-dragons/components/CharacterSheetModal";
import { CombatPanel } from "../games/dungeons-and-dragons/components/CombatPanel";
import { HallHero } from "../games/dungeons-and-dragons/components/HallHero";
import { PlayerCardLarge } from "../games/dungeons-and-dragons/components/PlayerCardLarge";
import { DndGameScreen } from "../games/dungeons-and-dragons/DndGameScreen";
import { qk } from "../lib/query-keys";

// Dev-only preview of the D&D DM tool at `/dev/dnd-tool-preview` — every
// surface with mock data, no auth/server/OpenAI needed. The characters query
// cache is seeded so the game screen's party fan renders without a server.

const STRAHD_CHECKPOINTS: CampaignCheckpoint[] = [
  {
    title: "Into the Mists",
    description:
      "The fog of Barovia swallows the road behind the party — there is no way home but through.",
    arrivalText:
      "The fog does not lift so much as decide to let you see. A road of packed black earth runs ahead between walls of mist, and somewhere beyond them, wolves begin to howl — first one, then many.",
    kind: "quest",
  },
  {
    title: "Death House",
    description:
      "A dollhouse-perfect townhouse lures the party in; the basement cult demands a sacrifice.",
    arrivalText: null,
    kind: "location",
  },
  {
    title: "The Burgomaster's Funeral",
    description: "Ireena Kolyana buries her father while the devil watches from the castle.",
    arrivalText: null,
    kind: "revelation",
  },
  {
    title: "The Fanes of the Forest",
    description: "Wintersplinter marches on Vallaki — a set-piece defense of the town square.",
    arrivalText: null,
    kind: "battle",
  },
  {
    title: "The Sunsword",
    description:
      "The lost blade of the Morninglord surfaces in a werewolf den, wrapped in riddles.",
    arrivalText: null,
    kind: "treasure",
  },
  {
    title: "The Amber Temple",
    description: "Dark gifts whisper from amber sarcophagi; every boon costs a piece of a soul.",
    arrivalText: null,
    kind: "revelation",
  },
  {
    title: "Castle Ravenloft",
    description:
      "The heart of the mists. Strahd waits in the place of his choosing — the reading of the cards decides where.",
    arrivalText: null,
    kind: "finale",
  },
];

const STRAHD: Campaign = {
  id: "preview-strahd",
  status: "ready",
  title: "Curse of Strahd",
  tagline: "A gothic horror sandbox where the villain always has the home advantage.",
  setting: "Barovia, the Domains of Dread",
  levelRange: "Levels 1–10",
  sourceFilename: "curse-of-strahd.pdf",
  sourceSizeBytes: 18_400_000,
  checkpoints: STRAHD_CHECKPOINTS,
  error: null,
  createdAt: "2026-07-01 19:30:00",
};

const PROCESSING_CAMPAIGN: Campaign = {
  ...STRAHD,
  id: "preview-processing",
  status: "processing",
  title: null,
  tagline: null,
  setting: null,
  levelRange: null,
  sourceFilename: "lost-mine-of-phandelver.pdf",
  sourceSizeBytes: 9_100_000,
  checkpoints: [],
};

const ERROR_CAMPAIGN: Campaign = {
  ...PROCESSING_CAMPAIGN,
  id: "preview-error",
  status: "error",
  sourceFilename: "homebrew-oneshot-scan.pdf",
  sourceSizeBytes: 22_000_000,
  error: "Extraction failed: the document appears to be image-only scans with no readable text.",
};

const VEX_SHEET: NonNullable<DndCharacter["sheet"]> = {
  name: "Vex the Bold",
  playerName: "Mantas",
  race: "Half-Elf",
  class: "Paladin",
  level: 5,
  alignment: "Lawful Good",
  abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  maxHp: 44,
  armorClass: 18,
  speed: "30 ft.",
  skills: [
    { name: "Athletics", modifier: 6, proficiency: "proficient" as const },
    { name: "Persuasion", modifier: 6, proficiency: "proficient" as const },
    { name: "Perception", modifier: 2, proficiency: "proficient" as const },
    { name: "Religion", modifier: 2, proficiency: "proficient" as const },
    { name: "Stealth", modifier: -1, proficiency: "none" as const },
  ],
  armorProficiencies: ["All armor", "Shields"],
  weaponProficiencies: ["Simple weapons", "Martial weapons"],
  toolProficiencies: ["Smith's tools"],
  savingThrows: ["Wisdom", "Charisma"],
  languages: ["Common", "Elvish"],
  proficiencies: [],
  equipment: ["Longsword", "Shield", "Chain mail", "Holy symbol of Lathander"],
  spells: ["Bless", "Shield of Faith", "Cure Wounds", "Thunderous Smite"],
  personality: "Charges first, apologizes later. Cannot walk past an injustice.",
  backstory:
    "A disgraced knight of the Order of the Gauntlet, stripped of her title after disobeying orders to save a village. She followed the mists into Barovia chasing rumors of her missing squire.",
};

const PARTY_META = {
  id: "preview-party",
  campaignId: "preview-strahd",
  name: "The Thursday Group",
  memberCount: 2,
  createdAt: "2026-07-04 18:00:00",
};

const VEX: DndCharacter = {
  id: "preview-vex",
  campaignId: STRAHD.id,
  partyId: PARTY_META.id,
  status: "ready",
  sheet: VEX_SHEET,
  sourceFilename: "vex-character-sheet.pdf",
  sourceSizeBytes: 240_000,
  error: null,
  createdAt: "2026-07-05 18:00:00",
};

const PARTY: DndCharacter[] = [
  VEX,
  {
    ...VEX,
    id: "preview-whisper",
    sheet: {
      ...VEX_SHEET,
      name: "Whisper",
      playerName: "Riccardo",
      race: "Tabaxi",
      class: "Rogue (Arcane Trickster)",
      level: 5,
      alignment: "Chaotic Neutral",
      abilities: { str: 8, dex: 18, con: 12, int: 14, wis: 10, cha: 13 },
      maxHp: 33,
      armorClass: 15,
      skills: [
        { name: "Stealth", modifier: 8, proficiency: "expertise" as const },
        { name: "Sleight of Hand", modifier: 8, proficiency: "expertise" as const },
        { name: "Acrobatics", modifier: 4, proficiency: "proficient" as const },
        { name: "Perception", modifier: 4, proficiency: "proficient" as const },
      ],
      armorProficiencies: ["Light armor"],
      weaponProficiencies: ["Simple weapons", "Scimitar", "Shortsword", "Whip"],
      toolProficiencies: ["Thieves' tools"],
      savingThrows: ["Dexterity", "Intelligence"],
      languages: ["Common", "Thieves' Cant"],
      spells: ["Mage Hand", "Minor Illusion", "Disguise Self"],
      personality: "Collects shiny things and secrets, in that order.",
      backstory: null,
    },
    sourceFilename: "whisper.pdf",
  },
  {
    ...VEX,
    id: "preview-processing-char",
    status: "processing",
    sheet: null,
    sourceFilename: "brom-barbarian.pdf",
  },
  {
    ...VEX,
    id: "preview-error-char",
    status: "error",
    sheet: null,
    error: "Extraction failed: the sheet is a photo with no readable text.",
    sourceFilename: "grix-scan.pdf",
  },
];

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="font-fantasy px-1 text-2xs font-bold uppercase tracking-[0.3em] text-amber-300/80">
      {children}
    </h2>
  );
}

const NPCS = [
  {
    id: "npc-strahd",
    campaignId: STRAHD.id,
    name: "Strahd von Zarovich",
    category: "npc" as const,
    role: "Vampire lord — the campaign's antagonist",
    kind: "Undead (vampire)",
    location: "Castle Ravenloft",
    abilities: { str: 18, dex: 18, con: 18, int: 20, wis: 15, cha: 18 },
    maxHp: 144,
    armorClass: 16,
    description:
      "Charming, patient, and always three moves ahead. Treats the party as entertainment until they become a threat.",
    secrets: "He believes Ireena is Tatyana reborn and will not permit her death.",
  },
  {
    id: "npc-ireena",
    campaignId: STRAHD.id,
    name: "Ireena Kolyana",
    category: "npc" as const,
    role: "The burgomaster's daughter, hunted by the devil",
    kind: "Human noble",
    location: "Barovia village",
    abilities: null,
    maxHp: 9,
    armorClass: 11,
    description: "Brave beyond her means; twice bitten and refusing to hide.",
    secrets: null,
  },
];

const NODES = [
  {
    id: "node-root-1",
    campaignId: STRAHD.id,
    partyId: PARTY_META.id,
    waypointIndex: 0,
    parentId: null,
    nodeType: "story" as const,
    dangerTable: null,
    trigger: "Follow the wolf howls off the road",
    summary: "The mists tighten; a shuttered farmhouse appears ahead.",
    readText:
      "The howls pull you off the Old Svalich Road before you notice the fog closing behind you. Ahead, a farmhouse leans into the hillside, its shutters nailed from the inside. A thin line of chimney smoke rises — someone is home, and hiding.",
    createdAt: "2026-07-05 19:00:00",
  },
  {
    id: "node-child-1",
    campaignId: STRAHD.id,
    partyId: PARTY_META.id,
    waypointIndex: 0,
    parentId: "node-root-1",
    nodeType: "story" as const,
    dangerTable: null,
    trigger: "Knock and announce yourselves",
    summary: "A woman's voice begs them to prove they cast a shadow.",
    readText:
      'A long silence. Then a woman\'s voice, cracked with fear: "Hold your lantern low. Show me your shadow on the door. The ones without shadows came last night."',
    createdAt: "2026-07-05 19:05:00",
  },
  {
    id: "node-initiative-1",
    campaignId: STRAHD.id,
    partyId: PARTY_META.id,
    waypointIndex: 0,
    parentId: "node-root-1",
    nodeType: "initiative" as const,
    dangerTable: {
      die: "1d6",
      description: "Second round, initiative count 20: the mists send something more.",
      entries: [
        { roll: "1", text: "two wolves on the prowl", creatures: [{ name: "Wolf", count: "2" }] },
        { roll: "2", text: "a swarm of ravens", creatures: [] },
      ],
    },
    trigger: "Roll initiative",
    summary: "Two shadow-wolves burst from the treeline.",
    readText:
      "The howls stop. That is worse. Two shapes of matted fur and moonless dark detach from the treeline at a dead run — steel out, roll initiative.",
    createdAt: "2026-07-05 19:07:00",
  },
  {
    id: "node-child-2",
    campaignId: STRAHD.id,
    partyId: PARTY_META.id,
    waypointIndex: 0,
    parentId: "node-root-1",
    nodeType: "story" as const,
    dangerTable: null,
    trigger: "Pick the storm-cellar lock",
    summary: "The cellar is stocked for a siege — and recently slept in.",
    readText:
      "The lock gives with a soft click. Root vegetables, salted meat, and four bedrolls arranged in a square — one of them still warm.",
    createdAt: "2026-07-05 19:06:00",
  },
];

const COMBAT: DndCombat = {
  id: "preview-combat",
  partyId: PARTY_META.id,
  nodeId: "node-initiative-1",
  status: "active",
  round: 2,
  turnIndex: 1,
  combatants: [
    {
      key: "c0",
      name: "Whisper",
      kind: "pc",
      characterId: "preview-whisper",
      count: 1,
      initiative: 21,
      maxHp: 33,
      hp: 33,
      conditions: [],
      position: "on the cart roof, 20 ft from the wolves",
      notes: "",
    },
    {
      key: "c1",
      name: "Vex the Bold",
      kind: "pc",
      characterId: "preview-vex",
      count: 1,
      initiative: 14,
      maxHp: 44,
      hp: 31,
      conditions: [],
      position: "front line, engaged",
      notes: "one L1 slot spent",
    },
    {
      key: "c2",
      name: "Wolf",
      kind: "enemy",
      characterId: null,
      count: 2,
      initiative: 9,
      maxHp: 11,
      hp: 4,
      conditions: ["prone"],
      position: "engaged with Vex",
      notes: "one wolf bloodied",
    },
  ],
  createdAt: "2026-07-05 19:08:00",
};

const VEX_ACTIONS: ActionCard[] = [
  {
    name: "Longsword",
    kind: "attack",
    roll: "To hit d20+6; 1d8+3 slashing (1d10+3 two-handed)",
    note: "Melee, 5 ft.",
  },
  {
    name: "Divine Smite",
    kind: "feature",
    roll: "+2d8 radiant on a melee hit (L1 slot)",
    note: "Decide after the hit lands; +1d8 vs undead/fiends.",
  },
  {
    name: "Bless",
    kind: "spell",
    roll: "3 allies add 1d4 to attacks & saves",
    note: "Concentration, 1 min. L1 slot.",
  },
  { name: "Cure Wounds", kind: "spell", roll: "Touch, heal 1d8+3", note: "L1 slot." },
  {
    name: "Lay on Hands",
    kind: "feature",
    roll: "Heal up to 25 HP from the pool",
    note: "Action; splittable.",
  },
  {
    name: "Dash / Dodge / Help",
    kind: "basic",
    roll: "",
    note: "Standard actions — always available.",
  },
];

const WHISPER_ACTIONS: ActionCard[] = [
  {
    name: "Shortsword",
    kind: "attack",
    roll: "To hit d20+7; 1d6+4 piercing",
    note: "Melee, finesse — sneak attack eligible.",
  },
  {
    name: "Shortbow",
    kind: "attack",
    roll: "To hit d20+7; 1d6+4 piercing",
    note: "Range 80/320 ft.",
  },
  {
    name: "Sneak Attack",
    kind: "feature",
    roll: "+3d6 on one hit/turn",
    note: "Needs advantage or an adjacent ally.",
  },
  {
    name: "Cunning Action",
    kind: "bonus",
    roll: "Dash, Disengage, or Hide",
    note: "Bonus action, every turn.",
  },
  {
    name: "Steady Aim",
    kind: "bonus",
    roll: "Advantage on next attack",
    note: "Bonus action; speed becomes 0 this turn.",
  },
  {
    name: "Mage Hand",
    kind: "spell",
    roll: "Spectral hand, 30 ft",
    note: "Cantrip — invisible (Arcane Trickster).",
  },
  {
    name: "Dash / Dodge / Help",
    kind: "basic",
    roll: "",
    note: "Standard actions — always available.",
  },
];

const FILES = [
  {
    id: "file-module",
    campaignId: STRAHD.id,
    kind: "module" as const,
    filename: "curse-of-strahd.pdf",
    sizeBytes: 18_400_000,
    createdAt: "2026-07-01 19:30:00",
  },
  {
    id: "file-vex",
    campaignId: STRAHD.id,
    kind: "character-sheet" as const,
    filename: "vex-character-sheet.pdf",
    sizeBytes: 240_000,
    createdAt: "2026-07-05 18:00:00",
  },
];

export default function DndToolPreview() {
  const queryClient = useQueryClient();
  const [viewingSheet, setViewingSheet] = useState(false);
  // Seed the game screen's internal queries (background refetch will fail
  // without a server, which keeps the seeded data — fine for a styling
  // preview).
  useState(() => {
    queryClient.setQueryData(qk.dndCharacters(PARTY_META.id), { characters: PARTY });
    queryClient.setQueryData(qk.dndNpcs(STRAHD.id), { npcs: NPCS });
    queryClient.setQueryData(qk.dndNodes(PARTY_META.id), { nodes: NODES });
    queryClient.setQueryData(qk.dndFiles(), { files: FILES });
    queryClient.setQueryData(qk.dndCombat(PARTY_META.id), { combat: COMBAT });
    queryClient.setQueryData(qk.dndActions("preview-vex"), { cards: VEX_ACTIONS });
    queryClient.setQueryData(qk.dndActions("preview-whisper"), { cards: WHISPER_ACTIONS });
    queryClient.setQueryData(qk.dndHistory(PARTY_META.id), {
      entries: [
        {
          id: "h1",
          partyId: PARTY_META.id,
          nodeId: null,
          kind: "arrival" as const,
          text: "The party reaches Into the Mists.",
          createdAt: "2026-07-05 19:00:00",
        },
        {
          id: "h2",
          partyId: PARTY_META.id,
          nodeId: null,
          kind: "dm-narration" as const,
          text: "The fog does not lift so much as decide to let you see. A road of packed black earth runs ahead between walls of mist.",
          createdAt: "2026-07-05 19:00:01",
        },
        {
          id: "h3",
          partyId: PARTY_META.id,
          nodeId: "node-root-1",
          kind: "player-action" as const,
          text: "Follow the wolf howls off the road",
          createdAt: "2026-07-05 19:05:00",
        },
        {
          id: "h4",
          partyId: PARTY_META.id,
          nodeId: "node-root-1",
          kind: "dm-narration" as const,
          text: "The howls pull you off the Old Svalich Road. Ahead, a farmhouse leans into the hillside. Vex the Bold readies her Longsword; Whisper casts Mage Hand.",
          createdAt: "2026-07-05 19:05:01",
        },
        {
          id: "h5",
          partyId: PARTY_META.id,
          nodeId: "node-initiative-1",
          kind: "combat" as const,
          text: "Two shadow-wolves burst from the treeline. Turn order: Whisper 19, Vex the Bold 14, shadow-wolves 8.",
          createdAt: "2026-07-05 19:07:00",
        },
      ],
    });
    return null;
  });

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#1a0606] via-surface-950 to-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-6">
        <HallHero />

        <SectionTitle>Hall — campaign tomes</SectionTitle>
        <ul className="flex flex-col gap-3">
          {[STRAHD, PROCESSING_CAMPAIGN, ERROR_CAMPAIGN].map((campaign) => (
            <li key={campaign.id}>
              <CampaignTome
                campaign={campaign}
                onOpen={() => {}}
                onDelete={() => {}}
                deleting={false}
              />
            </li>
          ))}
        </ul>

        <SectionTitle>Setup — party roster</SectionTitle>
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {PARTY.map((character) => (
            <li key={character.id}>
              <CharacterCard
                character={character}
                onView={() => setViewingSheet(true)}
                onDelete={() => {}}
                deleting={false}
              />
            </li>
          ))}
        </ul>
        <p className="px-1 text-3xs text-amber-200/40">
          Click a ready adventurer to preview the party-ledger sheet modal.
        </p>
      </div>

      <div className="mx-auto max-w-6xl px-3 pb-8">
        <SectionTitle>Session — game screen</SectionTitle>
        <div className="mt-3 flex h-[860px] overflow-hidden rounded-2xl border border-white/10">
          <DndGameScreen campaign={STRAHD} party={PARTY_META} />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 pb-8">
        <SectionTitle>Players — session overview cards</SectionTitle>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PARTY.filter((ch) => ch.status === "ready" && ch.sheet).map((character) => (
            <li key={character.id} className="min-h-0">
              <PlayerCardLarge character={character} onView={() => setViewingSheet(true)} />
            </li>
          ))}
        </ul>

        <SectionTitle>Combat — action dashboard (PC turn)</SectionTitle>
        <div className="flex h-[440px] overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-3">
          <CombatPanel combat={COMBAT} party={PARTY} npcs={NPCS} turnResult={null} />
        </div>

        <SectionTitle>Combat — enemy turn + read-aloud narration</SectionTitle>
        <div className="flex h-[440px] overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-3">
          <CombatPanel
            combat={{ ...COMBAT, turnIndex: 2 }}
            party={PARTY}
            npcs={NPCS}
            turnResult={{
              narration:
                "Vex steps inside the wolf's lunge and her longsword flashes once — the blade opens its flank and the beast crashes into the mud, twitching to stillness. Its packmate circles wide, hackles up, suddenly alone.",
              alerts: [],
              applied: true,
              combat: COMBAT,
            }}
          />
        </div>

        <SectionTitle>Combat — referee alert (illegal turn)</SectionTitle>
        <div className="flex h-[440px] overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-3">
          <CombatPanel
            combat={COMBAT}
            party={PARTY}
            npcs={NPCS}
            turnResult={{
              narration: "",
              alerts: [
                "Vex has already attacked this turn — a second weapon attack needs Extra Attack plus an action she no longer has.",
                "The wolves are engaged with Vex, 20 ft from the cart — Whisper cannot reach them with a melee shortsword without moving first.",
              ],
              applied: false,
              combat: COMBAT,
            }}
          />
        </div>
      </div>

      {viewingSheet && (
        <CharacterSheetModal character={VEX} onClose={() => setViewingSheet(false)} />
      )}
    </div>
  );
}
