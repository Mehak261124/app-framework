import { useEffect, useRef, useState } from "react";
import { toPayloadWithHeaders, useEventBusClient } from "@app-framework/core-ui";
import type { WidgetDefinition } from "@app-framework/core-ui";
import type { DroneTelemetry } from "./useDrone";

/** How many recent telemetry points the trajectory trail retains. */
const TRAIL_LENGTH = 400;

/** A single 2D point on the top-down (x, y) plane. */
interface Point {
  /** North position (metres). */
  x: number;
  /** East position (metres). */
  y: number;
}

/** Fit a set of points into a padded square, returning a world→pixel mapper. */
function makeProjector(
  points: Point[],
  target: Point | null,
  width: number,
  height: number,
): (p: Point) => Point {
  const all = target ? [...points, target] : points;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(-1, ...xs);
  const maxX = Math.max(1, ...xs);
  const minY = Math.min(-1, ...ys);
  const maxY = Math.max(1, ...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = 16;
  const scale = (Math.min(width, height) - 2 * pad) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return (p: Point) => ({
    // Centre the fitted path; flip y so North-up reads naturally.
    x: width / 2 + (p.x - cx) * scale,
    y: height / 2 - (p.y - cy) * scale,
  });
}

function draw(canvas: HTMLCanvasElement, points: Point[], target: Point | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const project = makeProjector(points, target, width, height);

  // Crosshair at the plane origin.
  const origin = project({ x: 0, y: 0 });
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

  // Current position (solid blue dot).
  if (points.length > 0) {
    const p = project(points[points.length - 1]);
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Widget body: a top-down (North/x × East/y) view of the drone's flight path,
 * drawn on a `<canvas>` from buffered ``drone/telemetry`` samples. The path
 * auto-scales to fit; the amber square is the current setpoint and the blue dot
 * the current position, so overshoot and oscillation are visible directly.
 *
 * A `<canvas>` has no semantic content, so the surrounding figure carries an
 * accessible label and a live text caption (current position + sample count)
 * that also serves as the test hook.
 *
 * @returns The trajectory canvas with an accessible caption.
 */
function TrajectoryViewComponent(): React.ReactElement {
  const client = useEventBusClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trail, setTrail] = useState<Point[]>([]);
  const [target, setTarget] = useState<Point | null>(null);

  useEffect(() => {
    setTrail([]);
    setTarget(null);
    return client.subscribe("drone/telemetry", (event) => {
      const t = toPayloadWithHeaders<DroneTelemetry>(event);
      if (!Array.isArray(t.position)) return;
      setTrail((prev) => {
        const next = [...prev, { x: t.position[0], y: t.position[1] }];
        return next.length > TRAIL_LENGTH
          ? next.slice(next.length - TRAIL_LENGTH)
          : next;
      });
      if (Array.isArray(t.target)) setTarget({ x: t.target[0], y: t.target[1] });
    });
  }, [client]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas, trail, target);
  }, [trail, target]);

  const here = trail[trail.length - 1];

  return (
    <figure
      className="drone-trajectory"
      role="img"
      aria-label="Top-down flight trajectory (North × East)"
    >
      <figcaption className="drone-trajectory-caption">
        {here
          ? `Position N ${here.x.toFixed(1)} m, E ${here.y.toFixed(1)} m · ${trail.length} samples`
          : "Trajectory — start a run to plot the flight path."}
      </figcaption>
      <canvas
        ref={canvasRef}
        width={320}
        height={220}
        className="drone-trajectory-canvas"
      />
    </figure>
  );
}

/**
 * Example widget definition for the trajectory view. Registered into the shell
 * so the flight path is a first-class, AI-rearrangeable widget.
 */
export const TRAJECTORY_VIEW: WidgetDefinition = {
  name: "TrajectoryView",
  description:
    "Top-down (x/y) drone flight-path view drawn from drone/telemetry, with " +
    "the current setpoint and position marked.",
  channelPattern: "drone/telemetry",
  consumes: [],
  priority: 10,
  defaultRegion: "sidebar-left",
  parameters: {},
  factory: () => TrajectoryViewComponent,
};
