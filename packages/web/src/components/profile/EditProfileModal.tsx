import {
  PROFILE_BIO_MAX,
  PROFILE_FAVORITES_MAX,
  PROFILE_LINKS_MAX,
  PROFILE_TAGLINE_MAX,
  PROFILE_WISHLIST_MAX,
  type ProfileEditable,
  type ProfileLink,
  type ProfileUpdateInput,
} from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useId, useState } from "react";
import { ApiError, SchemaError } from "../../lib/api-fetch.ts";
import { updateMyProfile } from "../../lib/profile.ts";
import { qk } from "../../lib/query-keys.ts";
import InventoryGrid from "../InventoryGrid.tsx";
import { PlusIcon, TrashIcon } from "../icons";
import { Button } from "../ui/Button.tsx";
import { Chip } from "../ui/Chip.tsx";
import { Field } from "../ui/Field.tsx";
import { Input } from "../ui/Input.tsx";
import { Modal } from "../ui/Modal.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Textarea } from "../ui/Textarea.tsx";

// Owner-only profile editor. Seeds from the loaded `ProfileEditable`, edits in
// local state, and PUTs the full replacement. Favorites/wishlist reuse the
// existing `InventoryGrid` toggle grid (catalog-wide, family-grouped). Skill
// data is never editable here — it's generated elsewhere.

const PRESET_ACCENTS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#14b8a6",
  "#3b82f6",
  "#a855f7",
] as const;

type Tab = "about" | "favorites" | "wishlist";

const TABS = [
  { value: "about" as const, label: "About" },
  { value: "favorites" as const, label: "Favorites" },
  { value: "wishlist" as const, label: "Wishlist" },
];

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function normalizeUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

type EditProfileModalProps = {
  userId: string;
  initial: ProfileEditable;
  onClose: () => void;
};

