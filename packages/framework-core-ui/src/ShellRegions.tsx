import React, { useContext } from "react";

import { ShellLayoutContext } from "./ApplicationShell";
import type { RegionItem, ShellLayoutContextValue } from "./shellTypes";
import { useWidgetRegistryInstance } from "./WidgetRegistryContext";

// ─── useShellLayoutContext ────────────────────────────────────────────────────

/**
 * Returns the {@link ShellLayoutContextValue} from {@link ShellLayoutContext}.
 *
 * Throws a descriptive error if called outside {@link ApplicationShell},
 * consistent with the project's explicit-error convention.
 *
 * @returns Current shell layout context value.
 * @throws Error when rendered outside `<ApplicationShell>`.
 */
function useShellLayoutContext(): ShellLayoutContextValue {
  const ctx = useContext(ShellLayoutContext);
  if (!ctx) {
    throw new Error(
      "Shell region components must be rendered inside <ApplicationShell>.",
    );
  }
  return ctx;
}

// ─── RegionItemRenderer ───────────────────────────────────────────────────────

/** Renders a single RegionItem — resolves type from registry, falls back to placeholders. */
function RegionItemRenderer({ item }: { item: RegionItem }): JSX.Element {
  const registry = useWidgetRegistryInstance();
  const definition = registry.get(item.type);
  if (!definition) {
    return <div data-testid="widget-not-found">Widget not found: {item.type}</div>;
  }
  const result = definition.factory({ parameters: item.props });
  if (typeof result !== "function") {
    return <div data-testid="widget-loading">Loading: {item.type}</div>;
  }
  const WidgetComponent = result;
  return <WidgetComponent />;
}

// ─── ShellHeader ──────────────────────────────────────────────────────────────

/**
 * Renders the `header` shell region. Always visible (non-togglable).
 *
 * Reads layout from {@link ShellLayoutContext} provided by {@link ApplicationShell}.
 *
 * @returns A div with `data-testid="shell-header"` containing sorted region items.
 * @example
 * ```tsx
 * <ApplicationShell>
 *   <ShellHeader />
 * </ApplicationShell>
 * ```
 */
export function ShellHeader(): JSX.Element {
  const ctx = useShellLayoutContext();
  const region = ctx.layout.regions.header;
  return (
    <div data-testid="shell-header">
      {region.items
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item) => (
          <RegionItemRenderer key={item.id} item={item} />
        ))}
    </div>
  );
}

// ─── ShellSidebarProps ────────────────────────────────────────────────────────

/**
 * Props for {@link ShellSidebar}.
 */
export interface ShellSidebarProps {
  /** Which sidebar to render. */
  side: "left" | "right";
}

// ─── ShellSidebar ─────────────────────────────────────────────────────────────

/**
 * Renders a collapsible sidebar shell region (`sidebar-left` or `sidebar-right`).
 *
 * Reads layout from {@link ShellLayoutContext} provided by {@link ApplicationShell}.
 * Hidden via `display: none` when the region's `visible` flag is `false`.
 *
 * @param props - {@link ShellSidebarProps}
 * @returns A div with `data-testid="shell-sidebar-{side}"` containing sorted region items.
 * @example
 * ```tsx
 * <ApplicationShell>
 *   <ShellSidebar side="left" />
 *   <ShellSidebar side="right" />
 * </ApplicationShell>
 * ```
 */
export function ShellSidebar({ side }: ShellSidebarProps): JSX.Element {
  const regionId = side === "left" ? "sidebar-left" : "sidebar-right";
  const ctx = useShellLayoutContext();
  const region = ctx.layout.regions[regionId];
  return (
    <div
      data-testid={`shell-sidebar-${side}`}
      style={{ display: region.visible ? undefined : "none" }}
    >
      {region.items
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item) => (
          <RegionItemRenderer key={item.id} item={item} />
        ))}
    </div>
  );
}

// ─── ShellMain ────────────────────────────────────────────────────────────────

/**
 * Renders the `main` shell region. Always visible (non-togglable).
 *
 * Shows a `data-testid="shell-main-empty"` fallback when no items are placed.
 * Reads layout from {@link ShellLayoutContext} provided by {@link ApplicationShell}.
 *
 * @returns A div with `data-testid="shell-main"` containing sorted region items or an empty placeholder.
 * @example
 * ```tsx
 * <ApplicationShell>
 *   <ShellMain />
 * </ApplicationShell>
 * ```
 */
export function ShellMain(): JSX.Element {
  const ctx = useShellLayoutContext();
  const region = ctx.layout.regions.main;
  return (
    <div data-testid="shell-main">
      {region.items.length === 0 ? (
        <div data-testid="shell-main-empty">No widgets placed</div>
      ) : (
        region.items
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((item) => <RegionItemRenderer key={item.id} item={item} />)
      )}
    </div>
  );
}

// ─── ShellBottom ──────────────────────────────────────────────────────────────

/**
 * Renders the `bottom` shell region. Collapsible.
 *
 * Reads layout from {@link ShellLayoutContext} provided by {@link ApplicationShell}.
 * Hidden via `display: none` when the region's `visible` flag is `false`.
 *
 * @returns A div with `data-testid="shell-bottom"` containing sorted region items.
 * @example
 * ```tsx
 * <ApplicationShell>
 *   <ShellBottom />
 * </ApplicationShell>
 * ```
 */
export function ShellBottom(): JSX.Element {
  const ctx = useShellLayoutContext();
  const region = ctx.layout.regions.bottom;
  return (
    <div
      data-testid="shell-bottom"
      style={{ display: region.visible ? undefined : "none" }}
    >
      {region.items
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item) => (
          <RegionItemRenderer key={item.id} item={item} />
        ))}
    </div>
  );
}

// ─── ShellStatusBar ───────────────────────────────────────────────────────────

/**
 * Renders the `status-bar` shell region. Always visible (non-togglable).
 *
 * Reads layout from {@link ShellLayoutContext} provided by {@link ApplicationShell}.
 *
 * @returns A div with `data-testid="shell-status-bar"` containing sorted region items.
 * @example
 * ```tsx
 * <ApplicationShell>
 *   <ShellStatusBar />
 * </ApplicationShell>
 * ```
 */
export function ShellStatusBar(): JSX.Element {
  const ctx = useShellLayoutContext();
  const region = ctx.layout.regions["status-bar"];
  return (
    <div data-testid="shell-status-bar">
      {region.items
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item) => (
          <RegionItemRenderer key={item.id} item={item} />
        ))}
    </div>
  );
}
