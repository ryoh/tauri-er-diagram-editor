import { useState, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useDiagramStore } from "./store/useDiagramStore";
import { useFileSystem }   from "./hooks/useFileSystem";
import { useAutoLayout }   from "./hooks/useAutoLayout";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import ExportMenu          from "./components/ExportMenu";
import TableNode from "./components/nodes/TableNode";
import TNode     from "./components/nodes/TNode";
import IEEdge    from "./components/edges/IEEdge";
import TEdge     from "./components/edges/TEdge";
import QuickSearch from "./components/QuickSearch";
import EditModal   from "./components/EditModal";
import type { TableData } from "./types/diagram";
import type { Node } from "@xyflow/react";

const nodeTypes: NodeTypes = {
  tableNode: TableNode as never,
  tNode:     TNode     as never,
};

const edgeTypes: EdgeTypes = {
  ieEdge: IEEdge as never,
  tEdge:  TEdge  as never,
};

// ---------------------------------------------------------------------------
// Inner component (needs useReactFlow via context)
// ---------------------------------------------------------------------------

function DiagramControls() {
  const { nodes, edges, mode, setMode, onNodesChange, onEdgesChange } =
    useDiagramStore();
  const { importHcl, exportDiagram } = useFileSystem();
  const { runLayout } = useAutoLayout();

  const [searchOpen, setSearchOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; data: TableData } | null>(null);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave:   () => exportDiagram("json"),
    onLayout: runLayout,
    onSearch: () => setSearchOpen(true),
  });

  // Double-click on node → open EditModal
  const handleNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    const n = node as Node<TableData>;
    setEditTarget({ id: n.id, data: n.data });
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-gray-100">
      {/* ── Toolbar ───────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <span className="font-bold text-gray-700 text-sm tracking-wide">ER Diagram Editor</span>

        {/* Mode toggle */}
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

        {/* Import / Export */}
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={importHcl}
            className="px-3 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Atlas HCL を開く
          </button>
          <ExportMenu />
        </div>

        {/* Auto-layout */}
        <button
          onClick={runLayout}
          title="自動レイアウト (Ctrl+L)"
          className="px-3 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors ml-1"
        >
          自動配置
        </button>

        {/* Quick search */}
        <button
          onClick={() => setSearchOpen(true)}
          title="テーブル検索 (Ctrl+K)"
          className="px-3 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
        >
          検索
        </button>

        {/* Legend */}
        <div className="flex items-center gap-2 ml-auto text-xs text-gray-400">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> Resource (R)
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500  ml-2" /> Event (E)
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-500 ml-2" /> Normal
          <span className="ml-3 text-gray-300">|</span>
          <span className="ml-1 text-gray-400">ダブルクリックで編集</span>
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
          onNodeDoubleClick={handleNodeDoubleClick}
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

      {/* ── Overlays ──────────────────────────────────────── */}
      {searchOpen && (
        <QuickSearch onClose={() => setSearchOpen(false)} />
      )}
      {editTarget && (
        <EditModal
          nodeId={editTarget.id}
          data={editTarget.data}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component — wraps with ReactFlowProvider so inner components can use
// useReactFlow() (setCenter, fitView, etc.)
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <ReactFlowProvider>
      <DiagramControls />
    </ReactFlowProvider>
  );
}
