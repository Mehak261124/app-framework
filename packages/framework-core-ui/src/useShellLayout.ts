import { useShellLayoutStore } from "./shellStore";
import type { ShellLayout, ShellLayoutContextValue } from "./shellTypes";

/**
 * Returns the current {@link ShellLayout} and a functional updater.
 *
 * Re-renders whenever the shell layout changes.
 * Follows the same `[value, setter]` tuple pattern as `React.useState`.
 *
 * Backed by a Zustand store — can be called from any component, no Provider needed.
 *
 * @returns Tuple of `[layout, setLayout]`.
 * @example
 * ```tsx
 * const [layout, setLayout] = useShellLayout();
 * setLayout((prev) => ({
 *   ...prev,
 *   regions: {
 *     ...prev.regions,
 *     "sidebar-left": {
 *       ...prev.regions["sidebar-left"],
 *       visible: !prev.regions["sidebar-left"].visible,
 *     },
 *   },
 * }));
 * ```
 */
export function useShellLayout(): [ShellLayout, ShellLayoutContextValue["setLayout"]] {
  const layout = useShellLayoutStore((state) => state.layout);
  const setLayout = useShellLayoutStore((state) => state.setLayout);
  return [layout, setLayout];
}
