import { useEffect, useRef, useState } from "react";
import { toPayloadWithHeaders, useEventBusClient } from "@app-framework/core-ui";
import type { WidgetDefinition } from "@app-framework/core-ui";
import type { DroneTelemetry } from "./useDrone";

/** How many recent telemetry points the trajectory trail retains. */
const TRAIL_LENGTH = 400;

/** Which pair of position axes the view projects onto. */
export type TrajectoryPlane = "xy" | "xz" | "yz";

/** One position axis: its index into `position`/`target` and how it's labelled. */
interface AxisMeta {
  /** Index into the telemetry `position` / `target` arrays. */
  index: number;
  /** Full axis name, e.g. `"North"`. */
  label: string;
  /** Short readout prefix, e.g. `"N"`. */
  short: string;
}

const AXIS_META: Record<string, AxisMeta> = {
  x: { index: 0, label: "North", short: "N" },
  y: { index: 1, label: "East", short: "E" },
  z: { index: 2, label: "Altitude", short: "Alt" },
};

/** A single 2D point in the projected (horizontal, vertical) plane. */
interface Point {
  /** Horizontal-axis value (metres). */
  h: number;
  /** Vertical-axis value (metres). */
  v: number;
}

/** Fit a set of points into a padded square, returning a world→pixel mapper. */
function makeProjector(
  points: Point[],
  target: Point | null,
  width: number,
  height: number,
): (p: Point) => { x: number; y: number } {
  const all = target ? [...points, target] : points;
  const hs = all.map((p) => p.h);
  const vs = all.map((p) => p.v);
  const minH = Math.min(-1, ...hs);
  const maxH = Math.max(1, ...hs);
  const minV = Math.min(-1, ...vs);
  const maxV = Math.max(1, ...vs);
  const span = Math.max(maxH - minH, maxV - minV) || 1;
  const pad = 16;
  const scale = (Math.min(width, height) - 2 * pad) / span;
  const cH = (minH + maxH) / 2;
  const cV = (minV + maxV) / 2;
  return (p: Point) => ({
    // Centre the fitted path; flip the vertical so positive reads upward.
    x: width / 2 + (p.h - cH) * scale,
    y: height / 2 - (p.v - cV) * scale,
  });
}

/** Draw a small quadcopter glyph at (cx, cy), rotated to face `heading` (rad). */
function drawDrone(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  heading: number,
): void {
  const arm = 9;
  const rotor = 3.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);

  // Four arms in an X with a translucent rotor disc at each tip.
  ctx.lineWidth = 2;
  for (const a of [
    Math.PI / 4,
    (3 * Math.PI) / 4,
    (5 * Math.PI) / 4,
    (7 * Math.PI) / 4,
  ]) {
    const ex = Math.cos(a) * arm;
    const ey = Math.sin(a) * arm;
    ctx.strokeStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, ey, rotor, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(37,99,235,0.35)";
    ctx.fill();
    ctx.stroke();
  }

  // A short amber nose so the direction of travel is legible.
  ctx.strokeStyle = "#f59e0b";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(arm + 3, 0);
  ctx.stroke();

  // Body hub.
  ctx.fillStyle = "#1d4ed8";
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw(canvas: HTMLCanvasElement, points: Point[], target: Point | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const project = makeProjector(points, target, width, height);

  // Crosshair at the plane origin.
  const origin = project({ h: 0, v: 0 });
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.stroke();

  // Flight path.
  if (points.length > 1) {
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const q = project(p);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
  }

  // Current setpoint marker (hollow amber square).
  if (target) {
    const t = project(target);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.strokeRect(t.x - 5, t.y - 5, 10, 10);
  }

  // Current position: a small drone glyph pointed along its direction of travel.
  if (points.length > 0) {
    const p = project(points[points.length - 1]);
    let heading = 0;
    if (points.length > 1) {
      const prev = project(points[points.length - 2]);
      if (p.x !== prev.x || p.y !== prev.y) {
        heading = Math.atan2(p.y - prev.y, p.x - prev.x);
      }
    }
    drawDrone(ctx, p.x, p.y, heading);
  }
}

/**
 * Widget body: a 2D view of the drone's flight path on a configurable pair of
 * position axes, drawn on a `<canvas>` from buffered ``drone/telemetry``.
 *
 * The `plane` prop selects the projection: `"xy"` is the top-down (North × East)
 * view, `"xz"` and `"yz"` are side views showing altitude. The path auto-scales
 * to fit; the amber square is the current setpoint and the quadcopter glyph
 * (pointed along its travel) the current position, so overshoot and oscillation
 * are visible directly.
 *
 * A `<canvas>` has no semantic content, so the figure carries an accessible
 * label and a live text caption (which axes, current position, sample count)
 * that also serves as the test hook.
 *
 * @param props.plane Which axis pair to project onto. Default `"xy"`.
 * @returns The trajectory canvas with an accessible caption.
 */
function TrajectoryViewComponent({
  plane = "xy",
}: {
  plane?: TrajectoryPlane;
}): React.ReactElement {
  const client = useEventBusClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trail, setTrail] = useState<Point[]>([]);
  const [target, setTarget] = useState<Point | null>(null);

  const hAxis = AXIS_META[plane[0]];
  const vAxis = AXIS_META[plane[1]];

  useEffect(() => {
    setTrail([]);
    setTarget(null);
    return client.subscribe("drone/telemetry", (event) => {
      const t = toPayloadWithHeaders<DroneTelemetry>(event);
      if (!Array.isArray(t.position)) return;
      setTrail((prev) => {
        const next = [
          ...prev,
          { h: t.position[hAxis.index], v: t.position[vAxis.index] },
        ];
        return next.length > TRAIL_LENGTH
          ? next.slice(next.length - TRAIL_LENGTH)
          : next;
      });
      if (Array.isArray(t.target)) {
        setTarget({ h: t.target[hAxis.index], v: t.target[vAxis.index] });
      }
    });
  }, [client, hAxis.index, vAxis.index]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas, trail, target);
  }, [trail, target]);

  const here = trail[trail.length - 1];
  const planeLabel = `${hAxis.label} × ${vAxis.label}`;

  return (
    <figure
      className="drone-trajectory"
      role="img"
      aria-label={`Flight trajectory (${planeLabel})`}
    >
      <figcaption className="drone-trajectory-caption">
        <span className="drone-trajectory-title">{planeLabel}</span>
        {here
          ? ` · ${hAxis.short} ${here.h.toFixed(1)} m, ${vAxis.short} ${here.v.toFixed(1)} m · ${trail.length} samples`
          : " · start a run to plot the flight path."}
      </figcaption>
      <canvas
        ref={canvasRef}
        width={320}
        height={200}
        className="drone-trajectory-canvas"
      />
    </figure>
  );
}

/**
 * Example widget definition for the trajectory view. Registered into the shell
 * so the flight path is a first-class, AI-rearrangeable widget. The `plane`
 * parameter picks the projection (`xy` top-down, or `xz` / `yz` side views), so
 * several instances can show complementary views of the same flight.
 */
export const TRAJECTORY_VIEW: WidgetDefinition = {
  name: "TrajectoryView",
  description:
    "2D drone flight-path view drawn from drone/telemetry, with the current " +
    "setpoint and position marked. Configurable projection plane (xy/xz/yz).",
  channelPattern: "drone/telemetry",
  consumes: [],
  priority: 10,
  defaultRegion: "sidebar-left",
  parameters: {
    plane: { type: "string", default: "xy" },
  },
  factory: () => TrajectoryViewComponent as React.ComponentType,
};
