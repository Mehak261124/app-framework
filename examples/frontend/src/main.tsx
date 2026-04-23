import React from "react";
import ReactDOM from "react-dom/client";

import {
  ApplicationShell,
  EventBusProvider,
  WidgetRegistry,
  WidgetRegistryContext,
  createDefaultShellLayout,
  useEventBusStatus,
} from "@app-framework/core-ui";
import { useSimulation } from "./useSimulation";

import "./shell.css";

// ─── Dashboard widget ─────────────────────────────────────────────────────────

function DashboardComponent() {
  return function Dashboard() {
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
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new WidgetRegistry();
registry.register({
  name: "Dashboard",
  description: "Main dashboard widget",
  channelPattern: "data/*",
  consumes: ["text/plain"],
  priority: 10,
  parameters: {},
  defaultRegion: "main",
  factory: DashboardComponent,
});

// ─── Initial layout ───────────────────────────────────────────────────────────

const initialLayout = {
  ...createDefaultShellLayout(),
  regions: {
    ...createDefaultShellLayout().regions,
    main: {
      visible: true,
      items: [{ id: "dashboard-1", type: "Dashboard", props: {}, order: 0 }],
    },
  },
};

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <EventBusProvider path="/ws">
      <WidgetRegistryContext.Provider value={registry}>
        <ApplicationShell initialLayout={initialLayout} />
      </WidgetRegistryContext.Provider>
    </EventBusProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
