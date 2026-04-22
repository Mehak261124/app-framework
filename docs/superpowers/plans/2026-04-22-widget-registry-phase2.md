# Widget Registry — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Widget Registry from a manual, imperative catalog into a richer, AI-queryable capability registry backed by a declarative manifest system. Phase 2 delivers in two PRs: PR A adds structured capability attributes and a real LogViewer component; PR B adds a manifest-based plugin loading system with lazy component resolution.

**Architecture:** Phase 2 is purely additive. `WidgetDefinition` gains optional capability fields that do not break any existing registration call. `defaultWidgets.ts` ships a real LogViewer backed by framework event bus primitives instead of a null placeholder. The manifest system introduces a `WidgetLoader` that reads a `widgets.json` sidecar file and registers widgets into an existing `WidgetRegistry` — it does not replace the registry or the `register()` API. The registry and loader are loosely coupled: the registry is unaware of manifests; the loader is unaware of how the registry stores or resolves widgets.

**Tech Stack:** TypeScript — React, Vitest, react-test-renderer.

---

## 1. Problem Statement

Phase 1 `WidgetDefinition` has three gaps that block the next wave of features:

**Gap 1 — AI surface is too thin.**
The only AI-readable field is `description: string`. An AI layout agent that wants to answer "which widget should I use for time-series data in a side panel?" must guess from free text. There is no structured signal for: rendering modality (chart vs table vs text), suggested placement, interaction style, or data shape. AI queries will produce low-quality layout suggestions until this is fixed.

**Gap 2 — Default widgets are placeholders.**
`LOG_VIEWER` and `STATUS_INDICATOR` both return `null` from their factories. They register successfully but render nothing. The framework claims to ship "built-in widgets" — it does not, yet. `LOG_VIEWER` is the most critical: every backend example produces `log/*` events and the current demo renders a blank panel where logs should appear.

**Gap 3 — Registration is purely imperative.**
Every consumer calls `registry.register(MY_WIDGET)` in application code. There is no declarative way to say "load all widgets from this package". Framework packages cannot auto-register their defaults without importing and running user-facing code at startup. A plugin package cannot declare its widgets without the host application knowing to call its registration function. This blocks plugin-style packaging where a package's widgets load automatically just by being installed.

---

## 2. Phase 2a Scope — PR A: Capability Attributes + Real LogViewer

PR A is self-contained and reviewable independently of PR B. It does not touch the manifest system.

### 2a.1 Capability Attributes on WidgetDefinition

Add four optional fields to `WidgetDefinition`. All are optional so no existing registration call breaks.

```typescript
export interface WidgetDefinition {
  // ── Existing fields (unchanged) ────────────────────────────────────────────
  name: string;
  description: string;
  channelPattern: string;
  consumes: string[];
  priority: number;
  parameters: Record<string, unknown>;
  factory: (options: ComponentOptions) => ComponentType | Promise<ComponentType>;

  // ── New in Phase 2a ────────────────────────────────────────────────────────

  /**
   * Structured tags describing widget rendering and interaction style.
   *
   * Used by AI layout agents and the layout editor for structured queries.
   * Tags are additive — a widget may have several.
   *
   * @example ["chart", "streaming", "zoomable"]
   * @example ["text", "streaming", "searchable"]
   */
  capabilities?: WidgetCapability[];

  /**
   * One-sentence human-readable summary — shorter than `description`.
   * Displayed in the layout editor widget picker alongside the widget name.
   * AI agents may use this for disambiguation when multiple widgets match.
   *
   * If omitted, the first sentence of `description` is used as a fallback.
   */
  summary?: string;

  /**
   * Preferred shell region where this widget naturally belongs.
   * AI layout agents treat this as a strong prior — not a hard constraint.
   * The shell auto-places widgets here when building an initial layout.
   *
   * Defined in `shellTypes.ts`; imported here for cross-package typing.
   * Defaults to `"main"` when omitted.
   */
  defaultRegion?: RegionId;

  /**
   * Human-readable label for the layout editor widget picker.
   * Falls back to `name` when omitted.
   *
   * @example "Log Viewer"
   * @example "Status Indicator"
   */
  displayName?: string;
}
```

