import { useState, useCallback, useEffect, useRef } from "react";
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
  useReactFlow,
} from "@xyflow/react";
import type { Node } from "@xyflow/react";
import { useDiagramStore } from "./store/useDiagramStore";
import { useFileSystem }       from "./hooks/useFileSystem";
import { useAutoLayout }       from "./hooks/useAutoLayout";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMenuEvents }       from "./hooks/useMenuEvents";
import { isTauri }             from "./utils/env";
import ExportMenu        from "./components/ExportMenu";
import TableNode         from "./components/nodes/TableNode";
import TNode             from "./components/nodes/TNode";
import IEEdge            from "./components/edges/IEEdge";
import TEdge             from "./components/edges/TEdge";
import QuickSearch       from "./components/QuickSearch";
import EditModal         from "./components/EditModal";
import MenuBar           from "./components/MenuBar";
import ContextMenu, { type ContextMenuState } from "./components/ContextMenu";
import StatusBar         from "./components/StatusBar";
import SettingsModal     from "./components/SettingsModal";
import type { TableData, EntityType } from "./types/diagram";

const nodeTypes: NodeTypes = {
  tableNode: TableNode as never,
  tNode:     TNode     as never,
};

const edgeTypes: EdgeTypes = {
  ieEdge: IEEdge as never,
  tEdge:  TEdge  as never,
};

// ---------------------------------------------------------------------------
// Inner component — needs useReactFlow via ReactFlowProvider context
// ---------------------------------------------------------------------------

