import { useEffect, useState } from "react";

import { useWidgetRegistryInstance } from "./WidgetRegistryContext";
import { WidgetLoader } from "./widgetLoader";

/**
 * Load a widget manifest into the shared registry and keep it registered
 * for the lifetime of the calling component.
 *
 * Calls `loader.loadManifest(manifestUrl)` on mount and `loader.dispose()`
 * on unmount. Triggers a re-render once the manifest is loaded so that
 * widgets registered by the manifest are available for layout resolution.
 *
 * **Note on manifest URL serving:** For now, consumers hardcode the manifest
 * URL (e.g. `useWidgetLoader("/sct-manifest.json")`). Serving manifest files
 * from the backend — so that installed plugins can register themselves at a
 * well-known URL — is a follow-up task. The URL parameter is intentionally
 * left open to support this pattern without API changes.
 *
 * @param manifestUrl URL of the `sct-manifest.json` manifest to load.
 * @returns Loading state — `"loading"`, `"ready"`, or `"error"`.
 * @example
 * ```ts
 * function App() {
 *   const status = useWidgetLoader("/sct-manifest.json");
 *   if (status === "loading") return <Spinner />;
 *   return <ApplicationShell />;
 * }
 * ```
 */
export function useWidgetLoader(manifestUrl: string): "loading" | "ready" | "error" {
  const registry = useWidgetRegistryInstance();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const loader = new WidgetLoader(registry);
    let cancelled = false;

    loader.loadManifest(manifestUrl).then(
      () => {
        if (!cancelled) setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );

    return () => {
      cancelled = true;
      loader.dispose();
    };
  }, [registry, manifestUrl]);

  return status;
}
