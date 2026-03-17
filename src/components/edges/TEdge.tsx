/**
 * TEdge — T字形モード用エッジ
 *
 * getStepPath を使ってオルソゴナルな折れ線を描画する。
 * カーディナリティマーカーは表示しない（シンプルな矢印線）。
 */
import { memo } from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import type { RelationData } from "../../types/diagram";

type TEdgeType = Edge<RelationData>;

const EDGE_COLOR = "#94a3b8";

function TEdge({
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  selected,
}: EdgeProps<TEdgeType>) {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 0,
  });

  const color = selected ? "#f59e0b" : EDGE_COLOR;

  return (
    <BaseEdge
      path={edgePath}
      style={{ stroke: color, strokeWidth: 1.5 }}
      markerEnd={`url(#arrow-${selected ? "selected" : "default"})`}
    />
  );
}

export default memo(TEdge);