function DiagramControls() {
  const {
    nodes, edges, mode, settings, currentFile,
    setMode, onNodesChange, onEdgesChange,
    addTable, removeTable, updateTableData, duplicateNode,
  } = useDiagramStore((s) => ({
    nodes:           s.nodes,
    edges:           s.edges,
    mode:            s.mode,
    settings:        s.settings,
    currentFile:     s.currentFile,
    setMode:         s.setMode,
    onNodesChange:   s.onNodesChange,
    onEdgesChange:   s.onEdgesChange,
    addTable:        s.addTable,
    removeTable:     s.removeTable,
    updateTableData: s.updateTableData,
    duplicateNode: (id: string) => {
      const store = useDiagramStore.getState();
      const src = store.nodes.find((n) => n.id === id);
      if (!src) return;
      const newId = `${src.data.name}_copy_${Date.now()}`;
      store.addTable(
        { ...src.data, id: newId, name: `${src.data.name}_copy` },
        { x: src.position.x + 40, y: src.position.y + 40 }
      );
    },
  }));

  const { importHcl, exportDiagram } = useFileSystem();
  const { runLayout } = useAutoLayout();
  const { zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [editTarget,   setEditTarget]   = useState<{ id: string; data: TableData } | null>(null);
  const [contextMenu,  setContextMenu]  = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const { undo, redo, pastStates, futureStates } = useDiagramStore.temporal.getState();
  const canUndo = pastStates.length  > 0;
  const canRedo = futureStates.length > 0;

  // ── Dark mode effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.darkMode]);

  // ── Menu event handlers (unified for OS menu + keyboard + web menu bar) ──

  const handleMenuAction = useCallback((id: string) => {
    switch (id) {
      case "open_hcl":      importHcl();           break;
      case "save_json":     exportDiagram("json"); break;
      case "export_sql":    exportDiagram("sql");  break;
      case "export_hcl":    exportDiagram("hcl");  break;
      case "export_html":   exportDiagram("html"); break;
      case "undo":          undo();                break;
      case "redo":          redo();                break;
      case "zoom_in":       zoomIn();              break;
      case "zoom_out":      zoomOut();             break;
      case "fit_view":      fitView({ padding: 0.15 }); break;
      case "toggle_grid":
        useDiagramStore.getState().updateSettings({ showGrid: !settings.showGrid });
        break;
      case "auto_layout":   runLayout();           break;
      case "quick_search":  setSearchOpen(true);   break;
      case "open_settings": setSettingsOpen(true); break;
    }
  }, [importHcl, exportDiagram, undo, redo, zoomIn, zoomOut, fitView, settings.showGrid, runLayout]);

  // Tauri OS menu bridge
  useMenuEvents(handleMenuAction);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave:    () => exportDiagram("json"),
    onLayout:  runLayout,
    onSearch:  () => setSearchOpen(true),
    onUndo:    undo,
    onRedo:    redo,
    onZoomIn:  zoomIn,
    onZoomOut: zoomOut,
    onFitView: () => fitView({ padding: 0.15 }),
  });

  // ── Node interactions ─────────────────────────────────────────────────────

  const handleNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    const n = node as Node<TableData>;
    setEditTarget({ id: n.id, data: n.data });
  }, []);

  const handleNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    const n = node as Node<TableData>;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: "node",
      nodeId: n.id,
      nodeData: n.data,
    });
  }, []);

  const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    const canvasPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: "canvas",
      canvasX: canvasPos.x,
      canvasY: canvasPos.y,
    });
  }, [screenToFlowPosition]);

  // ── Context menu actions ──────────────────────────────────────────────────

  const handleDuplicateNode = useCallback((id: string) => {
    duplicateNode(id);
  }, [duplicateNode]);

  const handleDeleteNode = useCallback((id: string) => {
    removeTable(id);
  }, [removeTable]);

  const handleChangeEntity = useCallback((id: string, type: EntityType) => {
    updateTableData(id, { entityType: type });
  }, [updateTableData]);

  const handleCopySql = useCallback((data: TableData) => {
    const cols = data.columns.map((c) => {
      const parts = [`  \`${c.name}\` ${c.dataType || "VARCHAR(255)"}`];
      if (c.notNull) parts.push("NOT NULL");
      return parts.join(" ");
    });
    const pkCols = data.columns.filter((c) => c.isPk).map((c) => `\`${c.name}\``);
    if (pkCols.length > 0) cols.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
    const sql = `CREATE TABLE \`${data.name}\` (\n${cols.join(",\n")}\n);`;
    navigator.clipboard.writeText(sql).catch(() => alert(sql));
  }, []);

  const handleAddTable = useCallback((x: number, y: number) => {
    const { settings: s } = useDiagramStore.getState();
    const id = `table_${Date.now()}`;
    addTable(
      {
        id,
        name: "new_table",
        logicalName: "",
        entityType: s.defaultEntityType,
        columns: [{ name: "id", dataType: "BIGINT", isPk: true, isFk: false, notNull: true, comment: "" }],
      },
      { x, y }
    );
  }, [addTable]);

  // ── Temporal store re-render trigger ─────────────────────────────────────
  // We need the component to re-render when past/future change
  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);
  useDiagramStore.temporal.subscribe((s) => {
    canUndoRef.current = s.pastStates.length  > 0;
    canRedoRef.current = s.futureStates.length > 0;
  });

  return (
    <div className={`w-screen h-screen flex flex-col ${settings.darkMode ? "bg-gray-900" : "bg-gray-100"}`}>
      {/* ── Web MenuBar (hidden in Tauri) ──────────────────────────────── */}
      {!isTauri() && (
        <MenuBar
          onImport={importHcl}
          onExport={(fmt) => exportDiagram(fmt as "sql" | "hcl" | "html" | "json")}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFitView={() => fitView({ padding: 0.15 })}
          onToggleGrid={() => useDiagramStore.getState().updateSettings({ showGrid: !settings.showGrid })}
          onLayout={runLayout}
          onSearch={() => setSearchOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* ── Toolbar ───────────────────────────────────────── */}
      <header className={`flex items-center gap-3 px-4 py-2 border-b shadow-sm shrink-0 ${
        settings.darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}>
        <span className={`font-bold text-sm tracking-wide ${settings.darkMode ? "text-gray-200" : "text-gray-700"}`}>
          ER Diagram Editor
        </span>

        {/* Mode toggle */}
        <div className="flex rounded overflow-hidden border border-gray-300 ml-2">
          <button
            onClick={() => setMode("ie")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              mode === "ie" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >IE 記法</button>
          <button
            onClick={() => setMode("t-shape")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              mode === "t-shape" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >T字形</button>
        </div>

        {/* Import / Export */}
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={importHcl}
            className="px-3 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
          >Atlas HCL を開く</button>
          <ExportMenu />
        </div>

        {/* Layout & Search */}
        <button
          onClick={runLayout}
          title="自動レイアウト (Ctrl+L)"
          className="px-3 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors ml-1"
        >自動配置</button>
        <button
          onClick={() => setSearchOpen(true)}
          title="テーブル検索 (Ctrl+K)"
          className="px-3 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
        >検索</button>

        {/* Undo / Redo */}
        <div className="flex rounded overflow-hidden border border-gray-300 ml-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            title="元に戻す (Ctrl+Z)"
            className="px-2.5 py-1 text-xs font-semibold bg-white text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >↩</button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            title="やり直し (Ctrl+Shift+Z)"
            className="px-2.5 py-1 text-xs font-semibold bg-white text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >↪</button>
        </div>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="設定"
          className="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Legend */}
        <div className="flex items-center gap-2 ml-auto text-xs text-gray-400">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> Resource
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500  ml-2" /> Event
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-500 ml-2" /> Normal
          <span className="ml-3 text-gray-300 hidden sm:inline">|</span>
          <span className="ml-1 text-gray-400 hidden sm:inline">ダブルクリックで編集</span>
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
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => setContextMenu(null)}
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
          {settings.showGrid && (
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
          )}
        </ReactFlow>
      </div>

      {/* ── Status Bar ─────────────────────────────────────── */}
      <StatusBar
        tableCount={nodes.length}
        relationCount={edges.length}
        currentFile={currentFile}
      />

      {/* ── Overlays ──────────────────────────────────────── */}
      {searchOpen && <QuickSearch onClose={() => setSearchOpen(false)} />}
      {editTarget  && (
        <EditModal
          nodeId={editTarget.id}
          data={editTarget.data}
          onClose={() => setEditTarget(null)}
        />
      )}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDuplicateNode={handleDuplicateNode}
          onDeleteNode={handleDeleteNode}
          onChangeEntity={handleChangeEntity}
          onCopySql={handleCopySql}
          onAddTable={handleAddTable}
          onLayout={runLayout}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — wrap with ReactFlowProvider
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <ReactFlowProvider>
      <DiagramControls />
    </ReactFlowProvider>
  );
}
