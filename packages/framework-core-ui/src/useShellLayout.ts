import { useContext } from "react";

import { ShellLayoutContext } from "./ApplicationShell";
import type { ShellLayout, ShellLayoutContextValue } from "./shellTypes";

/**
 * Returns the current {@link ShellLayout} and a functional updater from
 * {@link ShellLayoutContext}.
 *
 * Re-renders whenever the shell layout changes.
 * Follows the same `[value, setter]` tuple pattern as `React.useState`.
 *
 * @returns Tuple of `[layout, setLayout]` where `setLayout` is a functional
 *   updater that receives the previous layout and returns the next layout.
 * @throws Error when called outside `<ApplicationShell>`.
 * @example
 * ```tsx
 * const [layout, setLayout] = useShellLayout();
 * // Toggle sidebar-left:
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
  const ctx = useContext(ShellLayoutContext);
  if (!ctx) {
    throw new Error("useShellLayout must be called inside <ApplicationShell>.");
  }
  return [ctx.layout, ctx.setLayout];
}