Add the `WidgetCapability` union type:

```typescript
/**
 * Structured capability tag for a widget.
 *
 * Channel-first principle: `channelPattern` and `consumes` identify WHAT data
 * the widget handles. `WidgetCapability` describes HOW it renders and behaves —
 * the rendering modality, interaction style, and layout characteristics.
 *
 * AI agents use these to answer questions like:
 * - "Find widgets that can display streaming data in a compact form"
 * - "Which widgets support user interaction (not read-only)?"
 * - "What is the best chart widget for time-series data?"
 */
export type WidgetCapability =
  // Rendering modality
  | "chart" // renders a chart (line, bar, scatter, etc.)
  | "table" // renders tabular data
  | "text" // renders plain or structured text
  | "gauge" // renders a single-value gauge or meter
  | "status" // renders a status indicator (connected / disconnected / running)
  | "map" // renders a spatial map
  | "form" // renders an input form

  // Data characteristics
  | "streaming" // data arrives continuously; widget updates live
  | "historical" // queries and displays historical/archived data
  | "aggregated" // displays aggregate values (sum, avg, max) rather than raw events

  // Layout characteristics
  | "compact" // suitable for narrow panels (status-bar, sidebar)
  | "fullscreen" // benefits from or requires full-area display

  // Interaction style
  | "zoomable" // supports zoom / pan interactions
  | "searchable" // supports text search within displayed data
  | "configurable" // exposes interactive configuration controls at runtime
  | "read-only"; // displays data only, no user interaction
```

### 2a.2 Update Default Widget Definitions

Update `LOG_VIEWER` and `STATUS_INDICATOR` in `defaultWidgets.ts` with the new fields:

```typescript
export const LOG_VIEWER: WidgetDefinition = {
  name: "LogViewer",
  displayName: "Log Viewer",
  summary: "Displays live log stream from simulation stdout/stderr.",
  description: "...", // unchanged
  channelPattern: "log/*",
  consumes: ["text/plain"],
  priority: 10,
  defaultRegion: "bottom",
  capabilities: ["text", "streaming", "searchable", "read-only"],
  parameters: {
    /* unchanged */
  },
  factory: () => LogViewerComponent, // real component — see 2a.3
};

export const STATUS_INDICATOR: WidgetDefinition = {
  name: "StatusIndicator",
  displayName: "Status Indicator",
  summary: "Displays heartbeat and run status from the control channel.",
  description: "...", // unchanged
  channelPattern: "control/*",
  consumes: ["application/x-control+json"],
  priority: 10,
  defaultRegion: "status-bar",
  capabilities: ["status", "streaming", "compact", "read-only"],
  parameters: {
    /* unchanged */
  },
  factory: () => StatusIndicatorComponent, // real component — see 2a.3
};
```

Note the `defaultRegion` assignments: `LOG_VIEWER` belongs in `"bottom"` (log panel), `STATUS_INDICATOR` in `"status-bar"` (thin bar). Both override the `"main"` default.

### 2a.3 Real LogViewer Component

Replace the `LogViewerPlaceholder` in `defaultWidgets.ts` with a functional React component that uses framework event bus primitives. The component must:

- Accept `parameters: { maxLines?: number; showTimestamps?: boolean; wrapLines?: boolean }` via `ComponentOptions`.
- Subscribe to the channel it was placed on using `useChannel` — the channel is passed as a prop by `RegionItemRenderer` via `item.props.channel`.
- Display log lines in a scrolling container, newest at bottom.
- Respect `maxLines` — trim oldest entries when exceeded.
- Optionally show timestamp prefix when `showTimestamps: true`.
- Optionally wrap long lines when `wrapLines: true`.
- Show a "No logs yet" placeholder when the channel has produced no events.
- Apply no external CSS dependencies — use inline styles or a CSS module scoped to this file.

