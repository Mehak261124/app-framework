/**
 * A process-wide registry of per-widget state, used by layout profiles to
 * capture "any" widget state on save and replay it on load.
 *
 * Widgets register through the {@link useProfileState} hook, which stores a
 * getter/setter pair under a stable string key. On **save**, the profile store
 * calls {@link snapshotProfileState} to collect every registered value into one
 * serializable blob. On **load**, it calls {@link applyProfileState} to push the
 * saved values back through the setters — the same functions that move the UI
 * when a user interacts — so sliders, scroll positions, selections, etc. return
 * to exactly what was saved.
 *
 * This module is intentionally free of React so the store can use it directly.
 */

/** A registered widget's window into its own state. */
export interface ProfileStateEntry {
  /** Read the widget's current value (called during snapshot). */
  get: () => unknown;
  /** Write a value back into the widget (called during apply/restore). */
  set: (value: unknown) => void;
  /**
   * Read the widget's **default** value — what it should reset to when a loaded
   * profile has no saved value for this key (e.g. the untouched "Default"
   * profile). Typically the value the widget mounted with.
   */
  getDefault: () => unknown;
}

const registry = new Map<string, ProfileStateEntry>();

/**
 * Register a widget's state under `key`. Returns an unregister function that
 * removes the entry — but only if it is still the current entry for `key`, so a
 * stale unregister (after the key was re-registered) is a no-op.
 *
 * @param key - Stable, unique key, e.g. `"leftSidebar.volume"`.
 * @param entry - The widget's {@link ProfileStateEntry}.
 * @returns A function that unregisters this entry.
 */
export function registerProfileState(
  key: string,
  entry: ProfileStateEntry,
): () => void {
  registry.set(key, entry);
  return () => {
    if (registry.get(key) === entry) registry.delete(key);
  };
}

/**
 * Collect the current value of every registered key into a serializable blob.
 *
 * @returns A `{ key: value }` map suitable for storing in a layout profile.
 */
export function snapshotProfileState(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of registry) {
    out[key] = entry.get();
  }
  return out;
}

/**
 * Load a profile's widget state into the currently registered widgets.
 *
 * Every registered widget is updated: to the profile's saved value for its key,
 * or — when the profile has **no** value for that key — back to the widget's
 * default. This is what makes switching to a profile that never touched a widget
 * (e.g. the "Default" profile) reset that widget instead of leaving it wherever
 * the previous profile left it. Keys in the blob with no registered widget are
 * ignored (that widget adopts its value on mount via {@link useProfileState}).
 *
 * @param blob - A previously snapshotted state map, or `undefined` (treated as
 *   "no saved values" → every widget resets to its default).
 */
export function applyProfileState(blob: Record<string, unknown> | undefined): void {
  for (const [key, entry] of registry) {
    const hasSaved = !!blob && Object.prototype.hasOwnProperty.call(blob, key);
    entry.set(hasSaved ? blob[key] : entry.getDefault());
  }
}
