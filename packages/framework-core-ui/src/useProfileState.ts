import { useEffect, useRef } from "react";

import { registerProfileState } from "./profileStateRegistry";
import { useShellLayoutStore } from "./stores/shellStore";

/**
 * Opt a widget's state into layout profiles.
 *
 * Call this once with a **stable, unique key** and the current value plus its
 * setter. From then on the value is treated as part of the layout profile:
 *
 * - **Save** (`saveAsProfile`) snapshots the current value under `key`.
 * - **Switch** (`switchProfile`) replays the saved value by calling `setValue`.
 * - **Mount**: if the active profile already has a saved value for `key`, it is
 *   applied immediately, so a widget rendered into an active profile picks up
 *   its saved state.
 *
 * The value must be JSON-serializable (it is persisted with the profile). This
 * is the general mechanism for "restore anything": sliders, scroll positions,
 * selected tabs, node positions — any widget adds one line.
 *
 * @typeParam T - The value type (must be serializable).
 * @param key - Stable unique key, e.g. `"leftSidebar.volume"`. Namespacing by
 *   widget avoids collisions.
 * @param value - The widget's current value.
 * @param setValue - Setter used to restore a saved value into the widget.
 * @example
 * ```tsx
 * const [volume, setVolume] = useState(50);
 * useProfileState("mixer.volume", volume, setVolume);
 * ```
 */
export function useProfileState<T>(
  key: string,
  value: T,
  setValue: (value: T) => void,
): void {
  // Keep the latest value/setter in a ref so the registry entry stays stable
  // across renders while still reading/writing the current value.
  const latest = useRef({ value, setValue });
  latest.current = { value, setValue };

  // The value the widget mounted with is treated as its default — what it
  // resets to when a loaded profile has no saved value for this key.
  const defaultValue = useRef(value);

  useEffect(() => {
    const unregister = registerProfileState(key, {
      get: () => latest.current.value,
      set: (v) => latest.current.setValue(v as T),
      getDefault: () => defaultValue.current,
    });

    // Adopt the active profile's saved value for this key, if any.
    const store = useShellLayoutStore.getState();
    const active = store.profiles.find((p) => p.id === store.activeProfileId);
    const saved = active?.state?.[key];
    if (saved !== undefined) latest.current.setValue(saved as T);

    return unregister;
  }, [key]);
}