The component is framework-internal and lives in `packages/framework-core-ui/src/LogViewer.tsx`. It is not exported from `index.ts` — consumers obtain it through the registry's factory, not by importing it directly.

### 2a.4 WidgetRegistry.queryByCapability

Add a new query method to `WidgetRegistry`:

````typescript
/**
 * Return widgets that declare ALL of the requested capabilities.
 *
 * Widgets without a `capabilities` field never match.
 * Results are sorted by `priority` descending.
 *
 * @param capabilities One or more {@link WidgetCapability} tags that must all be present.
 * @returns Matching widgets sorted by priority, or `[]` when none match.
 * @example
 * ```ts
 * // Find all compact, streaming widgets for the status bar
 * registry.queryByCapability("compact", "streaming");
 * ```
 */
queryByCapability(...capabilities: WidgetCapability[]): WidgetDefinition[] {
  return [...this._widgets.values()]
    .filter((w) =>
      capabilities.every((cap) => w.capabilities?.includes(cap) ?? false)
    )
    .sort((a, b) => b.priority - a.priority);
}
````

### 2a.5 Export Updates

Export from `packages/framework-core-ui/src/index.ts`:

- `WidgetCapability` type

Do NOT export `LogViewerComponent` or `StatusIndicatorComponent` — they are internal.

### 2a.6 Tests

- **`widgetRegistry.test.ts`** — add tests for `queryByCapability`:
  - Returns empty array when no widgets have capabilities.
  - Returns widget when all requested capabilities match.
  - Does not return widget when only some capabilities match (AND logic, not OR).
  - Sorts by priority descending.
  - Ignores widgets with no `capabilities` field.

- **`defaultWidgets.test.ts`** — add or update tests:
  - `LOG_VIEWER.capabilities` includes `"streaming"` and `"searchable"`.
  - `LOG_VIEWER.defaultRegion` is `"bottom"`.
  - `STATUS_INDICATOR.capabilities` includes `"compact"` and `"status"`.
  - `STATUS_INDICATOR.defaultRegion` is `"status-bar"`.
  - `LOG_VIEWER.factory()` returns a React component (not null, not a Promise).

- **`LogViewer.test.tsx`** — new test file for the LogViewer component:
  - Renders "No logs yet" when no events have arrived.
  - Displays log lines when channel emits events.
  - Trims oldest lines when `maxLines` is exceeded.
  - Shows timestamps when `showTimestamps: true`.
  - Hides timestamps when `showTimestamps: false`.
  - Wraps lines when `wrapLines: true`.

### 2a.7 PR A Checklist

- [ ] Add `WidgetCapability` union type to `widgetRegistry.ts`
- [ ] Add `capabilities?`, `summary?`, `displayName?` fields to `WidgetDefinition`
- [ ] Add `queryByCapability()` method to `WidgetRegistry`
- [ ] Update `LOG_VIEWER` in `defaultWidgets.ts` with capabilities, summary, displayName, defaultRegion
- [ ] Update `STATUS_INDICATOR` in `defaultWidgets.ts` with capabilities, summary, displayName, defaultRegion
- [ ] Create `packages/framework-core-ui/src/LogViewer.tsx` with real component
- [ ] Replace `LogViewerPlaceholder` in `defaultWidgets.ts` factory with `LogViewerComponent`
- [ ] Export `WidgetCapability` from `index.ts`
- [ ] Add `queryByCapability` tests to `widgetRegistry.test.ts`
- [ ] Add capability/defaultRegion tests to `defaultWidgets.test.ts`
- [ ] Create `LogViewer.test.tsx` with component behaviour tests
- [ ] Run `npm run typecheck` — no errors
- [ ] Run `npm run test:ui` — all tests pass
- [ ] Run `npm run lint` — no errors

---

## 3. Phase 2b Scope — PR B: Manifest-Based Plugin System

PR B builds on PR A. Merge PR A first; PR B branches from the merged state.

