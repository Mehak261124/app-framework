# Event Bus & Real-Time Communication - API Specification

> **Status:** Draft - open for review before implementation  
> **Context:** Resolves the specification requirement raised in PR #4 review feedback.

---

## 1. Overview

This document specifies how **producers** and **consumers** of events interact with the framework's event system, on both the backend (Python/FastAPI) and the frontend (React/TypeScript).

The model is **channel-based**, following [AsyncAPI](https://www.asyncapi.com/en) conventions:

- A **channel** is a named address (e.g. `sensor/temperature`, `logs/app`) through which messages flow.
- A **producer** publishes messages to a channel.
- A **consumer** subscribes to a channel and receives messages via a handler callback.
- The **EventBus** is the in-process broker that routes messages between producers and consumers.
- The **WebSocket bridge** connects the backend EventBus to frontend consumers over a single, multiplexed WebSocket connection.

---

## 2. Package Layout

```
pypackages/
  framework-core/          ← reusable framework only
    src/framework_core/
      bus.py               ← EventBus class
      ws_bridge.py         ← WebSocket → EventBus bridge
      __init__.py          ← create_app() factory, no demo code

  example-app/             ← demo app only, no framework primitives
    src/example_app/
      producers.py         ← demo sine-wave & log publishers
      main.py              ← mounts framework + registers demo producers

packages/
  framework-core-ui/       ← reusable frontend framework primitives
    src/
      EventBusContext.tsx  ← React context + provider
      useChannel.ts        ← generic channel subscription hook
      usePublish.ts        ← generic publish hook

  ui-shell/                ← example app frontend, imports framework-core-ui
    src/
      useSimulation.ts     ← simulation-specific hook (uses useChannel)
      main.tsx             ← demo UI
```

---

## 3. Backend API

### 3.1 EventBus

The `EventBus` lives entirely in-process on the server. Consumers register **handler callbacks** - they never touch a queue directly.

#### Channel naming convention

Channels follow a `/`-separated path pattern:

```
<domain>/<topic>
sensor/temperature
sensor/humidity
logs/app
commands/reset
```

#### Subscribing (consumer)

```python
from framework_core.bus import EventBus
from pydantic import BaseModel

class TemperatureReading(BaseModel):
    value: float
    unit: str = "celsius"
    timestamp: float

bus = EventBus()

# Subscribe: pass a typed async handler.
# The handler is called whenever a message arrives on this channel.
async def on_temperature(message: TemperatureReading) -> None:
    print(f"Received: {message.value}°{message.unit}")

bus.subscribe("sensor/temperature", on_temperature)
```

#### Unsubscribing

```python
bus.unsubscribe("sensor/temperature", on_temperature)
```

#### Publishing (producer)

```python
await bus.publish("sensor/temperature", TemperatureReading(value=22.5, timestamp=time.time()))
```

#### EventBus interface (to be implemented)

```python
class EventBus:
    def subscribe(self, channel: str, handler: Callable[[Any], Awaitable[None]]) -> None:
        """Register an async handler for messages on `channel`."""

    def unsubscribe(self, channel: str, handler: Callable[[Any], Awaitable[None]]) -> None:
        """Remove a previously registered handler."""

    async def publish(self, channel: str, message: Any) -> None:
        """Publish `message` to all handlers subscribed to `channel`."""
```

#### Key design decisions

- Handlers are **async callables** - no queue objects are ever exposed to consumers.
- Messages are **Pydantic models** - validated and serializable out of the box.
- One handler can subscribe to multiple channels; one channel can have multiple handlers.

---

### 3.2 WebSocket Bridge

The bridge exposes the backend `EventBus` to frontend clients over a **single WebSocket endpoint** (`/ws`). All channel traffic is multiplexed over this one connection.

#### Wire format (JSON)

Every message over the wire has this envelope:

```json
{
  "channel": "sensor/temperature",
  "payload": {
    "value": 22.5,
    "unit": "celsius",
    "timestamp": 1712345678.0
  }
}
```

#### Subscription handshake (client → server)

A frontend client sends a subscribe command to start receiving a channel:

```json
{ "action": "subscribe", "channel": "sensor/temperature" }
```

And to stop:

```json
{ "action": "unsubscribe", "channel": "sensor/temperature" }
```

The server then routes only subscribed channels to that client - no flooding.

#### Framework's `create_app()` wires this up automatically:

```python
# framework_core/__init__.py
def create_app() -> FastAPI:
    """Create and return a configured FastAPI application.

    Mounts the /ws WebSocket endpoint backed by a shared EventBus.
    The application's EventBus is accessible via app.state.bus.
    """
    app = FastAPI()
    bus = EventBus()
    app.state.bus = bus
    # mount /ws bridge - no demo code here
    _mount_ws_bridge(app, bus)
    return app
```

The **example app** then imports `create_app()` and registers its own producers:

```python
# example_app/main.py
from framework_core import create_app
from example_app.producers import start_sine_wave_producer, start_log_producer

app = create_app()

@app.on_event("startup")
async def startup():
    bus = app.state.bus
    asyncio.create_task(start_sine_wave_producer(bus))
    asyncio.create_task(start_log_producer(bus))
```

---

## 4. Frontend API

### 4.1 EventBusProvider

A single WebSocket connection is opened at the app root and shared across all widgets via React context. This means **one connection per browser tab**, regardless of how many widgets subscribe to channels.

```tsx
// packages/framework-core-ui/src/EventBusContext.tsx

// Wrap your app once at the root:
import { EventBusProvider } from "@app-framework/core-ui";

function App() {
  return (
    <EventBusProvider url="ws://localhost:8000/ws">
      <Dashboard />
    </EventBusProvider>
  );
}
```

### 4.2 `useChannel<T>` - consuming events in a widget

```tsx
// packages/framework-core-ui/src/useChannel.ts

import { useChannel } from "@app-framework/core-ui";

interface TemperatureReading {
  value: number;
  unit: string;
  timestamp: number;
}

function TemperatureWidget() {
  // Subscribes to "sensor/temperature".
  // `data` is the latest message; null before first message arrives.
  // Re-renders whenever a new message arrives on this channel.
  const data = useChannel<TemperatureReading>("sensor/temperature");

  if (!data) return <p>Waiting for data…</p>;
  return <p>{data.value}°{data.unit}</p>;
}
```

Signature:

```ts
function useChannel<T>(channel: string): T | null;
```

- Automatically sends `{ action: "subscribe", channel }` on mount.
- Automatically sends `{ action: "unsubscribe", channel }` on unmount.
- Returns the latest deserialized payload, or `null` before any message.

### 4.3 `usePublish` - sending events from a widget

```tsx
import { usePublish } from "@app-framework/core-ui";

function ResetButton() {
  const publish = usePublish();

  const handleClick = () => {
    publish("commands/reset", { target: "sensor-1" });
  };

  return <button onClick={handleClick}>Reset Sensor</button>;
}
```

Signature:

```ts
function usePublish(): (channel: string, payload: unknown) => void;
```

### 4.4 Connection status

```tsx
import { useEventBusStatus } from "@app-framework/core-ui";

function StatusBar() {
  const status = useEventBusStatus(); // "connecting" | "connected" | "disconnected"
  return <span>Bus: {status}</span>;
}
```

---

## 5. Example App Usage (end-to-end)

This shows how the **example app** composes framework primitives without polluting them.

### Backend (`example_app/producers.py`)

```python
import asyncio, math, time
from framework_core.bus import EventBus
from pydantic import BaseModel

class SineReading(BaseModel):
    channel: str = "data/sine"
    value: float
    timestamp: float

class LogEntry(BaseModel):
    channel: str = "logs/app"
    level: str
    message: str
    timestamp: float

async def start_sine_wave_producer(bus: EventBus) -> None:
    """Publish a sine wave reading to 'data/sine' every 100 ms."""
    t = 0.0
    while True:
        await bus.publish("data/sine", SineReading(value=math.sin(t), timestamp=time.time()))
        t += 0.1
        await asyncio.sleep(0.1)

async def start_log_producer(bus: EventBus) -> None:
    """Publish a heartbeat log entry to 'logs/app' every second."""
    while True:
        await bus.publish("logs/app", LogEntry(level="info", message="heartbeat", timestamp=time.time()))
        await asyncio.sleep(1.0)
```

### Frontend (`ui-shell/src/useSimulation.ts`)

```ts
// This hook is example-app specific. It lives in ui-shell, not framework-core-ui.
import { useChannel } from "@app-framework/core-ui";

interface SineReading { value: number; timestamp: number; }
interface LogEntry    { level: string; message: string; timestamp: number; }

export function useSimulation() {
  const sine = useChannel<SineReading>("data/sine");
  const log  = useChannel<LogEntry>("logs/app");
  return { sine, log };
}
```

---

## 6. Open Questions for Review Call

1. **EventBus library choice**: The hand-rolled `EventBus` should be replaced. `bubus` gives Pydantic integration and typed handler dispatch, but it filters by event *type* rather than channel *name*. Should we wrap it to add channel-based routing, or pick a different library (e.g. `pypubsub`, `aio-pika` in-memory mode, or a custom implementation)?

2. **Wildcard channel subscriptions**: Should `useChannel("sensor/*")` be supported? This is common in MQTT-style systems. Defer for now or design for it?

3. **Backend-initiated unsubscribe**: Should the server be able to force-close a subscription (e.g. on auth revocation)?

4. **Message history / replay**: Should a new subscriber receive the last N messages on subscribe (like Kafka consumer groups), or only future messages?

---

## 7. What Is NOT in Scope for This PR

- Authentication / authorization on channels
- Persistent message queues
- Multi-server / distributed EventBus
- Binary message payloads