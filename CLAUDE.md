# CLAUDE.md

## Project Structure

- `pypackages/framework-core/`
  - Reusable Python framework package.
  - `src/framework_core/bus.py`: `BaseEvent` and in-process `EventBus`.
  - `src/framework_core/ws_bridge.py`: WebSocket bridge (`/ws`) for subscribe/unsubscribe/publish.
  - `src/framework_core/stream_types.py`: `StreamType` enum and `WireMessage` wire model.
  - `src/framework_core/log_stream.py`: `LogStream` — broadcast free-text log entries over WebSocket.
  - `src/framework_core/control_stream.py`: `ControlStream` — broadcast heartbeat/status over WebSocket.
  - `src/framework_core/__init__.py`: `create_app()` FastAPI app factory entry point.
  - `tests/`: framework-core unit tests.
- `packages/framework-core-ui/`
  - Reusable TypeScript/React frontend primitives.
  - `src/EventBusContext.tsx`: `EventBusProvider`, URL derivation, context access hook.
  - `src/client.ts`: WebSocket client abstraction, channel matching, wire-event coercion, stream routing.
  - `src/useChannel.ts`: channel subscription hook (stream="data").
  - `src/usePublish.ts`: publish hook.
  - `src/useEventBusStatus.ts`: connection status hook.
  - `src/useLogStream.ts`: `useLogStream` hook for stream="log" messages.
  - `src/useControlStream.ts`: `useControlStream` hook for stream="control" messages.
  - `src/index.ts`: public package exports.
- `examples/backend/`
  - Backend demo app using framework-core.
  - `main.py`: app wiring with lifespan and background tasks (demonstrates all 3 streams).
  - `producers.py`: sine/log demo event producers.
  - `consumers.py`: backend log consumer example.
- `examples/frontend/`
  - Frontend demo app using `@app-framework/core-ui`.
  - `src/main.tsx`: app entry and provider usage.
  - `src/useSimulation.ts`: app-specific data hook built on top of `useChannel`.
- `e2e/`
  - Playwright end-to-end tests.
- `.github/workflows/ci.yml`
  - CI pipeline for Python quality, TypeScript quality, and package + e2e.

## WebSocket Wire Format

Every message on the `/ws` WebSocket connection carries a `stream` discriminator:

| Stream | Direction | Shape |
|--------|-----------|-------|
| `data` | both | `{ "stream": "data", "channel": "…", "headers": { "message_id": "…", "timestamp": 123 }, "payload": {…} }` |
| `log` | server→client only | `{ "stream": "log", "payload": "text" }` |
| `control` | server→client only | `{ "stream": "control", "payload": { "type": "heartbeat"\|"status", … } }` |

**Client → Server** messages for the `data` stream use the existing action format (`subscribe`, `unsubscribe`, `publish`). The `stream` field is optional on inbound messages and defaults to `"data"` for backward compatibility. Clients sending `stream="log"` or `stream="control"` receive an error — those streams are server-push-only.

### Python stream classes (framework-core)

- `framework_core.stream_types.StreamType` — `"data" | "log" | "control"` StrEnum.
- `framework_core.stream_types.WireMessage` — Pydantic model for outgoing envelopes.
- `framework_core.log_stream.LogStream` — call `await app.state.log_stream.log("text")` to broadcast to all connected clients.
- `framework_core.control_stream.ControlStream` — call `await app.state.control_stream.send_status({…})` or schedule `start_heartbeat()` as a background task.

### TypeScript stream hooks (framework-core-ui)

- `useLogStream()` — returns the latest log payload (`unknown | null`).
- `useControlStream()` — returns the latest control payload (`unknown | null`).
- `client.onData(pattern, handler)` — alias for `client.subscribe` (data stream).
- `client.onLog(handler)` / `client.onControl(handler)` — stream-level subscriptions.

## Key Entry Points

- Python framework app factory: `framework_core.create_app`
- Backend example app: `examples.backend.main:app`
- Frontend example entry: `examples/frontend/src/main.tsx`
- Frontend package public API: `packages/framework-core-ui/src/index.ts`

## Key Scripts

- Install dependencies:
  - JS: `npm install`
  - Python: `uv sync --all-groups`
- Run project locally:
  - Frontend example: `npm run dev`
  - Backend example: `uv run uvicorn examples.backend.main:app --reload`
- Run tests:
  - TypeScript UI tests: `npm run test:ui`
  - Python tests: `pytest -q` (or `uv run pytest`)
  - E2E tests: `npm run test:e2e`
- Code quality:
  - TypeScript lint: `npm run lint`
  - TypeScript typecheck: `npm run typecheck`
  - Python lint: `ruff check .`
  - Python typecheck: `mypy pypackages/framework-core/src`
  - Formatting check: `npm run format:check`

## Key Libraries Used

### Python

- `fastapi`: backend app + WebSocket endpoint.
- `pydantic`: typed event models and serialization.
- `pytest`, `pytest-anyio`, `anyio`: async-capable test framework.
- `ruff`: Python linting/import/style checks.
- `mypy`: static typing checks.

### TypeScript / Frontend

- `react`, `react-dom`: UI runtime and rendering.
- `vite`: frontend dev/build tooling.
- `typescript`: static type checking.
- `vitest`: unit testing.
- `react-test-renderer`: hook/component tests in Node test runtime.
- `eslint`: linting.
- `playwright`: e2e testing.

## Code Conventions

- Keep reusable framework code in `pypackages/framework-core` and `packages/framework-core-ui`.
- Keep demo/app-specific code in `examples/` only.
- Public APIs must be documented:
  - TypeScript: JSDoc with description, `@param`, `@returns`, and `@example`.
  - Python: consistent docstrings with summary + `Args`/`Returns` (or equivalent).
- Every feature must be tested:
  - Python behavior in pytest unit tests.
  - TypeScript hooks/client behavior in Vitest tests.
- Naming:
  - Channels use slash-separated paths (for example, `sensor/temperature`, `logs/app`).
  - Hooks are named `useX`.
  - Event payload models use descriptive PascalCase names.
- Imports:
  - Keep imports clean, grouped, and lint/formatter compliant.
  - Prefer explicit named imports over wildcard imports.

## Good Practices for Future Agents

- Do not change core behavior unless explicitly requested; prefer additive docs/tests/refinement.
- Preserve API boundaries:
  - No demo code in framework packages.
  - No framework internals leaked to consumers.
- Keep one WebSocket connection per frontend app/provider instance.
- Validate edge cases in tests (replay behavior, unsubscribe behavior, malformed messages).
- Avoid silent failures where possible; provide explicit errors for invalid usage.
- Stream routing: `log` and `control` are server-push-only; clients sending them receive an error.
- Run the full local quality bar before finishing:
  - `ruff check .`
  - `pytest -q`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:ui`
