import React from "react";
import ReactDOM from "react-dom/client";
import {
  ApplicationShell,
  EventBusProvider,
  WidgetRegistry,
  WidgetRegistryContext,
  WidgetLoaderProvider,
  useWidgetLoader,
  PARAMETER_CONTROLLER,
  createDefaultShellLayout,
} from "@app-framework/core-ui";
import type { ShellLayout } from "@app-framework/core-ui";
import { useSimulation } from "./useSimulation";
import "./shell.css";

const registry = new WidgetRegistry();
registry.register(PARAMETER_CONTROLLER);

const initialLayout: ShellLayout = {
  regions: {
    ...createDefaultShellLayout().regions,
    "sidebar-left": {
      visible: true,
      items: [
        {
          id: "sim-params",
          type: "ParameterController",
          props: {
            channel: "params/control",
            parameters: {
              timestep: {
                title: "Time Step",
                type: "number",
                minimum: 0.001,
                maximum: 1.0,
                multipleOf: 0.001,
                default: 0.01,
                "x-options": { widget: "slider" },
              },
              max_iterations: {
                title: "Max Iterations",
                type: "number",
                minimum: 1,
                maximum: 10000,
                multipleOf: 1,
                default: 1000,
                "x-options": { widget: "input" },
              },
              solver: {
                title: "Solver",
                type: "string",
                enum: ["euler", "rk4", "adams"],
                default: "rk4",
                "x-options": { widget: "select" },
              },
            },
          },
          order: 0,
        },
      ],
    },
  },
};

function Dashboard() {
  const { sine, log } = useSimulation();

  return (
    <div
      data-testid="dashboard"
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid #333",
        fontFamily: "monospace",
        fontSize: 13,
        display: "flex",
        gap: 32,
        alignItems: "center",
      }}
    >
      <strong>Simulation Dashboard</strong>
      <span>
        Sine: <span data-testid="sine-value">{sine ? sine.value.toFixed(4) : "—"}</span>
      </span>
      <span>
        Last log:{" "}
        <span data-testid="last-log">
          {log ? `[${log.level}] ${log.message}` : "—"}
        </span>
      </span>
    </div>
  );
}

function AppShell() {
  const loaderStatus = useWidgetLoader("/sct-manifest.json");

  if (loaderStatus === "loading") return <p>Loading widgets…</p>;
  if (loaderStatus === "error") return <p>Failed to load widget manifest.</p>;

  return (
    <div
      data-testid="shell-layout"
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <Dashboard />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ApplicationShell initialLayout={initialLayout} />
      </div>
    </div>
  );
}

function App() {
  return (
    <WidgetRegistryContext.Provider value={registry}>
      <EventBusProvider path="/ws">
        <WidgetLoaderProvider>
          <AppShell />
        </WidgetLoaderProvider>
      </EventBusProvider>
    </WidgetRegistryContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