### 3b.1 Manifest Format

Each package that provides widgets ships a `widgets.json` sidecar file at a well-known path. The manifest is plain JSON — no code, no dynamic imports. It declares widgets by name and points to the module path that exports the `WidgetDefinition` object.

```json
{
  "$schema": "https://app-framework/schemas/widgets-manifest.json",
  "version": "1",
  "widgets": [
    {
      "name": "LogViewer",
      "module": "./defaultWidgets",
      "export": "LOG_VIEWER"
    },
    {
      "name": "StatusIndicator",
      "module": "./defaultWidgets",
      "export": "STATUS_INDICATOR"
    }
  ]
}
```

**Fields:**

- `name` — must match the `name` field in the exported `WidgetDefinition`. Used as a fast lookup key without loading the module.
- `module` — relative import path, resolved from the manifest file's location. Always starts with `./`.
- `export` — named export in the module. The loader does `import(module)[export]` to obtain the `WidgetDefinition`.

**Why JSON, not TypeScript/JS:** A JSON manifest can be statically analyzed, linted, validated against a schema, and read by tooling without executing code. It is the same reason `package.json` is JSON. A `.ts` manifest would require `tsx` or `ts-node` to parse, which is a dev-dependency not appropriate for a runtime loader.

### 3b.2 WidgetLoader

A new class `WidgetLoader` in `packages/framework-core-ui/src/widgetLoader.ts`:

````typescript
/**
 * Loads widget definitions from a `widgets.json` manifest and registers
 * them into a {@link WidgetRegistry}.
 *
 * The registry and the loader are loosely coupled:
 * - The registry has no knowledge of manifests.
 * - The loader has no knowledge of how the registry stores or resolves widgets.
 *
 * Lazy loading: the factory for each manifest widget wraps the module import
 * in a dynamic `import()`. The module is not loaded until the widget is first
 * rendered — not at manifest load time.
 *
 * @example
 * ```ts
 * const loader = new WidgetLoader(registry);
 * await loader.loadManifest("/packages/framework-core-ui/widgets.json");
 * ```
 */
export class WidgetLoader {
  constructor(private readonly registry: WidgetRegistry) {}

  /**
   * Fetch and parse a `widgets.json` manifest, then register each declared
   * widget into the registry.
   *
   * Registration is eager for metadata (name, description, capabilities) but
   * lazy for the component factory — the module import is deferred until the
   * factory is first called.
   *
   * @param manifestUrl Absolute URL or path to the `widgets.json` file.
   * @returns Promise that resolves when all widgets are registered.
   * @throws Error if the manifest cannot be fetched or parsed.
   * @throws Error if a widget module or export cannot be resolved at factory call time.
   */
  async loadManifest(manifestUrl: string): Promise<void>;

  /**
   * Unregister all widgets that were registered by this loader instance.
   *
   * Calls `dispose()` on all registration handles. Widgets currently rendered
   * are not affected — `WidgetRegistry` guarantees stability of resolved
   * components until re-render.
   */
  dispose(): void;
}
````

**Lazy loading contract:** `WidgetLoader` registers each widget immediately upon manifest load. The registered `WidgetDefinition` contains all metadata fields (`name`, `description`, `capabilities`, etc.) so the registry can answer capability queries without loading the module. Only the `factory` function defers work: the first call to `factory(options)` triggers `import(module)` and resolves the component. Subsequent calls use a cached promise.

**Error handling:**

- Manifest fetch/parse error: `loadManifest()` rejects with a descriptive error. No partial registration.
- Unknown export at factory call time: factory returns a "widget-load-error" component that renders an error message inline. It does not throw — the shell must not crash on a plugin failure.
- Duplicate name: `WidgetLoader` checks the registry before registering. If the name is already registered (by another loader or by direct `register()` call), it skips the manifest entry and emits a `console.warn`. It does not throw.

### 3b.3 useWidgetLoader Hook

A new hook `useWidgetLoader` in `packages/framework-core-ui/src/useWidgetLoader.ts`:

