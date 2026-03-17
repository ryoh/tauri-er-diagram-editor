import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { useDiagramStore } from "./store/useDiagramStore";
import TableNode from "./components/nodes/TableNode";
import TNode     from "./components/nodes/TNode";
import IEEdge    from "./components/edges/IEEdge";

const nodeTypes: NodeTypes = {
  tableNode: TableNode as never,
  tNode:     TNode     as never,
};

const edgeTypes: EdgeTypes = {
  ieEdge: IEEdge as never,
};

export default function App() {
  const { nodes, edges, mode, setMode, onNodesChange, onEdgesChange } =
    useDiagramStore();

  return (
    <div className="w-screen h-screen flex flex-col bg-gray-100">
      {/* ── Toolbar ───────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <span className="font-bold text-gray-700 text-sm tracking-wide">ER Diagram Editor</span>

        <div className="flex rounded overflow-hidden border border-gray-300 ml-2">
          <button
            onClick={() => setMode("ie")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              mode === "ie"
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            IE 記法
          </button>
          <button
            onClick={() => setMode("t-shape")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              mode === "t-shape"
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            T字形
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto text-xs text-gray-400">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> Resource (R)
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500  ml-2" /> Event (E)
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-500 ml-2" /> Normal
        </div>
      </header>

      {/* ── Canvas ────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const et = (n.data as { entityType?: string })?.entityType;
              if (et === "resource") return "#3b82f6";
              if (et === "event")    return "#ef4444";
              return "#6b7280";
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
        </ReactFlow>
      </div>
    </div>
  );
}
