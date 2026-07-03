import type { Edge, Node } from "@xyflow/react";

import type { StepSpecPayload } from "./useReachy";

/**
 * Pure graph logic for the Choreography Flow widget.
 *
 * Kept free of React and React Flow *runtime* imports (types only) so the graph
 * behaviour can be unit-tested without a DOM. Steps are laid out left→right and
 * wired **into a chain** — each step connects to the next, and the last step
 * into the Robot node — so the choreography order is visible. Order is the
 * steps' horizontal position; the chain edges are *derived* from it
 * ({@link chainEdges}), so dragging a step to reorder re-links the chain.
 */

/** Inclusive lower bound for a step's amplitude factors. */
export const FACTOR_MIN = -1;
/** Inclusive upper bound for a step's amplitude factors. */
export const FACTOR_MAX = 1;

const ROBOT_ID = "robot";
const NODE_GAP_X = 320;

/** Data carried by a `step` node — one editable {@link StepSpecPayload}. */
export interface StepNodeData {
  /** Human-readable step name, e.g. `"tilt_right"`. */
  label: string;
  /** Multiplier applied to `roll_amplitude_deg`. Range −1…1. */
  rollFactor: number;
  /** Multiplier applied to `z_amplitude_mm`. Range −1…1. */
  zFactor: number;
  /** Multiplier applied to `antenna_amplitude`. Range −1…1. */
  antennaFactor: number;
}

/** Clamp a factor to the allowed −1…1 range. */
export function clampFactor(value: number): number {
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, value));
}

function stepId(index: number): string {
  return `step-${index}`;
}

function orderedSteps(nodes: Node[]): Node[] {
  return nodes
    .filter((n) => n.type === "step")
    .slice()
    .sort((a, b) => a.position.x - b.position.x);
}

/** Build the initial nodes from a sequence: step nodes left→right + a robot. */
export function buildInitialGraph(sequence: StepSpecPayload[]): Node[] {
  const nodes: Node[] = sequence.map((step, i) => ({
    id: stepId(i),
    type: "step",
    position: { x: i * NODE_GAP_X, y: 0 },
    data: {
      label: step.label,
      rollFactor: step.roll_factor ?? 0,
      zFactor: step.z_factor ?? 0,
      antennaFactor: step.antenna_factor ?? 0,
    },
  }));

  nodes.push({
    id: ROBOT_ID,
    type: "robot",
    position: { x: sequence.length * NODE_GAP_X, y: 0 },
    data: {},
  });

  return nodes;
}

/**
 * Derive the chain edges from the current node positions: each step (ordered
 * left→right) links to the next, and the last step links into the robot.
 */
export function chainEdges(nodes: Node[]): Edge[] {
  const steps = orderedSteps(nodes);
  return steps.map((step, i) => {
    const target = i < steps.length - 1 ? steps[i + 1].id : ROBOT_ID;
    return { id: `${step.id}->${target}`, source: step.id, target };
  });
}

/** Emit one {@link StepSpecPayload} per step node, ordered left→right by x. */
export function serializeSequence(nodes: Node[]): StepSpecPayload[] {
  return orderedSteps(nodes).map((n) => {
    const data = n.data as unknown as StepNodeData;
    return {
      label: data.label,
      roll_factor: data.rollFactor,
      z_factor: data.zFactor,
      antenna_factor: data.antennaFactor,
    };
  });
}

/** Append a new default step at the end of the chain (robot shifts right). */
export function addStep(nodes: Node[]): Node[] {
  const steps = nodes.filter((n) => n.type === "step");
  const usedIndexes = steps
    .map((n) => Number.parseInt(n.id.replace("step-", ""), 10))
    .filter((n) => !Number.isNaN(n));
  const nextIndex = (usedIndexes.length ? Math.max(...usedIndexes) : -1) + 1;

  const newNode: Node = {
    id: stepId(nextIndex),
    type: "step",
    position: { x: steps.length * NODE_GAP_X, y: 0 },
    data: { label: `step_${nextIndex}`, rollFactor: 0, zFactor: 0, antennaFactor: 0 },
  };

  // Push the robot one slot to the right so it stays at the tail of the chain.
  const shifted = nodes.map((n) =>
    n.type === "robot"
      ? { ...n, position: { ...n.position, x: (steps.length + 1) * NODE_GAP_X } }
      : n,
  );

  return [...shifted, newNode];
}

/** Remove a step node (the chain re-links via {@link chainEdges}). */
export function removeStep(nodes: Node[], id: string): Node[] {
  return nodes.filter((n) => n.id !== id);
}
