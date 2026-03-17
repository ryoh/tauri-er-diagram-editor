import { create } from "zustand";
import { temporal } from "zundo";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import type { TableData, RelationData, EntityType } from "../types/diagram";

export type DiagramMode = "ie" | "t-shape";

export interface CoreDiagram {
  tables: CoreTable[];
  relations: CoreRelation[];
}
interface CoreTable {
  id: string;
  name: string;
  logicalName: string;
  entityType: "resource" | "event" | "normal";
  columns: Array<{
    name: string; dataType: string;
    isPk: boolean; isFk: boolean; notNull: boolean; comment: string;
  }>;
  position: [number, number];
}
interface CoreRelation {
  id: string;
  fromTableId: string; fromColumn: string;
  toTableId: string;   toColumn: string;
  fromCardinality: string;
  toCardinality: string;
}

export interface DiagramSettings {
  showGrid: boolean;
  darkMode: boolean;
  defaultEntityType: EntityType;
  defaultMode: DiagramMode;
}

interface DiagramState {
  mode: DiagramMode;
  nodes: Node<TableData>[];
  edges: Edge<RelationData>[];
  settings: DiagramSettings;
  /** Full OS path in Tauri; filename in Web; null when unsaved */
  currentFilePath: string | null;
  /** True when there are unsaved changes */
  isDirty: boolean;

