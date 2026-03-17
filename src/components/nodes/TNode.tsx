/**
 * TNode — T字形ER図ノード
 *
 * レイアウト:
 *   ┌─────────────────────────────────────┐
 *   │  論理名 (logicalName)   [R / E badge]│  ← header bar
 *   ├──────────────┬──────────────────────┤
 *   │  Identifier  ║  Attributes          │  ← body (two columns + center divider)
 *   │  (PK columns)║  (non-PK columns)    │
 *   └──────────────┴──────────────────────┘
 *
 * 中央の太い垂直線が T字の軸。左: 識別子、右: 属性。
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { TableData, Column } from "../../types/diagram";
import { ENTITY_COLORS, ENTITY_LABEL } from "../../types/diagram";

type TNodeType = Node<TableData>;

function ColRow({ col }: { col: Column }) {
  return (
    <div className="flex items-baseline gap-1.5 px-2 py-1 text-xs hover:bg-black/5 rounded">
      <span className="font-medium text-gray-800 leading-none">{col.name}</span>
      <span className="text-gray-400 leading-none truncate">{col.dataType}</span>
    </div>
  );
}

function TNode({ data, selected }: NodeProps<TNodeType>) {
  const theme = ENTITY_COLORS[data.entityType];
  const label = ENTITY_LABEL[data.entityType];

  const pkCols  = data.columns.filter((c) => c.isPk);
  const nonPkCols = data.columns.filter((c) => !c.isPk);

  // Height is determined by whichever side is taller; minimum 3 rows
  const rowCount = Math.max(pkCols.length, nonPkCols.length, 2);

  return (
    <div
      className="rounded-lg overflow-hidden shadow-md bg-white"
      style={{
        border: `2px solid ${selected ? "#f59e0b" : theme.border}`,
        minWidth: 260,
      }}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ backgroundColor: theme.header }}
      >
        <div className="flex flex-col leading-none">
          <span className="text-white font-bold text-sm">{data.name}</span>
          {data.logicalName && (
            <span className="text-white/70 text-xs mt-0.5">{data.logicalName}</span>
          )}
        </div>
        {label && (
          <span className="text-base font-black text-white/90">{label}</span>
        )}
      </div>

      {/* ── Sub-header labels ─────────────────────────────── */}
      <div className="flex text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border-b border-gray-200">
        <div className="flex-1 px-2 py-0.5 text-center">Identifier</div>
        {/* center divider label area */}
        <div
          className="shrink-0 py-0.5 text-center"
          style={{ width: 4, backgroundColor: theme.header }}
        />
        <div className="flex-1 px-2 py-0.5 text-center">Attributes</div>
      </div>

      {/* ── Body: Identifier | ║ | Attributes ────────────── */}
      <div className="flex" style={{ minHeight: rowCount * 28 }}>
        {/* Left — Identifier (PK) */}
        <div className="flex-1 py-1">
          {pkCols.length > 0 ? (
            pkCols.map((col) => <ColRow key={col.name} col={col} />)
          ) : (
            <div className="px-2 py-1 text-xs text-gray-300 italic">—</div>
          )}
        </div>

        {/* Center divider ─ the T-shape's vertical bar */}
        <div
          className="shrink-0 self-stretch"
          style={{ width: 4, backgroundColor: theme.header }}
        />

        {/* Right — Attributes (non-PK) */}
        <div className="flex-1 py-1">
          {nonPkCols.length > 0 ? (
            nonPkCols.map((col) => <ColRow key={col.name} col={col} />)
          ) : (
            <div className="px-2 py-1 text-xs text-gray-300 italic">—</div>
          )}
        </div>
      </div>

      {/* ── React Flow handles ────────────────────────────── */}
      <Handle type="target" position={Position.Left}  className="!bg-gray-400" />
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  );
}

export default memo(TNode);