export function EditProfileModal({ userId, initial, onClose }: EditProfileModalProps) {
  const queryClient = useQueryClient();
  const fieldId = useId();
  const [tab, setTab] = useState<Tab>("about");

  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [pronouns, setPronouns] = useState(initial.pronouns ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [accentHex, setAccentHex] = useState<string | null>(initial.accentHex);
  const [favorites, setFavorites] = useState<string[]>(initial.favorites);
  const [wishlist, setWishlist] = useState<string[]>(initial.wishlist);
  const [links, setLinks] = useState<ProfileLink[]>(initial.links);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: ProfileUpdateInput) => updateMyProfile(userId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
      queryClient.invalidateQueries({ queryKey: qk.players() });
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError || err instanceof SchemaError) setError(err.message);
      else setError("Could not save your profile. Please try again.");
    },
  });

  function toggleSlug(
    list: string[],
    setList: (next: string[]) => void,
    cap: number,
    slug: string,
  ) {
    if (list.includes(slug)) {
      setList(list.filter((s) => s !== slug));
    } else if (list.length < cap) {
      setList([...list, slug]);
    }
  }

  function handleSave() {
    setError(null);
    const cleanedLinks = links
      .map((l) => ({ label: l.label.trim(), url: normalizeUrl(l.url) }))
      .filter((l) => l.label && l.url)
      .slice(0, PROFILE_LINKS_MAX);
    mutation.mutate({
      tagline: emptyToNull(tagline),
      bio: emptyToNull(bio),
      pronouns: emptyToNull(pronouns),
      location: emptyToNull(location),
      accentHex,
      favorites,
      wishlist,
      links: cleanedLinks,
    });
  }

  return (
    <Modal
      onClose={onClose}
      eyebrow="Your profile"
      title="Edit profile"
      panelClassName="max-w-2xl max-h-[90vh]"
    >
      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={setTab}
        shape="rect"
        size="sm"
        aria-label="Profile editor sections"
      />

      <div className="-mr-1 max-h-[60vh] overflow-y-auto pr-1">
        {tab === "about" && (
          <div className="flex flex-col gap-4">
            <Field
              label="Tagline"
              htmlFor={`${fieldId}-tagline`}
              hint={`${tagline.length}/${PROFILE_TAGLINE_MAX}`}
            >
              <Input
                id={`${fieldId}-tagline`}
                value={tagline}
                maxLength={PROFILE_TAGLINE_MAX}
                placeholder="Euro gamer · always down for a teach"
                onChange={(e) => setTagline(e.target.value)}
              />
            </Field>
            <Field label="Bio" htmlFor={`${fieldId}-bio`} hint={`${bio.length}/${PROFILE_BIO_MAX}`}>
              <Textarea
                id={`${fieldId}-bio`}
                value={bio}
                rows={4}
                maxLength={PROFILE_BIO_MAX}
                placeholder="A few words about your tastes, favorite mechanics, hot takes…"
                onChange={(e) => setBio(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Pronouns" htmlFor={`${fieldId}-pronouns`}>
                <Input
                  id={`${fieldId}-pronouns`}
                  value={pronouns}
                  maxLength={40}
                  placeholder="she/her"
                  onChange={(e) => setPronouns(e.target.value)}
                />
              </Field>
              <Field label="Location" htmlFor={`${fieldId}-location`}>
                <Input
                  id={`${fieldId}-location`}
                  value={location}
                  maxLength={80}
                  placeholder="Vilnius"
                  onChange={(e) => setLocation(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
                Accent color
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_ACCENTS.map((hex) => (
                  // biome-ignore lint/correctness/noRestrictedElements: bespoke color swatch disc, no Button/Chip variant fits
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Accent ${hex}`}
                    aria-pressed={accentHex === hex}
                    onClick={() => setAccentHex(hex)}
                    style={{ "--swatch": hex } as CSSProperties}
                    className={`h-7 w-7 rounded-full bg-[var(--swatch)] transition ${
                      accentHex === hex
                        ? "ring-2 ring-white ring-offset-2 ring-offset-surface-900"
                        : "ring-1 ring-white/10 hover:ring-white/40"
                    }`}
                  />
                ))}
                <Chip
                  pressed={accentHex === null}
                  size="xs"
                  shape="pill"
                  onClick={() => setAccentHex(null)}
                >
                  Default
                </Chip>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
                  Links
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setLinks([...links, { label: "", url: "" }])}
                  disabled={links.length >= PROFILE_LINKS_MAX}
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {links.map((link, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: editable link rows have no stable id
                <div key={`link-row-${i}`} className="flex items-center gap-2">
                  <Input
                    aria-label="Link label"
                    value={link.label}
                    placeholder="BGG"
                    className="max-w-[8rem]"
                    onChange={(e) =>
                      setLinks(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))
                    }
                  />
                  <Input
                    aria-label="Link URL"
                    value={link.url}
                    placeholder="boardgamegeek.com/user/…"
                    onChange={(e) =>
                      setLinks(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Remove link"
                    onClick={() => setLinks(links.filter((_, j) => j !== i))}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "favorites" && (
          <div className="flex flex-col gap-3">
            <p
              className={`text-xs ${favorites.length >= PROFILE_FAVORITES_MAX ? "text-amber-300" : "text-fg-muted"}`}
            >
              {favorites.length} / {PROFILE_FAVORITES_MAX} favorites selected
            </p>
            <InventoryGrid
              selected={favorites}
              onToggle={(slug) => toggleSlug(favorites, setFavorites, PROFILE_FAVORITES_MAX, slug)}
            />
          </div>
        )}

        {tab === "wishlist" && (
          <div className="flex flex-col gap-3">
            <p
              className={`text-xs ${wishlist.length >= PROFILE_WISHLIST_MAX ? "text-amber-300" : "text-fg-muted"}`}
            >
              {wishlist.length} / {PROFILE_WISHLIST_MAX} on wishlist
            </p>
            <InventoryGrid
              selected={wishlist}
              onToggle={(slug) => toggleSlug(wishlist, setWishlist, PROFILE_WISHLIST_MAX, slug)}
            />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={mutation.isPending}>
          Save profile
        </Button>
      </div>
    </Modal>
  );
}
