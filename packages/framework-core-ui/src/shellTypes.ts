/** Serializable identifier for a shell region. */
export type RegionId =
  "header" | "sidebar-left" | "main" | "sidebar-right" | "bottom" | "status-bar";

/** A single widget placement in a shell region — fully serializable, no function references. */
export interface RegionItem {
  /** Stable unique identifier. Preserves identity across saves/reloads. */
  id: string;
  /** Widget type name — resolved via WidgetRegistry at render time. */
  type: string;
  /** User-configurable props. Must be JSON-serializable. */
  props: Record<string, unknown>;
  /** Render order within the region. Lower renders first. Defaults to 0. */
  order?: number;
  /**
   * Optional initial panel size as a percentage of the region, used when a
   * region stacks multiple items (e.g. `main`). When omitted, items share the
   * region equally. Lets a small widget (e.g. a status card) take less space
   * than a large one. Values across a region's items should sum to ~100.
   */
  size?: number;
}

/** Serializable state for a single region. */
export interface RegionState {
  /** Whether the region is currently visible. */
  visible: boolean;
  /** Ordered list of widget placements in this region. */
  items: RegionItem[];
  /**
   * Optional persisted panel size as a percentage of its resizable group,
   * captured when the user drags the region's resize handle (applies to the
   * collapsible `sidebar-left`, `sidebar-right`, and `bottom` regions). Lets a
   * saved layout profile restore not just which regions are visible but how
   * wide/tall they were. Omitted until the region is resized, in which case the
   * shell's default size is used.
   */
  size?: number;
}

/** Serializable snapshot of the full shell layout. */
export interface ShellLayout {
  regions: Record<RegionId, RegionState>;
}

/**
 * One named, saved dashboard arrangement.
 *
 * A profile pairs a user-facing {@link LayoutProfile.name} with a serializable
 * {@link ShellLayout}. The shell keeps a collection of these and renders the
 * one whose {@link LayoutProfile.id} matches the store's active profile id,
 * letting an engineer flip between e.g. a "Tuning" and a "Monitoring"
 * dashboard.
 */
export interface LayoutProfile {
  /** Stable unique id (e.g. `crypto.randomUUID()`); survives saves/reloads. */
  id: string;
  /** User-facing label, e.g. `"Monitoring"`. Never blank. */
  name: string;
  /** The serializable dashboard arrangement rendered when this profile is active. */
  layout: ShellLayout;
  /**
   * Captured per-widget state, keyed by the string passed to `useProfileState`
   * (e.g. slider values, scroll positions, selections). Frozen on save and
   * replayed on load alongside {@link LayoutProfile.layout}. Present only when
   * widgets have opted in; omitted for layout-only profiles.
   */
  state?: Record<string, unknown>;
}

/** Context value provided by ApplicationShell. */
export interface ShellLayoutContextValue {
  /** The current shell layout snapshot. */
  layout: ShellLayout;
  /**
   * Functional updater for the shell layout.  Always use the updater form
   * `setLayout(prev => ...)` to guarantee atomic, stale-closure-safe updates.
   * Direct value passing is not supported — only the updater form is exposed.
   */
  setLayout: (updater: (prev: ShellLayout) => ShellLayout) => void;
}

/**
 * Narrowed per-region updater.  Allows a region component to update only its
 * own {@link RegionState} without touching the rest of the {@link ShellLayout}.
 *
 * Toggle visibility example:
 * ```ts
 * setRegion(prev => ({ ...prev, visible: !prev.visible }));
 * ```
 */
export type RegionSetter = (updater: (prev: RegionState) => RegionState) => void;

/**
 * Returns a {@link ShellLayout} with all six regions at their spec-defined
 * default visibility.
 *
 * @returns A fresh `ShellLayout` where `header`, `sidebar-left`, `main`, and
 *   `status-bar` are visible, and `sidebar-right` and `bottom` are hidden.
 * @example
 * ```ts
 * const layout = createDefaultShellLayout();
 * layout.regions.main.visible; // true
 * layout.regions["sidebar-right"].visible; // false
 * ```
 */
export function createDefaultShellLayout(): ShellLayout {
  return {
    regions: {
      header: { visible: true, items: [] },
      "sidebar-left": { visible: true, items: [] },
      main: { visible: true, items: [] },
      "sidebar-right": { visible: false, items: [] },
      bottom: { visible: false, items: [] },
      "status-bar": { visible: true, items: [] },
    },
  };
}

/**
 * Increment this when the persisted store schema changes in a breaking way.
 * Bumping it runs the store's `migrate`, which — since this is a demonstrator
 * without backward compatibility — simply resets any older persisted data to a
 * fresh "Default" profile, so apps don't get a leftover layout from a previous
 * build.
 */
export const SHELL_LAYOUT_STORAGE_VERSION = 8;
