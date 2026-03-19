import type { CardType } from "@boardgames/core/games/exploding-kittens/types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CardSkin {
  file: string;
  label: string;
}

export interface CardArtEntry {
  type: string;
  implemented: boolean;
  skins: CardSkin[];
}

// ── Full Card Art Registry ──────────────────────────────────────────────────
// All 181 card images mapped to their card type and skin variant.
// Images are served from /cards/<file>.jpg (360x504, uniform size).
//
// Card types marked `implemented: true` are wired into the current game.
// Card types marked `implemented: false` are from expansion packs / editions
// not yet supported in the engine.

export const CARD_ART_REGISTRY: CardArtEntry[] = [
  // ── Implemented Card Types ──────────────────────────────────────────────

  {
    type: "exploding-kitten",
    implemented: true,
    skins: [
      { file: "exploding-kitten-c4", label: "C4" },
      { file: "exploding-kitten-alien", label: "Alien" },
      { file: "exploding-kitten-car-off-cliff", label: "Car Off Cliff" },
      { file: "exploding-kitten-house-grenade", label: "House Grenade" },
      { file: "exploding-kitten-nuclear-bombs", label: "Nuclear Bombs" },
      { file: "exploding-kitten-playground", label: "Playground" },
      { file: "exploding-kitten-science", label: "Science" },
      { file: "exploding-kitten-tnt-ship", label: "TNT Ship" },
      { file: "exploding-kitten-warp-core", label: "Warp Core" },
      { file: "exploing-kitten-balloon-bomb", label: "Balloon Bomb" },
      { file: "exploing-kitten-divide-by-zero", label: "Divide By Zero" },
      { file: "exploing-kitten-holy-water-balloons", label: "Holy Water Balloons" },
      { file: "exploing-kitten-pepper", label: "Pepper" },
    ],
  },
  {
    type: "defuse",
    implemented: true,
    skins: [
      { file: "defuse-via-laser-pointer", label: "Laser Pointer" },
      { file: "defuse-via-3am-flatulence", label: "3AM Flatulence" },
      { file: "defuse-via-belly-rubs", label: "Belly Rubs" },
      { file: "defuse-via-catnip-sandwiches", label: "Catnip Sandwiches" },
      { file: "defuse-via-catnip-sweater", label: "Catnip Sweater" },
      { file: "defuse-via-crate", label: "Crate" },
      { file: "defuse-via-excessive-ball-cleaning", label: "Excessive Ball Cleaning" },
      { file: "defuse-via-flattering-larp", label: "Flattering LARP" },
      { file: "defuse-via-kitten-therapy", label: "Kitten Therapy" },
      { file: "defuse-via-laser-tag", label: "Laser Tag" },
      { file: "defuse-via-mauling-a-baby", label: "Mauling a Baby" },
      { file: "defuse-via-nature-documentaries", label: "Nature Documentaries" },
      { file: "defuse-via-participation-in-kitten-yoga", label: "Kitten Yoga" },
      { file: "defuse-via-porkback-riding-into-the-sunset-together", label: "Porkback Riding" },
      { file: "defuse-via-scratching", label: "Scratching" },
      { file: "defuse-via-spay-neuter", label: "Spay & Neuter" },
      { file: "defuse-via-tummy-rubs", label: "Tummy Rubs" },
      { file: "defuse-via-turning-into-tuna", label: "Turning Into Tuna" },
    ],
  },
  {
    type: "attack",
    implemented: true,
    skins: [
      { file: "attack-bear-o-dactyl", label: "Bear-o-Dactyl" },
      { file: "attack-catterwocky", label: "Catterwocky" },
      { file: "attack-crab-a-pult", label: "Crab-a-Pult" },
      {
        file: "attack-grow-a-magnifient-squid-arm-and-start-slapping-fat-babies",
        label: "Squid Arm",
      },
      { file: "attack-penguin-diarrhea", label: "Penguin Diarrhea" },
      { file: "attack-rubber-duck-collection", label: "Rubber Duck Collection" },
      { file: "attack-thousand-year-back-hair", label: "Thousand Year Back Hair" },
      { file: "attack-torture-bunnies", label: "Torture Bunnies" },
    ],
  },
  {
    type: "skip",
    implemented: true,
    skins: [
      { file: "skip-commandeer-a-bunnyraptor", label: "Bunnyraptor" },
      { file: "skip-crab-walk-with-some-crabs", label: "Crab Walk" },
      { file: "skip-don-a-portable-cheetah-butt", label: "Cheetah Butt" },
      { file: "skip-engage-the-hypergoat", label: "Hypergoat" },
      { file: "skip-evade-dirty-sasquatch-underpants", label: "Sasquatch Underpants" },
      { file: "skip-go-base-jumping-using-a-pair-of-old-lady-boobs", label: "Base Jumping" },
      { file: "skip-play-a-game-of-whale-boner-tetherball", label: "Tetherball" },
      { file: "skip-sail-away-on-your-penis-balloon", label: "Sail Away" },
    ],
  },
  {
    type: "favor",
    implemented: true,
    skins: [
      { file: "favor-fall-so-deeply-in-love", label: "Fall in Love" },
      { file: "favor-get-enslaved-by-party-squirrels", label: "Party Squirrels" },
      { file: "favor-rub-peanut-butter-on-your-belly-button", label: "Peanut Butter" },
      { file: "favor-take-your-friends-beard-sailing", label: "Beard Sailing" },
      { file: "favor-teach-someone-a-new-palindrome", label: "New Palindrome" },
      { file: "favour-give-a-horsey-ride-to-a-horse", label: "Horsey Ride (UK)" },
    ],
  },
  {
    type: "shuffle",
    implemented: true,
    skins: [
      { file: "shuffle-abracrab-lincoln", label: "Abracrab Lincoln" },
      { file: "shuffle-a-kraken-emerges-and-hes-super-upset", label: "Kraken" },
      { file: "shuffle-an-asparagus-bun-dragon-appears", label: "Asparagus Bun Dragon" },
      { file: "shuffle-an-electromagnetic-pomeranian-storm", label: "Pomeranian Storm" },
      { file: "shuffle-a-plague-of-bat-farts", label: "Bat Farts" },
      { file: "shuffle-a-transdimensional-litter-box-materializes", label: "Litter Box" },
      { file: "shuffle-discover-you-have-a-toilet-werewolf", label: "Toilet Werewolf" },
      { file: "shuffle-smoke-some-crack-with-a-baby-owl", label: "Baby Owl" },
    ],
  },
  {
    type: "see-the-future",
    implemented: true,
    skins: [
      { file: "see-the-future-ask-the-all-seeing-goat-wizard", label: "Goat Wizard" },
      { file: "see-the-future-attach-a-butterfly-to-your-genitals", label: "Butterfly" },
      { file: "see-the-future-crawl-inside-a-goat-butt", label: "Goat Butt" },
      { file: "see-the-future-deploy-the-special-ops-bunnies", label: "Special Ops Bunnies" },
      { file: "see-the-future-discover-a-boob-wizard", label: "Boob Wizard" },
      { file: "see-the-future-drink-an-entire-bottle-of-bald-eagle-tears", label: "Eagle Tears" },
      { file: "see-the-future-fear-upon-a-unicorn-enchilada", label: "Unicorn Enchilada" },
      { file: "see-the-future-rub-the-belly-of-a-pig-a-corn", label: "Pig-a-Corn" },
      { file: "see-the-future-summon-the-mantis-shrimp", label: "Mantis Shrimp" },
      { file: "see-the-future-weave-an-infinity-boner", label: "Infinity" },
    ],
  },
  {
    type: "see-the-future-5x",
    implemented: false,
    skins: [{ file: "see-the-future-behold-the-angler-pig", label: "Angler Pig" }],
  },
  {
    type: "nope",
    implemented: true,
    skins: [
      { file: "nope-a-nope-ninja", label: "Nope Ninja" },
      { file: "nope-a-jackanope-bounds-into-the-room", label: "Jackanope" },
      { file: "nope-awaken-the-narnope", label: "Narnope" },
      { file: "nope-deliver-some-nope-on-your-jump-rope", label: "Jump Rope" },
      { file: "nope-feed-your-apponent-some-cantanope", label: "Cantanope" },
      { file: "nope-feed-your-opponent-a-nope-sandwich", label: "Nope Sandwich" },
      { file: "nope-nopestradamus-speaks-the-truth", label: "Nopestradamus" },
      { file: "nope-put-on-your-necktie-of-nope", label: "Necktie of Nope" },
      { file: "nope-the-pope-of-nope-has-spoken", label: "Pope of Nope" },
      { file: "nope-win-the-nopebell-peace-prize", label: "Nopebell Prize" },
    ],
  },
  // ── Cat Cards (no special ability — used for pair/triple combos) ─────────
  // All 23 cat breeds are functionally identical: they have no effect when
  // played solo and are only useful as pairs (steal random card), triples
  // (name a card to steal), or five-different combos. The 5 base-game breeds
  // are implemented in the engine; the remaining 18 are expansion breeds.

  {
    type: "tacocat",
    implemented: true,
    skins: [{ file: "tacocat", label: "Tacocat" }],
  },
  {
    type: "cattermelon",
    implemented: true,
    skins: [{ file: "cattermelon", label: "Cattermelon" }],
  },
  {
    type: "potato-cat",
    implemented: true,
    skins: [{ file: "hairy-potato-cat", label: "Hairy Potato Cat" }],
  },
  {
    type: "beard-cat",
    implemented: true,
    skins: [{ file: "beard-cat", label: "Beard Cat" }],
  },
  {
    type: "rainbow-ralphing-cat",
    implemented: true,
    skins: [{ file: "rainbow-ralphing-cat", label: "Rainbow Ralphing Cat" }],
  },
  {
    type: "bikini-cat",
    implemented: false,
    skins: [{ file: "bikini-cat", label: "Bikini Cat" }],
  },
  {
    type: "cat-henge",
    implemented: false,
    skins: [{ file: "cat-henge", label: "Cat Henge" }],
  },
  {
    type: "cat-o-lantern",
    implemented: false,
    skins: [{ file: "cat-o-lantern", label: "Cat-O-Lantern" }],
  },
  {
    type: "cats-schrodinger",
    implemented: false,
    skins: [{ file: "cats-schrodinger", label: "Schrödinger's Cat" }],
  },
  {
    type: "de-cat-ipated",
    implemented: false,
    skins: [{ file: "de-cat-ipated", label: "De-Cat-Ipated" }],
  },
  {
    type: "electrocat",
    implemented: false,
    skins: [{ file: "electrocat", label: "Electrocat" }],
  },
  {
    type: "feral-cat",
    implemented: false,
    skins: [{ file: "feral-cat", label: "Feral Cat" }],
  },
  {
    type: "football-cat",
    implemented: false,
    skins: [{ file: "football-cat", label: "Football Cat" }],
  },
  {
    type: "horse-cat",
    implemented: false,
    skins: [{ file: "horse-cat", label: "Horse Cat" }],
  },
  {
    type: "kit-tea-cat",
    implemented: false,
    skins: [{ file: "kit-tea-cat", label: "Kit-Tea Cat" }],
  },
  {
    type: "knight-cat",
    implemented: false,
    skins: [{ file: "knight-cat", label: "Knight Cat" }],
  },
  {
    type: "loch-ness-kitty",
    implemented: false,
    skins: [{ file: "loch-ness-kitty", label: "Loch Ness Kitty" }],
  },
  {
    type: "mercat",
    implemented: false,
    skins: [{ file: "mercat", label: "Mercat" }],
  },
  {
    type: "momma-cat",
    implemented: false,
    skins: [{ file: "momma-cat", label: "Momma Cat" }],
  },
  {
    type: "shy-bladder-cat",
    implemented: false,
    skins: [{ file: "shy-bladder-cat", label: "Shy Bladder Cat" }],
  },
  {
    type: "telephone-boxcat",
    implemented: false,
    skins: [{ file: "telephone-boxcat", label: "Telephone Boxcat" }],
  },
  {
    type: "troll-cat",
    implemented: false,
    skins: [{ file: "troll-cat", label: "Troll Cat" }],
  },
  {
    type: "vampire-cat",
    implemented: false,
    skins: [{ file: "vampire-cat", label: "Vampire Cat" }],
  },
  {
    type: "zombie-cat",
    implemented: false,
    skins: [{ file: "zombie-cat", label: "Zombie Cat" }],
  },

  // ── Not-Yet-Implemented Card Types ────────────────────────────────────────
  // These are from expansion packs and alternate editions. Images are
  // processed and available but not wired into the game engine yet.

  {
    type: "alter-the-future",
    implemented: false,
    skins: [
      { file: "alter-the-future-cat-wizard", label: "Cat Wizard" },
      { file: "alter-the-future-furmaid", label: "Furmaid" },
      { file: "alter-the-future-golden-haired-manatee", label: "Golden Manatee" },
      { file: "alter-the-future-time-traveling-crab", label: "Time Traveling Crab" },
    ],
  },
  {
    type: "alter-the-future-now",
    implemented: false,
    skins: [{ file: "alter-the-future-get-that-perm-youve-always-wanted", label: "Perm" }],
  },
  {
    type: "alter-the-future-5x",
    implemented: false,
    skins: [{ file: "alter-the-future-nikola-telsa", label: "Nikola Tesla" }],
  },
  {
    type: "armageddon",
    implemented: false,
    skins: [
      { file: "armageddon-anything-can-become-armor", label: "Anything Armor" },
      { file: "armageddon-fight-outside", label: "Fight Outside" },
      { file: "armageddon-showdown", label: "Showdown" },
    ],
  },
  {
    type: "attack-of-the-dead",
    implemented: false,
    skins: [
      { file: "attack-of-the-dead-burn-some-bread-to-summon-a-toast-ghost", label: "Toast Ghost" },
      {
        file: "attack-of-the-dead-gift-tickets-to-some-terrible-zombie-stand-up",
        label: "Zombie Stand-Up",
      },
      { file: "attack-of-the-dead-release-a-swam-of-zom-bees", label: "Zom-Bees" },
    ],
  },
  {
    type: "barking-kitten",
    implemented: false,
    skins: [
      { file: "barking-kitten-dog-house", label: "Dog House" },
      { file: "barking-kitten-fence", label: "Fence" },
      { file: "1-barking-kitten-dog-house-new", label: "Dog House (New)" },
      { file: "2-barking-kitten-fence-new", label: "Fence (New)" },
    ],
  },
  {
    type: "bury",
    implemented: false,
    skins: [
      {
        file: "bury-bury-something-that-probably-shouldnt-be-buried",
        label: "Shouldn't Be Buried",
      },
      { file: "bury-clean-up-while-your-cat-watches", label: "Cat Watches" },
    ],
  },
  {
    type: "catomic-bomb",
    implemented: false,
    skins: [{ file: "catomic-bomb", label: "Catomic Bomb" }],
  },
  {
    type: "clairvoyance",
    implemented: false,
    skins: [
      { file: "clairvoyance-now-get-stronger-wifi-for-your-cauldron", label: "Cauldron Wifi" },
      { file: "clairvoyance-now-see-right-through-your-friends", label: "See Through Friends" },
    ],
  },
  {
    type: "clone",
    implemented: false,
    skins: [
      { file: "clone-find-a-pair-of-nosfera-twos", label: "Nosfera-Twos" },
      { file: "clone-make-your-voodoo-dolls-do-all-the-dirty-work", label: "Voodoo Dolls" },
      { file: "clone-work-out-the-kinks-later", label: "Work Out The Kinks" },
    ],
  },
  {
    type: "curse-of-the-cat-butt",
    implemented: false,
    skins: [
      { file: "1-curse-of-the-cat-butt", label: "Cat Butt" },
      { file: "2-blind-as-a-bat", label: "Blind As A Bat" },
    ],
  },
  {
    type: "devilcat",
    implemented: false,
    skins: [{ file: "devilcat-the-worst-of-the-cursed", label: "Worst Of The Cursed" }],
  },
  {
    type: "dig-deeper",
    implemented: false,
    skins: [
      { file: "dig-deeper-get-more-than-you-bargained-for", label: "More Than Bargained" },
      { file: "dig-deeper-make-a-deal-with-a-devil-in-a-bad-disguise", label: "Devil Deal" },
      { file: "dig-deeper-pity-the-zombie-with-zero-upper-body-strength", label: "Weak Zombie" },
      { file: "dig-deeper-tend-to-your-dying-garden", label: "Dying Garden" },
    ],
  },
  {
    type: "draw-from-the-bottom",
    implemented: false,
    skins: [
      {
        file: "draw-from-the-bottom-take-a-big-bite-of-your-coward-sandwich",
        label: "Coward Sandwich",
      },
    ],
  },
  {
    type: "feed-the-dead",
    implemented: false,
    skins: [
      { file: "feed-the-dead-give-your-friend-a-hand", label: "Give A Hand" },
      { file: "feed-the-dead-take-special-care-of-a-picky-zombie", label: "Picky Zombie" },
    ],
  },
  {
    type: "garbage-collection",
    implemented: false,
    skins: [{ file: "garbage-collection", label: "Garbage Collection" }],
  },
  {
    type: "godcat",
    implemented: false,
    skins: [{ file: "godcat-the-best-of-the-blessed", label: "Best Of The Blessed" }],
  },
  {
    type: "grave-robber",
    implemented: false,
    skins: [
      { file: "grave-robber-return-the-terrible-tie-you-were-buried-with", label: "Terrible Tie" },
    ],
  },
  {
    type: "ill-take-that",
    implemented: false,
    skins: [
      { file: "ill-take-that-a-hedgehog-hogs-the-blankets", label: "Hedgehog" },
      { file: "ill-take-that-send-in-a-seagull-who-steals-things", label: "Seagull" },
      { file: "ill-take-that-send-in-a-vampug", label: "Vampug" },
      { file: "ill-take-that-send-the-klepto-cat", label: "Klepto Cat" },
    ],
  },
  {
    type: "imploding-kitten",
    implemented: false,
    skins: [{ file: "imploding-kitten", label: "Imploding Kitten" }],
  },
  {
    type: "mark",
    implemented: false,
    skins: [{ file: "mark", label: "Mark" }],
  },
  {
    type: "personal-attack",
    implemented: false,
    skins: [
      {
        file: "personal-attack-finally-throw-up-all-the-crayons-you-ate-when-you-were-a-kid",
        label: "Crayons",
      },
      { file: "personal-attack-get-cursed-at-by-a-heck-beaver", label: "Heck Beaver" },
      { file: "personal-attack-give-yourself-a-fierce-spankin", label: "Fierce Spankin" },
      {
        file: "personal-attack-listen-to-the-boastings-of-some-very-accomplished-trout",
        label: "Accomplished Trout",
      },
    ],
  },
  {
    type: "potluck",
    implemented: false,
    skins: [
      { file: "pot-luck-dog-pile-until-it-reaches-the-stars", label: "Dog Pile" },
      { file: "potluck-share-with-the-group-at-catnip-anonymous", label: "Catnip Anonymous" },
    ],
  },
  {
    type: "raising-heck",
    implemented: false,
    skins: [
      { file: "raising-heck-demon", label: "Demon" },
      { file: "raising-heck-flushed-goldfish", label: "Flushed Goldfish" },
    ],
  },
  {
    type: "reveal-the-future",
    implemented: false,
    skins: [
      { file: "reveal-the-future-extra-pair-of-eyes", label: "Extra Eyes" },
      { file: "reveal-the-future-go-back-in-time", label: "Go Back In Time" },
      { file: "reveal-the-future-particle-accelerator", label: "Particle Accelerator" },
    ],
  },
  {
    type: "reverse",
    implemented: false,
    skins: [
      { file: "reverse-go-back-in-time-and-steal-a-pregnant-dinosaur", label: "Pregnant Dinosaur" },
      { file: "reverse-receive-a-hairy-tummy-massage", label: "Tummy Massage" },
      { file: "reverse-return-from-an-unpleasant-doctor-s-visit", label: "Doctor's Visit" },
      { file: "reverse-try-something-new-today", label: "Try Something New" },
    ],
  },
  {
    type: "share-the-future",
    implemented: false,
    skins: [
      { file: "share-the-future-listen-to-the-words-of-an-emo-emu", label: "Emo Emu" },
      { file: "share-the-future-send-in-the-recon-sloth", label: "Recon Sloth" },
    ],
  },
  {
    type: "shuffle-now",
    implemented: false,
    skins: [
      { file: "shuffle-now-don-t-completely-unravel", label: "Don't Unravel" },
      { file: "shuffle-now-watch-an-unimpressive-magic-show", label: "Magic Show" },
    ],
  },
  {
    type: "streaking-kitten",
    implemented: false,
    skins: [{ file: "streaking-kitten", label: "Streaking Kitten" }],
  },
  {
    type: "super-skip",
    implemented: false,
    skins: [
      { file: "super-skip", label: "Super Skip" },
      { file: "super-skip-hitch-a-ride-on-a-corgihorse", label: "Corgihorse" },
    ],
  },
  {
    type: "swap-top-and-bottom",
    implemented: false,
    skins: [{ file: "swap-top-and-bottom", label: "Swap Top and Bottom" }],
  },
  {
    type: "targeted-attack",
    implemented: false,
    skins: [
      { file: "targeted-attack-2x-deploy-the-groin-kicking-panda-bear", label: "Panda Bear" },
      { file: "targeted-attack-2x-fire-the-fat-hamster-crossbow", label: "Hamster Crossbow" },
      {
        file: "targeted-attack-unleash-a-shark-who-hurts-with-words-instead-of-teeth",
        label: "Hurtful Shark",
      },
    ],
  },
  {
    type: "tower-of-power",
    implemented: false,
    skins: [{ file: "tower-of-power", label: "Tower of Power" }],
  },
  {
    type: "zombie-kitten",
    implemented: false,
    skins: [
      { file: "zombie-kitten-always-land-on-your-feet", label: "Land On Your Feet" },
      { file: "zombie-kitten-become-an-alien-incubator", label: "Alien Incubator" },
      { file: "zombie-kitten-cough-up-a-hairball-with-a-hairdo", label: "Hairball Hairdo" },
      { file: "zombie-kitten-friendship-lasts-all-weekend", label: "Weekend Friendship" },
      { file: "zombie-kitten-learn-to-entertain-yourself", label: "Entertain Yourself" },
    ],
  },
];

// ── Lookup Helpers ──────────────────────────────────────────────────────────

const skinsByType = new Map<string, CardSkin[]>();
for (const entry of CARD_ART_REGISTRY) {
  skinsByType.set(entry.type, entry.skins);
}

export function getCardImageUrl(file: string): string {
  return `/cards/${file}.jpg`;
}

/**
 * Get a deterministic skin for a card based on its unique id.
 * Uses modulo to cycle through available skins, so different card
 * instances of the same type show different art.
 */
export function getCardSkin(cardType: CardType, cardId: number): CardSkin | null {
  const skins = skinsByType.get(cardType);
  if (!skins || skins.length === 0) return null;
  return skins[Math.abs(cardId) % skins.length];
}

/**
 * Get all available skins for a card type.
 */
export function getSkinsForType(cardType: string): CardSkin[] {
  return skinsByType.get(cardType) ?? [];
}
