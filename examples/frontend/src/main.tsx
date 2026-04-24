import React from "react";
import ReactDOM from "react-dom/client";
import {
  ApplicationShell,
  EventBusProvider,
  WidgetRegistry,
  WidgetRegistryContext,
  WidgetLoaderProvider,
  useWidgetLoader,
} from "@app-framework/core-ui";
import "./shell.css";

const registry = new WidgetRegistry();

function AppShell() {
  const loaderStatus = useWidgetLoader("/sct-manifest.json");

  if (loaderStatus === "loading") {
    return <p>Loading widgets…</p>;
  }
  if (loaderStatus === "error") {
    return <p>Failed to load widget manifest.</p>;
  }

  return <ApplicationShell />;
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
