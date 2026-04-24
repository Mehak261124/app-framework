import { createElement } from "react";
import type { ComponentType } from "react";

import type { IDisposable } from "./disposable";
import type { RegionId, WidgetDefinition, WidgetRegistry } from "./widgetRegistry";

// ─── Manifest types ───────────────────────────────────────────────────────────

/** A single widget entry in an {@link SctManifest}. */
export interface SctManifestEntry {
  name: string;
  description: string;
  channelPattern: string;
  consumes: string[];
  priority: number;
  defaultRegion?: RegionId;
  parameters: Record<string, unknown>;
  /**
   * Relative import path resolved from the manifest file's location.
   * Always starts with `./`.
   */
  module: string;
  /** Named export in the module that holds the React component. */
  export: string;
}

/** Shape of a parsed `sct-manifest.json` file. */
export interface SctManifest {
  version: string;
  widgets: SctManifestEntry[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** A minimal inline error component rendered when a widget module fails to load. */
function createWidgetLoadError(message: string): ComponentType {
  return function WidgetLoadError() {
    return createElement(
      "div",
      {
        "data-widget-load-error": "true",
        style: {
          color: "#c00",
          padding: "8px",
          fontFamily: "monospace",
          fontSize: "12px",
        },
      },
      message,
    );
  };
}

/** Internal type for the dynamic-import function, replaceable in tests. */
type ImportFn = (modulePath: string) => Promise<Record<string, unknown>>;

// ─── WidgetLoader ─────────────────────────────────────────────────────────────

/**
 * Loads widget definitions from an `sct-manifest.json` manifest and registers
 * them into a {@link WidgetRegistry}.
 *
 * The registry and the loader are loosely coupled:
 * - The registry has no knowledge of manifests.
 * - The loader has no knowledge of how the registry stores or resolves widgets.
 *
 * Lazy loading: the factory for each manifest widget wraps the module import
 * in a dynamic `import()`. The module is not loaded until the widget is first
 * rendered — not at manifest load time. All metadata fields are read from the
 * manifest directly, so the registry can answer metadata queries immediately
 * after `loadManifest` resolves.
 *
 * @example
 * ```ts
 * const loader = new WidgetLoader(registry);
 * await loader.loadManifest("/sct-manifest.json");
 * ```
 */
export class WidgetLoader {
  private readonly _handles: IDisposable[] = [];
  private _loaded = false;
  private readonly _importFn: ImportFn;

  /**
   * @param registry The widget registry to register manifest widgets into.
   * @param importFn Optional custom import function (used in tests to avoid
   *   real dynamic imports). Defaults to the native `import()`.
   */
  constructor(
    private readonly registry: WidgetRegistry,
    importFn?: ImportFn,
  ) {
    this._importFn =
      importFn ??
      ((m: string) => import(/* @vite-ignore */ m) as Promise<Record<string, unknown>>);
  }

  /**
   * Fetch and parse an `sct-manifest.json` manifest, then register each
   * declared widget into the registry.
   *
   * Registration is immediate for metadata; the component factory is lazy —
   * the module import is deferred until the factory is first called.
   *
   * @param manifestUrl Absolute URL or path to the `sct-manifest.json` file.
   * @returns Promise that resolves when all widgets are registered.
   * @throws Error if the manifest cannot be fetched or parsed.
   * @throws Error if called a second time without calling `dispose()` first.
   */
  async loadManifest(manifestUrl: string): Promise<void> {
    if (this._loaded) {
      throw new Error("manifest already loaded");
    }

    let manifest: SctManifest;
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch manifest from '${manifestUrl}': ${response.status} ${response.statusText}`,
        );
      }
      manifest = (await response.json()) as SctManifest;
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error(`Failed to load manifest from '${manifestUrl}': ${String(e)}`);
    }

    this._loaded = true;

    for (const entry of manifest.widgets) {
      if (this.registry.get(entry.name) !== undefined) {
        console.warn(
          `WidgetLoader: widget '${entry.name}' is already registered — skipping manifest entry.`,
        );
        continue;
      }

      let cachedPromise: Promise<ComponentType> | null = null;

      const definition: WidgetDefinition = {
        name: entry.name,
        description: entry.description,
        channelPattern: entry.channelPattern,
        consumes: entry.consumes,
        priority: entry.priority,
        defaultRegion: entry.defaultRegion,
        parameters: entry.parameters,
        factory: () => {
          if (!cachedPromise) {
            cachedPromise = this._importFn(entry.module)
              .then((mod) => {
                const component = mod[entry.export];
                if (typeof component !== "function") {
                  console.error(
                    `WidgetLoader: export '${entry.export}' from '${entry.module}' is not a valid React component.`,
                  );
                  return createWidgetLoadError(
                    `Widget '${entry.name}': invalid export '${entry.export}'`,
                  );
                }
                return component as ComponentType;
              })
              .catch((e: unknown) => {
                console.error(
                  `WidgetLoader: failed to load module '${entry.module}' for widget '${entry.name}'.`,
                  e,
                );
                return createWidgetLoadError(
                  `Widget '${entry.name}': failed to load module '${entry.module}'`,
                );
              });
          }
          return cachedPromise;
        },
      };

      const handle = this.registry.register(definition);
      this._handles.push(handle);
    }
  }

  /**
   * Unregister all widgets that were registered by this loader instance.
   *
   * Calls `dispose()` on all registration handles. Widgets currently rendered
   * are not affected — `WidgetRegistry` guarantees stability of resolved
   * components until re-render.
   *
   * Calling `dispose()` more than once is a no-op.
   */
  dispose(): void {
    for (const handle of this._handles) {
      handle.dispose();
    }
    this._handles.length = 0;
    this._loaded = false;
  }
}
