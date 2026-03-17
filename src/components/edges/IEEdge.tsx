/**
 * IEEdge — 鳥の足記法 (IE Notation) カスタムエッジ
 *
 * 各端点のカーディナリティに対応するSVGシンボルを描画する。
 *
 * シンボル凡例 (source 側から見て終端に描画):
 *   one          ──|  (単線 + 1本縦棒)
 *   zeroOrOne    ──|○ (単線 + ○ + 縦棒)
 *   oneOrMany    ──<  (鳥の足 + 縦棒)
 *   zeroOrMany   ──<○ (鳥の足 + ○)
 */
import { memo } from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import type { RelationData, Cardinality } from "../../types/diagram";

type IEEdgeType = Edge<RelationData>;

// ---------------------------------------------------------------------------
// Marker geometry helpers
// ---------------------------------------------------------------------------

// Offset from the line endpoint where the marker starts
const MARKER_OFFSET = 18;
// Crow's foot spread half-angle (px in the perpendicular direction)
const FOOT_SPREAD = 7;

type Dir = "left" | "right" | "up" | "down";

/**
 * Rotate a relative [dx,dy] vector according to the edge direction at the
 * endpoint, so the marker always faces along the edge.
 */
function rotate(dx: number, dy: number, dir: Dir): [number, number] {
  switch (dir) {
    case "right": return [ dx,  dy];
    case "left":  return [-dx, -dy];
    case "down":  return [-dy,  dx];
    case "up":    return [ dy, -dx];
  }
}

function inferDir(sx: number, sy: number, tx: number, ty: number): { srcDir: Dir; tgtDir: Dir } {
  const dx = tx - sx;
  const dy = ty - sy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { srcDir: "right", tgtDir: "left" };
  }
  return { srcDir: "down", tgtDir: "up" };
}

interface MarkerProps {
  cx: number; // centre x of the handle point
  cy: number; // centre y of the handle point
  dir: Dir;
  cardinality: Cardinality;
  color: string;
}

function CardinalityMarker({ cx, cy, dir, cardinality, color }: MarkerProps) {
  const sw = 1.8; // stroke-width for all marker lines
  const parts: React.ReactNode[] = [];

  // Helper: translate relative coords to absolute
  const abs = (dx: number, dy: number): [number, number] => {
    const [rx, ry] = rotate(dx, dy, dir);
    return [cx + rx, cy + ry];
  };

  // --- Mandatory-line (|) always present at base offset ---
  {
    const [lx, ly] = abs(MARKER_OFFSET, 0);
    const [p1x, p1y] = abs(MARKER_OFFSET, -FOOT_SPREAD);
    const [p2x, p2y] = abs(MARKER_OFFSET,  FOOT_SPREAD);
    parts.push(
      <line key="bar" x1={p1x} y1={p1y} x2={p2x} y2={p2y}
        stroke={color} strokeWidth={sw} strokeLinecap="round" />
    );
    // short connecting line from handle to marker
    parts.push(
      <line key="stem" x1={cx} y1={cy} x2={lx} y2={ly}
        stroke={color} strokeWidth={sw} />
    );
  }

  if (cardinality === "one" || cardinality === "zeroOrOne") {
    // Second vertical bar (inner)
    const inner = MARKER_OFFSET + 5;
    const [p1x, p1y] = abs(inner, -FOOT_SPREAD);
    const [p2x, p2y] = abs(inner,  FOOT_SPREAD);
    parts.push(
      <line key="bar2" x1={p1x} y1={p1y} x2={p2x} y2={p2y}
        stroke={color} strokeWidth={sw} strokeLinecap="round" />
    );
  }

  if (cardinality === "zeroOrOne" || cardinality === "zeroOrMany") {
    // Circle (○) further out from the bar
    const circleDist = cardinality === "zeroOrOne" ? MARKER_OFFSET + 12 : MARKER_OFFSET + 10;
    const [ocx, ocy] = abs(circleDist, 0);
    parts.push(
      <circle key="circle" cx={ocx} cy={ocy} r={4}
        fill="white" stroke={color} strokeWidth={sw} />
    );
  }

  if (cardinality === "oneOrMany" || cardinality === "zeroOrMany") {
    // Crow's foot: two diagonal lines spreading from handle
    const tipDist = MARKER_OFFSET - 4;
    const [tipx, tipy] = abs(tipDist, 0);
    const [p1x, p1y] = abs(MARKER_OFFSET + 4, -FOOT_SPREAD);
    const [p2x, p2y] = abs(MARKER_OFFSET + 4,  FOOT_SPREAD);
    parts.push(
      <line key="foot1" x1={tipx} y1={tipy} x2={p1x} y2={p1y}
        stroke={color} strokeWidth={sw} strokeLinecap="round" />,
      <line key="foot2" x1={tipx} y1={tipy} x2={p2x} y2={p2y}
        stroke={color} strokeWidth={sw} strokeLinecap="round" />
    );
    // override stem to tip
    parts.push(
      <line key="stem2" x1={cx} y1={cy} x2={tipx} y2={tipy}
        stroke={color} strokeWidth={sw} />
    );
  }

  return <g>{parts}</g>;
}

// ---------------------------------------------------------------------------
// Edge component
// ---------------------------------------------------------------------------

const EDGE_COLOR = "#94a3b8";

function IEEdge({
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  selected,
}: EdgeProps<IEEdgeType>) {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 10,
  });

  const color = selected ? "#f59e0b" : EDGE_COLOR;

  const { srcDir, tgtDir } = inferDir(sourceX, sourceY, targetX, targetY);

  const fromCard: Cardinality = data?.fromCardinality ?? "one";
  const toCard:   Cardinality = data?.toCardinality   ?? "oneOrMany";

  return (
    <>
      <BaseEdge path={edgePath} style={{ stroke: color, strokeWidth: 1.5 }} />
      <CardinalityMarker
        cx={sourceX} cy={sourceY}
        dir={srcDir}
        cardinality={fromCard}
        color={color}
      />
      <CardinalityMarker
        cx={targetX} cy={targetY}
        dir={tgtDir}
        cardinality={toCard}
        color={color}
      />
    </>
  );
}

export default memo(IEEdge);
