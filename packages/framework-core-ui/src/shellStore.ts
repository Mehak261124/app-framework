import { create } from "zustand";

import { createDefaultShellLayout } from "./shellTypes";
import type { ShellLayout } from "./shellTypes";

interface ShellLayoutStore {
  layout: ShellLayout;
  setLayout: (updater: (prev: ShellLayout) => ShellLayout) => void;
}

export const useShellLayoutStore = create<ShellLayoutStore>((set) => ({
  layout: createDefaultShellLayout(),
  setLayout: (updater) => set((state) => ({ layout: updater(state.layout) })),
}));
