import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import type { TableData, RelationData } from "../types/diagram";

export type DiagramMode = "ie" | "t-shape";

interface DiagramState {
  mode: DiagramMode;
  nodes: Node<TableData>[];
  edges: Edge<RelationData>[];

  setMode: (mode: DiagramMode) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  addTable: (table: TableData, position?: { x: number; y: number }) => void;
  removeTable: (id: string) => void;
  addRelation: (relation: RelationData) => void;
  removeRelation: (id: string) => void;
}

// Sample data for development
const SAMPLE_NODES: Node<TableData>[] = [
  {
    id: "users",
    type: "tableNode",
    position: { x: 80, y: 80 },
    data: {
      id: "users",
      name: "users",
      logicalName: "ユーザー",
      entityType: "resource",
      columns: [
        { name: "id",         dataType: "BIGINT",       isPk: true,  isFk: false, notNull: true,  comment: "Primary key" },
        { name: "name",       dataType: "VARCHAR(100)", isPk: false, isFk: false, notNull: true,  comment: "ユーザー名" },
        { name: "email",      dataType: "VARCHAR(255)", isPk: false, isFk: false, notNull: true,  comment: "" },
        { name: "created_at", dataType: "TIMESTAMP",    isPk: false, isFk: false, notNull: true,  comment: "" },
      ],
    },
  },
  {
    id: "orders",
    type: "tableNode",
    position: { x: 420, y: 80 },
    data: {
      id: "orders",
      name: "orders",
      logicalName: "注文",
      entityType: "event",
      columns: [
        { name: "id",         dataType: "BIGINT",    isPk: true,  isFk: false, notNull: true,  comment: "Primary key" },
        { name: "user_id",    dataType: "BIGINT",    isPk: false, isFk: true,  notNull: true,  comment: "FK: users.id" },
        { name: "total",      dataType: "DECIMAL",   isPk: false, isFk: false, notNull: true,  comment: "" },
        { name: "ordered_at", dataType: "TIMESTAMP", isPk: false, isFk: false, notNull: true,  comment: "" },
      ],
    },
  },
  {
    id: "products",
    type: "tableNode",
    position: { x: 420, y: 320 },
    data: {
      id: "products",
      name: "products",
      logicalName: "商品",
      entityType: "normal",
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
    id: "rel-users-orders",
    source: "users",
    target: "orders",
    type: "ieEdge",
    data: {
      id: "rel-users-orders",
      fromTableId: "users",
      fromColumn: "id",
      toTableId: "orders",
      toColumn: "user_id",
      fromCardinality: "one",
      toCardinality: "zeroOrMany",
    },
  },
];

export const useDiagramStore = create<DiagramState>((set) => ({
  mode: "ie",
  nodes: SAMPLE_NODES,
  edges: SAMPLE_EDGES,

  setMode: (mode) =>
    set((s) => ({
      mode,
      nodes: s.nodes.map((n) => ({
        ...n,
        type: mode === "ie" ? "tableNode" : "tNode",
      })),
    })),

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes as Node[]) as unknown as Node<TableData>[],
    })),

  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges as Edge[]) as unknown as Edge<RelationData>[],
    })),

  addTable: (table, position = { x: 100, y: 100 }) =>
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id: table.id,
          type: s.mode === "ie" ? "tableNode" : "tNode",
          position,
          data: table,
        },
      ],
    })),

  removeTable: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    })),

  addRelation: (relation) =>
    set((s) => ({
      edges: [
        ...s.edges,
        {
          id: relation.id,
          source: relation.fromTableId,
          target: relation.toTableId,
          type: "ieEdge",
          data: relation,
        },
      ],
    })),

  removeRelation: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
}));
