import React from "react";
import ReactDOM from "react-dom/client";

import {
  EventBusProvider,
  WidgetRegistryContext,
  WidgetRegistry,
  useEventBusStatus,
  useWidgetLoader,
} from "@app-framework/core-ui";

import { useSimulation } from "./useSimulation";

const registry = new WidgetRegistry();

function Dashboard() {
  const { sine, log } = useSimulation();
  const status = useEventBusStatus();

  return (
    <div>
      <h1>UI shell placeholder</h1>
      <p>Status: {status}</p>
      <p>Latest sine: {sine?.value?.toFixed(4) ?? "n/a"}</p>
      <p>Latest log: {log?.message ?? "n/a"}</p>
    </div>
  );
}

function AppShell() {
  const loaderStatus = useWidgetLoader("/sct-manifest.json");

  if (loaderStatus === "loading") {
    return <p>Loading widgets…</p>;
  }

  if (loaderStatus === "error") {
    return <p>Failed to load widget manifest.</p>;
  }

  return <Dashboard />;
}

function App() {
  return (
    <WidgetRegistryContext.Provider value={registry}>
      <EventBusProvider path="/ws">
        <AppShell />
      </EventBusProvider>
    </WidgetRegistryContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