````typescript
/**
 * Load a widget manifest into the shared registry and keep it registered
 * for the lifetime of the calling component.
 *
 * Calls `loader.loadManifest(manifestUrl)` on mount and `loader.dispose()`
 * on unmount. Triggers a re-render once the manifest is loaded so that
 * widgets registered by the manifest are available for layout resolution.
 *
 * @param manifestUrl URL of the `widgets.json` manifest to load.
 * @returns Loading state — `"loading"`, `"ready"`, or `"error"`.
 * @example
 * ```ts
 * function App() {
 *   const status = useWidgetLoader("/plugins/my-plugin/widgets.json");
 *   if (status === "loading") return <Spinner />;
 *   return <ApplicationShell />;
 * }
 * ```
 */
export function useWidgetLoader(manifestUrl: string): "loading" | "ready" | "error";
````

### 3b.4 Manifest for framework-core-ui Default Widgets

Ship a `packages/framework-core-ui/widgets.json` manifest declaring `LogViewer` and `StatusIndicator`. This is the reference manifest — it is loaded by the `EventBusProvider` integration test to verify end-to-end manifest loading.

`EventBusProvider` itself does NOT auto-load this manifest. Auto-loading would couple the provider to the manifest path and make it non-configurable. Instead, the consuming application calls `useWidgetLoader` explicitly. The example frontend (`examples/frontend`) is updated to demonstrate this pattern.

### 3b.5 Export Updates

Export from `packages/framework-core-ui/src/index.ts`:

- `WidgetLoader` class
- `useWidgetLoader` hook
- `WidgetManifest` type (the parsed JSON shape)
- `WidgetManifestEntry` type (a single entry within the manifest)

### 3b.6 Tests

- **`widgetLoader.test.ts`** — new test file:
  - `loadManifest` registers all declared widgets.
  - Metadata fields (name, description, capabilities) are available immediately after `loadManifest` resolves.
  - Factory calls trigger dynamic import (mock the import to avoid real network calls).
  - Factory is cached — second call reuses the first import promise.
  - Duplicate widget name is skipped with `console.warn`, does not throw.
  - Manifest fetch failure rejects `loadManifest` with descriptive error.
  - `dispose()` unregisters all loaded widgets.
  - `dispose()` after `dispose()` is a no-op.

- **`useWidgetLoader.test.tsx`** — new test file:
  - Returns `"loading"` immediately after mount.
  - Returns `"ready"` after manifest loads.
  - Returns `"error"` when manifest load fails.
  - Calls `loader.dispose()` on unmount.
  - Re-renders when manifest loading completes.

### 3b.7 PR B Checklist

- [ ] Create `packages/framework-core-ui/src/widgetLoader.ts` with `WidgetLoader` class
- [ ] Create `packages/framework-core-ui/src/useWidgetLoader.ts` with `useWidgetLoader` hook
- [ ] Create `packages/framework-core-ui/widgets.json` manifest for default widgets
- [ ] Export `WidgetLoader`, `useWidgetLoader`, `WidgetManifest`, `WidgetManifestEntry` from `index.ts`
- [ ] Create `widgetLoader.test.ts` with all loader behaviour tests
- [ ] Create `useWidgetLoader.test.tsx` with all hook state tests
- [ ] Update `examples/frontend/src/main.tsx` to demonstrate `useWidgetLoader`
- [ ] Run `npm run typecheck` — no errors
- [ ] Run `npm run test:ui` — all tests pass
- [ ] Run `npm run lint` — no errors

---

## 4. Phase 3 Preview (Out of Scope)

Phase 3 wires AI layout generation on top of the capability registry:

