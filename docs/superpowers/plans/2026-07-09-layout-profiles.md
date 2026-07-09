# Multiple Saved Layout Profiles

**Goal:** Let an engineer keep **several named dashboard layouts** and switch
between them instantly — e.g. a "Tuning" layout with big parameter sliders, a
"Monitoring" layout dominated by charts, and a "Debug" layout with the log
viewer expanded — instead of the single throwaway layout they have today. Each
profile is saved locally and restored across reloads.

**Architecture:** Extend the existing layout persistence (Zustand `persist` +
`localStorage`, storage key `app-framework:shell-layout`, versioned) from a
single `ShellLayout` to a small collection of **named profiles** plus an
**active profile id**. The shell renders the active profile's layout; the
existing `setLayout` updater (which today backs drag-to-reorder, resize, and
AI-applied layouts) is repointed to write into the active profile, so all
current editing keeps working and auto-saving unchanged. A schema-version bump
migrates any existing single layout into a "Default" profile so no one loses
their current dashboard.

**Tech Stack:** TypeScript — React, existing Zustand store + `persist`
middleware, `localStorage`. No new dependency; no backend.

**Status:** Specification for review. Implementation follows once approved
(spec → PR → review → implement). Branch: `feat/layout-profiles`.

---

## 1. Problem Statement

### 1.1 What the engineer wants

Different tasks want different dashboards. While tuning, the engineer wants the
parameter controls front-and-centre; while watching a run, they want the charts
and status banner to dominate; while debugging, they want the log viewer large.
Today the shell persists **one** layout, so every switch means manually
rearranging widgets and undoing it afterwards. Engineers want to set each
arrangement up once, name it, and flip between them.

### 1.2 What exists today

- Layout is a JSON-serializable `ShellLayout`, persisted via a Zustand store
  with the `persist` middleware (`stores/shellStore.ts`), under the key
  `app-framework:shell-layout`, keyed by `SHELL_LAYOUT_STORAGE_VERSION`
  (currently 6) with a `migrate` that resets unknown versions.
- Manual **drag-to-reorder and resize** already work (resize via
  `react-resizable-panels`); the AI assistant can also apply a layout. All of
  these funnel through the store's `setLayout(updater)` and auto-persist.

The one thing missing is **more than one** saved layout. This spec adds that and
nothing else — drag/resize/AI editing are unchanged.

### 1.3 What this adds

- Save the current layout as a **named profile**.
- **Switch** the active profile (the shell instantly renders that layout).
- **Rename**, **delete**, and **reset** profiles.
- All profiles persist in `localStorage`, per application, across reloads.

### 1.4 Next steps after v1

- Import / export profiles as JSON files; share profiles between teammates;
  server-side storage. (All explicitly out of scope here, consistent with the
  original persistence spec.)

---

## 2. Scope

**In scope (v1):**

- A `LayoutProfile` data model and an extended store holding many profiles + an
  active id, persisted to `localStorage`.
- Store actions: save-as-new, switch, rename, delete, reset-active; and
  repointing `setLayout` to edit the active profile.
- A schema migration that folds the existing single layout into a "Default"
  profile.
- A `LayoutProfilesMenu` UI in the shell header to manage and switch profiles.
- Unit tests for the store logic and the menu.

**Out of scope (v1):** import/export to files, cross-user sharing, server sync,
cloud storage; any change to drag-to-reorder, resize, or the AI layout flow
(these already exist and are only repointed at the active profile, not
modified).

---

## 3. Data Model

```ts
/** One named, saved dashboard arrangement. */
interface LayoutProfile {
  id: string; // stable unique id (e.g. crypto.randomUUID())
  name: string; // user-facing label, e.g. "Monitoring"
  layout: ShellLayout; // the serializable arrangement
}

/** Persisted store shape (replaces the single `layout`). */
interface ShellLayoutStore {
  profiles: LayoutProfile[]; // always length >= 1
  activeProfileId: string; // id of the profile currently rendered
  // ...actions (see §4)
}
```

The shell renders **`profiles.find(p => p.id === activeProfileId).layout`**. A
selector (e.g. `useActiveLayout()`) exposes it so consumers that read `layout`
today change minimally.

**Invariants:** there is always at least one profile; `activeProfileId` always
points at an existing profile.

---

## 4. Store Design (`stores/shellStore.ts`)

The existing single-layout store is extended in place (one source of truth;
migration handles the upgrade). Backward-compatible surface:

- **`setLayout(updater)`** — unchanged signature, now applies the updater to the
  **active profile's** layout. Every current caller (drag/resize handlers, the
  AI apply path, region toggles) keeps working; edits auto-save into the active
  profile via `persist`.
- **`saveAsProfile(name)`** — snapshot the current active layout into a **new**
  profile with a fresh id, and make it active. (A "fork this arrangement" action.)
- **`switchProfile(id)`** — set `activeProfileId`; the shell re-renders that
  layout. No-op if `id` is unknown.
- **`renameProfile(id, name)`** — rename; blank names rejected.
- **`deleteProfile(id)`** — remove it; if it was active, switch to the first
  remaining profile. Deleting the **last** profile is disallowed (guarded).
- **`resetActiveProfile()`** — set the active profile's layout back to
  `createDefaultShellLayout()` (replaces today's `clearPersistedLayout` intent
  at profile granularity).

### 4.1 Migration

Bump `SHELL_LAYOUT_STORAGE_VERSION`. The `migrate(persistedState, version)`
function converts the previous shape `{ layout }` into
`{ profiles: [{ id, name: "Default", layout }], activeProfileId: <that id> }`.
Unknown/older versions fall back to a single fresh "Default" profile (existing
graceful-reset behaviour, now producing one profile). No user loses their
current dashboard on upgrade.

---

## 5. UI — `LayoutProfilesMenu`

A small control in the **shell header** (near the existing header items):

- Shows the **active profile's name** and opens a menu listing all profiles;
  selecting one calls `switchProfile`.
- Menu actions: **Save as new profile…** (prompts for a name → `saveAsProfile`),
  **Rename** (inline edit → `renameProfile`), **Delete** (→ `deleteProfile`,
  disabled when only one profile exists), **Reset to default** (→
  `resetActiveProfile`).
- Accessibility: a labelled `button`/`menu` (e.g.
  `getByRole("button", { name: /layout profile/i })`) with menu items as
  `menuitem`s — no `data-testid` needed.

The menu is a thin consumer of the store actions; it holds no layout state of
its own. It is registered/placed by `ApplicationShell` so every app gets it for
free.

---

## 6. Data Flow

1. Engineer arranges widgets (existing drag/resize/AI) → `setLayout` writes to
   the active profile → auto-persisted.
2. Engineer opens the profiles menu → **Save as new profile** "Monitoring" →
   `saveAsProfile("Monitoring")` clones the current layout into a new active
   profile.
3. They rearrange for a different task and **Save as new profile** "Tuning".
4. Flipping the menu between "Monitoring" and "Tuning" (`switchProfile`) swaps
   the rendered dashboard instantly; each profile keeps its own edits.
5. On reload, `persist` restores all profiles and the active id.

---

## 7. Testing Strategy

- **Store** (`shellStore.test.ts`): `saveAsProfile` adds a profile and makes it
  active; `switchProfile` changes the active layout; `setLayout` edits only the
  active profile; `deleteProfile` removes it and re-points active; deleting the
  last profile is refused; `renameProfile` rejects blank names;
  `resetActiveProfile` restores the default; **migration** folds a legacy
  `{ layout }` into a single "Default" profile.
- **UI** (Vitest browser): the menu lists profiles and switching re-renders the
  active layout; Save-as-new creates and activates a profile; rename/delete
  reflect in the list; Delete disabled with a single profile — all via
  accessible roles.
- **Quality gate:** `npm run typecheck` / `lint` / `test:ui` / `format:check`.

---

## 8. Implementation Checklist

```
- [ ] Task 1: LayoutProfile type + extended ShellLayoutStore shape (profiles +
      activeProfileId) in shellTypes.ts / shellStore.ts
- [ ] Task 2: store actions (setLayout→active, saveAsProfile, switchProfile,
      renameProfile, deleteProfile, resetActiveProfile) + invariants
- [ ] Task 3: bump SHELL_LAYOUT_STORAGE_VERSION + migrate legacy {layout} →
      Default profile
- [ ] Task 4: useActiveLayout selector; repoint ApplicationShell/consumers to it
- [ ] Task 5: LayoutProfilesMenu component + place it in the shell header
- [ ] Task 6: store tests (actions + migration) + menu tests
- [ ] Task 7: docs note (profiles are local/per-app) + full quality gate
```

---

## 9. Next Steps (after v1)

- Export / import profiles as JSON files.
- Share / sync profiles (server-side storage, per-user or per-team).
- Per-profile metadata (icons, last-used ordering, a default-on-first-load
  choice).