  setMode: (mode: DiagramMode) => void;
  setNodes: (nodes: Node<TableData>[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  addTable: (table: TableData, position?: { x: number; y: number }) => void;
  removeTable: (id: string) => void;
  updateTableData: (id: string, data: Partial<TableData>) => void;
  addRelation: (relation: RelationData) => void;
  removeRelation: (id: string) => void;
  importFromCore: (diagram: CoreDiagram) => void;
  /** Clear canvas — does NOT set isDirty */
  clearDiagram: () => void;
  updateSettings: (patch: Partial<DiagramSettings>) => void;
  setCurrentFilePath: (path: string | null) => void;
  setIsDirty: (v: boolean) => void;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_NODES: Node<TableData>[] = [
  {
    id: "users", type: "tableNode", position: { x: 80, y: 80 },
    data: {
      id: "users", name: "users", logicalName: "ユーザー", entityType: "resource",
      columns: [
        { name: "id",         dataType: "BIGINT",       isPk: true,  isFk: false, notNull: true,  comment: "Primary key" },
        { name: "name",       dataType: "VARCHAR(100)", isPk: false, isFk: false, notNull: true,  comment: "ユーザー名" },
        { name: "email",      dataType: "VARCHAR(255)", isPk: false, isFk: false, notNull: true,  comment: "" },
        { name: "created_at", dataType: "TIMESTAMP",    isPk: false, isFk: false, notNull: true,  comment: "" },
      ],
    },
  },
  {
    id: "orders", type: "tableNode", position: { x: 420, y: 80 },
    data: {
      id: "orders", name: "orders", logicalName: "注文", entityType: "event",
      columns: [
        { name: "id",         dataType: "BIGINT",    isPk: true,  isFk: false, notNull: true,  comment: "Primary key" },
        { name: "user_id",    dataType: "BIGINT",    isPk: false, isFk: true,  notNull: true,  comment: "FK: users.id" },
        { name: "total",      dataType: "DECIMAL",   isPk: false, isFk: false, notNull: true,  comment: "" },
        { name: "ordered_at", dataType: "TIMESTAMP", isPk: false, isFk: false, notNull: true,  comment: "" },
      ],
    },
  },
  {
    id: "products", type: "tableNode", position: { x: 420, y: 320 },
    data: {
      id: "products", name: "products", logicalName: "商品", entityType: "normal",
      columns: [
        { name: "id",    dataType: "BIGINT",       isPk: true,  isFk: false, notNull: true,  comment: "" },
        { name: "name",  dataType: "VARCHAR(200)", isPk: false, isFk: false, notNull: true,  comment: "商品名" },
        { name: "price", dataType: "DECIMAL",      isPk: false, isFk: false, notNull: false, comment: "" },
      ],
    },
  },
];

const SAMPLE_EDGES: Edge<RelationData>[] = [
  {
    id: "rel-users-orders", source: "users", target: "orders", type: "ieEdge",
    data: {
      id: "rel-users-orders",
      fromTableId: "users",   fromColumn: "id",
      toTableId:   "orders",  toColumn:   "user_id",
      fromCardinality: "one", toCardinality: "zeroOrMany",
    },
  },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDiagramStore = create<DiagramState>()(
  temporal(
    (set) => ({
      mode: "ie",
      nodes: SAMPLE_NODES,
      edges: SAMPLE_EDGES,
      settings: {
        showGrid: true,
        darkMode: false,
        defaultEntityType: "normal",
        defaultMode: "ie",
      },
      currentFilePath: null,
      isDirty: false,

      setMode: (mode) =>
        set((s) => ({
          mode,
          nodes: s.nodes.map((n) => ({ ...n, type: mode === "ie" ? "tableNode" : "tNode" })),
          edges: s.edges.map((e) => ({ ...e, type: mode === "ie" ? "ieEdge" : "tEdge" })),
        })),

      // setNodes used by auto-layout → marks dirty
      setNodes: (nodes) => set({ nodes, isDirty: true }),

      onNodesChange: (changes) =>
        set((s) => ({
          nodes: applyNodeChanges(changes, s.nodes as Node[]) as unknown as Node<TableData>[],
          isDirty: true,
        })),

      onEdgesChange: (changes) =>
        set((s) => ({
          edges: applyEdgeChanges(changes, s.edges as Edge[]) as unknown as Edge<RelationData>[],
          isDirty: true,
        })),

      addTable: (table, position = { x: 100, y: 100 }) =>
        set((s) => ({
          nodes: [
            ...s.nodes,
            { id: table.id, type: s.mode === "ie" ? "tableNode" : "tNode", position, data: table },
          ],
          isDirty: true,
        })),

      removeTable: (id) =>
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
          isDirty: true,
        })),

      updateTableData: (id, data) =>
        set((s) => ({
          nodes: s.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n),
          isDirty: true,
        })),

      addRelation: (relation) =>
        set((s) => ({
          edges: [
            ...s.edges,
            {
              id: relation.id,
              source: relation.fromTableId,
              target: relation.toTableId,
              type: s.mode === "ie" ? "ieEdge" : "tEdge",
              data: relation,
            },
          ],
          isDirty: true,
        })),

      removeRelation: (id) =>
        set((s) => ({ edges: s.edges.filter((e) => e.id !== id), isDirty: true })),

      importFromCore: (diagram) =>
        set((s) => {
          const nodeType = s.mode === "ie" ? "tableNode" : "tNode";
          const edgeType = s.mode === "ie" ? "ieEdge" : "tEdge";
          return {
            nodes: diagram.tables.map((t) => ({
              id: t.id, type: nodeType,
              position: { x: t.position[0], y: t.position[1] },
              data: {
                id: t.id, name: t.name, logicalName: t.logicalName,
                entityType: t.entityType, columns: t.columns,
              },
            })),
            edges: diagram.relations.map((r) => ({
              id: r.id, source: r.fromTableId, target: r.toTableId, type: edgeType,
              data: {
                id: r.id,
                fromTableId: r.fromTableId, fromColumn: r.fromColumn,
                toTableId: r.toTableId,     toColumn: r.toColumn,
                fromCardinality: r.fromCardinality as RelationData["fromCardinality"],
                toCardinality:   r.toCardinality   as RelationData["toCardinality"],
              },
            })),
            isDirty: false,
          };
        }),

      clearDiagram: () =>
        set({ nodes: [], edges: [], currentFilePath: null, isDirty: false }),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      setCurrentFilePath: (path) => set({ currentFilePath: path }),

      setIsDirty: (v) => set({ isDirty: v }),
    }),
    {
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
      limit: 50,
    }
  )
);
