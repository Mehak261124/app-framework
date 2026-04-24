import { create } from "zustand";

import { createDefaultShellLayout } from "../shellTypes";
import type { ShellLayout } from "../shellTypes";

/**
 * Zustand store shape for the shell layout.
 *
 * Holds the current {@link ShellLayout} and a functional updater that
 * follows the same immutable-update pattern as `React.useState`.
 */
export interface ShellLayoutStore {
  layout: ShellLayout;
  setLayout: (updater: (prev: ShellLayout) => ShellLayout) => void;
}

export const useShellLayoutStore = create<ShellLayoutStore>((set) => ({
  layout: createDefaultShellLayout(),
  setLayout: (updater) => set((state) => ({ layout: updater(state.layout) })),
}));
