import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TableData } from "../../types/diagram";
import { ENTITY_COLORS, ENTITY_LABEL } from "../../types/diagram";
import type { Node } from "@xyflow/react";

type TableNodeType = Node<TableData>;

function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const theme = ENTITY_COLORS[data.entityType];
  const label = ENTITY_LABEL[data.entityType];

  return (
    <div
      className="rounded-lg overflow-hidden shadow-md min-w-[200px] bg-white"
      style={{
        border: `2px solid ${selected ? "#f59e0b" : theme.border}`,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ backgroundColor: theme.header }}
      >
        <div className="flex flex-col leading-tight">
          <span className="text-white font-bold text-sm">{data.name}</span>
          {data.logicalName && (
            <span className="text-white/70 text-xs">{data.logicalName}</span>
          )}
        </div>
        {label && (
          <span
            className="text-xs font-black rounded px-1 py-0.5 bg-white/20 text-white"
          >
            {label}
          </span>
        )}
      </div>

      {/* Column list */}
      <div className="divide-y divide-gray-100">
        {data.columns.map((col) => (
          <div
            key={col.name}
            className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            {/* PK / FK badge */}
            <span className="w-6 shrink-0 text-center">
              {col.isPk && (
                <span className="text-amber-500 font-bold">PK</span>
              )}
              {col.isFk && !col.isPk && (
                <span className="text-sky-500 font-bold">FK</span>
              )}
            </span>
            <span className={`font-medium grow ${col.isPk ? "text-amber-700" : "text-gray-800"}`}>
              {col.name}
            </span>
            <span className="text-gray-400 shrink-0">{col.dataType}</span>
            {col.notNull && (
              <span className="text-gray-400 shrink-0" title="NOT NULL">●</span>
            )}
          </div>
        ))}
      </div>

      {/* React Flow handles */}
      <Handle type="target" position={Position.Left}  className="!bg-gray-400" />
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  );
}

export default memo(TableNode);