- **AI layout agent** — given a set of available channels (from the EventBus) and the widget catalog (from `WidgetRegistry`), produce a `ShellLayout` JSON suggestion. The agent uses `resolveWidgets(channel)` and `queryByCapability(...)` to match widgets to channels, then assigns them to regions using `defaultRegion` as a prior.
- **Layout persistence** — `ShellLayout` is already `JSON.stringify`-safe (Phase 1). Phase 3 adds `save()` / `load(layout: ShellLayout)` wired to localStorage or a server API.
- **Drag-and-drop layout editor** — reads region state from `useShellLayout()`, writes changes back through the functional updater. The shell does not change; only the editor is new.
- **AI layout refinement** — user selects a region and asks "suggest a better widget for this channel". The AI queries `resolveWidgets` and `queryByCapability` and proposes a swap.

None of these require changes to the Phase 2 data model.

---

## 5. Design Decisions

### 5.1 Channel-First Resolution Is a Documented Principle

`channelPattern` is and remains the primary matching field. `consumes` (MIME type) is the refinement layer. `capabilities` is NOT a matching field — it is a descriptive annotation for AI agents and the layout editor. The resolution pipeline in `WidgetRegistry.resolveWidgets()` does not change:

1. Filter by `channelPattern` glob (primary).
2. If `mimeType` provided, filter the channel-matched set by `consumes` (refinement).
3. Sort by `priority` descending.

`queryByCapability` is a separate method for a different use case (AI layout generation, layout editor widget picker). It does not participate in event-driven widget resolution. The two query paths are intentionally independent.

**Why:** Channel carries semantic intent — `log/app` means "application log stream", regardless of how it is formatted. MIME type is a format hint. Capability describes rendering behavior. Conflating these three concerns into a single resolution pass would make the registry do too many things and make the resolution algorithm hard to reason about.

### 5.2 Capabilities Are Additive Tags, Not a Taxonomy

`WidgetCapability` is a flat union of string literals, not a hierarchy. A widget can have multiple capabilities. There are no parent/child relationships between tags.

**Why:** A taxonomy (e.g., `rendering.chart.line`) is harder to query ("give me all chart widgets" requires prefix matching), harder to extend (adding `"rendering.chart.candlestick"` requires touching the taxonomy), and harder to read. Flat tags with AND-logic queries (`queryByCapability("chart", "streaming")`) are simpler and sufficient for the Phase 3 AI use case.

### 5.3 Registry and Loader Are Loosely Coupled

`WidgetRegistry` has no `loadManifest` method. `WidgetLoader` has no internal state beyond its registry reference and the dispose handles it accumulates. The coupling is one-directional: the loader calls `registry.register()`.

**Why:** If the manifest system were baked into the registry, it would be impossible to test the registry without mocking the manifest loader, and impossible to use the registry without the loader. Keeping them separate means each can be tested independently and swapped independently.

### 5.4 No Auto-Registration from EventBusProvider

`EventBusProvider` does not automatically load any manifest. Framework-provided defaults (`LOG_VIEWER`, `STATUS_INDICATOR`) are available in the registry after the consuming application calls `useWidgetLoader` with the framework manifest URL. This is a one-liner in application code.

**Why:** Auto-loading from the provider would make the manifest URL implicit and unconfigurable. It would also couple the provider to the file system layout of the package. Explicit `useWidgetLoader` calls are transparent, testable, and configurable. The framework's goal is to provide the mechanism, not to make invisible decisions on behalf of the application.

### 5.5 Lazy Module Loading — No Eager Imports

`WidgetLoader` uses dynamic `import()` inside each widget's factory. Manifest parsing and registration are synchronous and immediate. Module loading is deferred until the factory is first called.

**Why:** A manifest may declare dozens of widgets. Loading all their modules at startup would increase initial bundle load time proportionally. Lazy loading means the application only pays for the modules it actually renders. The capability metadata (used for AI queries and widget picker) is available immediately after `loadManifest` resolves — it is encoded directly in the manifest, not in the module.

---

## 6. Edge Cases

