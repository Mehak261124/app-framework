import { describe, expect, it } from "vitest";

import {
  addStep,
  buildInitialGraph,
  chainEdges,
  clampFactor,
  removeStep,
  serializeSequence,
} from "./choreography";
import type { StepSpecPayload } from "./useReachy";

const SEQ: StepSpecPayload[] = [
  { label: "tilt_right", roll_factor: 1.0 },
  { label: "tilt_left", roll_factor: -1.0 },
];

describe("clampFactor", () => {
  it("clamps above 1 to 1", () => {
    expect(clampFactor(2)).toBe(1);
  });

  it("clamps below -1 to -1", () => {
    expect(clampFactor(-5)).toBe(-1);
  });

  it("leaves in-range values untouched", () => {
    expect(clampFactor(0.5)).toBe(0.5);
  });
});

describe("buildInitialGraph", () => {
  it("creates a step node per entry plus a single robot, no start node", () => {
    const nodes = buildInitialGraph(SEQ);
    expect(nodes.filter((n) => n.type === "step")).toHaveLength(2);
    expect(nodes.filter((n) => n.type === "robot")).toHaveLength(1);
    expect(nodes.filter((n) => n.type === "start")).toHaveLength(0);
  });
});

describe("chainEdges", () => {
  it("links each step to the next and the last step into the robot", () => {
    const edges = chainEdges(buildInitialGraph(SEQ));
    expect(edges).toEqual([
      { id: "step-0->step-1", source: "step-0", target: "step-1" },
      { id: "step-1->robot", source: "step-1", target: "robot" },
    ]);
  });

  it("re-links the chain in left→right order after a reorder", () => {
    // Swap the two steps' x positions.
    const nodes = buildInitialGraph(SEQ).map((n) =>
      n.id === "step-0"
        ? { ...n, position: { ...n.position, x: 999 } }
        : n.id === "step-1"
          ? { ...n, position: { ...n.position, x: -999 } }
          : n,
    );
    const edges = chainEdges(nodes);
    expect(edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      "step-1->step-0",
      "step-0->robot",
    ]);
  });
});

describe("serializeSequence", () => {
  it("returns steps left→right with factors defaulted to 0", () => {
    expect(serializeSequence(buildInitialGraph(SEQ))).toEqual([
      { label: "tilt_right", roll_factor: 1, z_factor: 0, antenna_factor: 0 },
      { label: "tilt_left", roll_factor: -1, z_factor: 0, antenna_factor: 0 },
    ]);
  });
});

describe("addStep", () => {
  it("appends a step at the end of the chain and grows the sequence by one", () => {
    const nodes = addStep(buildInitialGraph(SEQ));
    expect(nodes.filter((n) => n.type === "step")).toHaveLength(3);
    expect(serializeSequence(nodes)).toHaveLength(3);
    // New step is the last one before the robot in the chain.
    const edges = chainEdges(nodes);
    expect(edges.at(-1)?.target).toBe("robot");
  });
});

describe("removeStep", () => {
  it("removes the step; the chain re-links via chainEdges", () => {
    const nodes = removeStep(buildInitialGraph(SEQ), "step-0");
    expect(nodes.filter((n) => n.type === "step")).toHaveLength(1);
    expect(serializeSequence(nodes)).toEqual([
      { label: "tilt_left", roll_factor: -1, z_factor: 0, antenna_factor: 0 },
    ]);
    expect(chainEdges(nodes)).toEqual([
      { id: "step-1->robot", source: "step-1", target: "robot" },
    ]);
  });
});
