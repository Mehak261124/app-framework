import { useState } from "react";
import type React from "react";

import { useShellLayoutStore } from "../stores/shellStore";
import { Button } from "./ui/button";
import "./LayoutProfilesMenu.css";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Which inline text-entry form (if any) the menu is currently showing. */
type Draft =
  | { mode: "idle" }
  | { mode: "saving"; name: string }
  | { mode: "renaming"; name: string };

// ─── LayoutProfilesMenu ─────────────────────────────────────────────────────────

/**
 * Header control for managing and switching between saved layout profiles.
 *
 * Shows the active profile's name as a menu trigger. Opening it lists every
 * profile (selecting one calls `switchProfile`) plus actions to **Save as new
 * profile** (inline name entry → `saveAsProfile`), **Rename** the active
 * profile (inline edit → `renameProfile`), **Delete** it (disabled when only
 * one profile exists → `deleteProfile`), and **Reset to default** (→
 * `resetActiveProfile`).
 *
 * The component is a thin consumer of the shell layout store and holds no
 * layout state of its own — {@link useShellLayoutStore} is the single source of
 * truth. It is placed in the shell header by `ApplicationShell`, so every app
 * gets it for free.
 *
 * Profiles are stored **locally per application** (browser `localStorage`, one
 * bucket per app). They are not synced across devices, browsers, or users;
 * import/export and server-side sharing are out of scope for v1.
 *
 * @returns The profiles menu element.
 * @example
 * ```tsx
 * // Rendered inside the shell header:
 * <LayoutProfilesMenu />
 * ```
 */
export function LayoutProfilesMenu(): React.ReactElement {
  const profiles = useShellLayoutStore((s) => s.profiles);
  const activeProfileId = useShellLayoutStore((s) => s.activeProfileId);
  const saveAsProfile = useShellLayoutStore((s) => s.saveAsProfile);
  const switchProfile = useShellLayoutStore((s) => s.switchProfile);
  const renameProfile = useShellLayoutStore((s) => s.renameProfile);
  const deleteProfile = useShellLayoutStore((s) => s.deleteProfile);
  const resetActiveProfile = useShellLayoutStore((s) => s.resetActiveProfile);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ mode: "idle" });

  const active = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const onlyOneProfile = profiles.length <= 1;

  function close(): void {
    setOpen(false);
    setDraft({ mode: "idle" });
  }

  function handleSelect(id: string): void {
    switchProfile(id);
    close();
  }

  function submitDraft(): void {
    if (draft.mode === "saving") {
      saveAsProfile(draft.name);
    } else if (draft.mode === "renaming") {
      renameProfile(active.id, draft.name);
    }
    close();
  }

  return (
    <div className="sct-LayoutProfilesMenu">
      <button
        type="button"
        className="sct-LayoutProfilesMenu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Layout profile: ${active.name}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="sct-LayoutProfilesMenu-triggerLabel">{active.name}</span>
        <span aria-hidden className="sct-LayoutProfilesMenu-caret">
          ▾
        </span>
      </button>

      {open && (
        <div
          className="sct-LayoutProfilesMenu-popover"
          role="menu"
          aria-label="Layout profiles"
        >
          {draft.mode === "idle" ? (
            <>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={p.id === activeProfileId}
                  className="sct-LayoutProfilesMenu-item"
                  onClick={() => handleSelect(p.id)}
                >
                  {p.name}
                </button>
              ))}

              <div className="sct-LayoutProfilesMenu-divider" role="separator" />

              <button
                type="button"
                role="menuitem"
                className="sct-LayoutProfilesMenu-item"
                onClick={() => setDraft({ mode: "saving", name: "" })}
              >
                Save as new profile…
              </button>
              <button
                type="button"
                role="menuitem"
                className="sct-LayoutProfilesMenu-item"
                onClick={() => setDraft({ mode: "renaming", name: active.name })}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="sct-LayoutProfilesMenu-item"
                disabled={onlyOneProfile}
                onClick={() => {
                  deleteProfile(active.id);
                  close();
                }}
              >
                Delete
              </button>
              <button
                type="button"
                role="menuitem"
                className="sct-LayoutProfilesMenu-item"
                onClick={() => {
                  resetActiveProfile();
                  close();
                }}
              >
                Reset to default
              </button>
            </>
          ) : (
            <div className="sct-LayoutProfilesMenu-form">
              <span className="sct-LayoutProfilesMenu-formLabel">
                {draft.mode === "saving" ? "New profile name" : "Rename profile"}
              </span>
              <input
                className="sct-LayoutProfilesMenu-input"
                aria-label="Profile name"
                placeholder={draft.mode === "saving" ? "e.g. Monitoring" : undefined}
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitDraft();
                  } else if (e.key === "Escape") {
                    setDraft({ mode: "idle" });
                  }
                }}
              />
              <div className="sct-LayoutProfilesMenu-formActions">
                <Button size="sm" onClick={submitDraft}>
                  {draft.mode === "saving" ? "Create profile" : "Save name"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft({ mode: "idle" })}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