| Scenario                                                | Behaviour                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest `module` path does not resolve                 | Factory renders `widget-load-error` component inline. No crash. `console.error` logged.                                                        |
| Manifest `export` is not a valid `WidgetDefinition`     | Factory renders `widget-load-error`. Validation: at minimum, `name` must be a non-empty string.                                                |
| Two loaders register widgets with the same name         | Second registration is skipped with `console.warn`. First registration wins.                                                                   |
| `dispose()` called while a factory promise is in flight | Promise resolves normally; component is returned. Widget is then unregistered. Already-rendered instances continue to display until re-render. |
| `loadManifest` called twice on same instance            | Second call rejects immediately with `Error: manifest already loaded`. Call `dispose()` first to reload.                                       |
| `queryByCapability()` called with zero arguments        | Returns all widgets that have a non-empty `capabilities` array. (All pass the vacuous `every()` check.)                                        |
| Widget definition has `capabilities: []` (empty array)  | Passes `queryByCapability()` with zero arguments (vacuous true). Fails any query with one or more capability arguments.                        |

---

## 7. AI Layer Querying

Phase 2 delivers the primitive that Phase 3 AI layout generation requires. The intended query pattern for an AI agent building an initial `ShellLayout`:

```typescript
// 1. Get available channels from EventBus
const channels = eventBus.getKnownChannels(); // e.g. ["log/app", "data/temperature", "control/sim"]

// 2. For each channel, resolve the best widget
for (const channel of channels) {
  const candidates = registry.resolveWidgets(channel);
  if (candidates.length === 0) continue;
  const widget = candidates[0]; // highest priority match

  // 3. Place widget in its declared region (or "main" as fallback)
  const region = widget.defaultRegion ?? "main";
  layout.regions[region].items.push({
    id: crypto.randomUUID(),
    type: widget.name,
    props: {},
    order: layout.regions[region].items.length,
  });
}

// 4. If status-bar is empty, find a compact+status widget as a fallback
if (layout.regions["status-bar"].items.length === 0) {
  const fallback = registry.queryByCapability("compact", "status")[0];
  if (fallback) {
    layout.regions["status-bar"].items.push({
      id: crypto.randomUUID(),
      type: fallback.name,
      props: {},
      order: 0,
    });
  }
}
```

This pattern is what the Phase 3 AI agent will implement. Phase 2 makes it possible by providing:

- `resolveWidgets(channel)` — channel-first widget resolution (Phase 1, already shipped).
- `defaultRegion` — widget declares its preferred region (Phase 1, already shipped).
- `queryByCapability(...)` — structured fallback query for the AI agent (Phase 2a, new).
- Manifest loading — widget catalog populated without hand-authored `register()` calls (Phase 2b, new).

---

## 8. File Map

```
packages/framework-core-ui/src/
├── widgetRegistry.ts         # MODIFIED: add WidgetCapability type, capabilities/summary/displayName fields, queryByCapability()
├── defaultWidgets.ts         # MODIFIED: add capabilities/summary/displayName/defaultRegion to LOG_VIEWER + STATUS_INDICATOR; real LogViewer factory
├── LogViewer.tsx             # NEW (PR A): real LogViewer component
├── widgetLoader.ts           # NEW (PR B): WidgetLoader class
├── useWidgetLoader.ts        # NEW (PR B): useWidgetLoader hook
├── index.ts                  # MODIFIED: export WidgetCapability (PR A); WidgetLoader, useWidgetLoader, WidgetManifest, WidgetManifestEntry (PR B)
├── widgetRegistry.test.ts    # MODIFIED: add queryByCapability tests (PR A)
├── defaultWidgets.test.ts    # MODIFIED or NEW: add capabilities/defaultRegion tests (PR A)
├── LogViewer.test.tsx        # NEW (PR A): component behaviour tests
├── widgetLoader.test.ts      # NEW (PR B): loader behaviour tests
└── useWidgetLoader.test.tsx  # NEW (PR B): hook state tests

packages/framework-core-ui/
└── widgets.json              # NEW (PR B): manifest declaring LOG_VIEWER and STATUS_INDICATOR

examples/frontend/src/
└── main.tsx                  # MODIFIED (PR B): demonstrate useWidgetLoader
```
