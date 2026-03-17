// TypeScript types mirroring core/ Rust structs (camelCase via serde)

export type EntityType = "resource" | "event" | "normal";

export type Cardinality = "one" | "zeroOrOne" | "oneOrMany" | "zeroOrMany";

export interface Column {
  name: string;
  dataType: string;
  isPk: boolean;
  isFk: boolean;
  notNull: boolean;
  comment: string;
  [key: string]: unknown;
}

// Extends Record<string, unknown> as required by @xyflow/react v12
export interface TableData extends Record<string, unknown> {
  id: string;
  name: string;
  logicalName: string;
  entityType: EntityType;
  columns: Column[];
}

export interface RelationData extends Record<string, unknown> {
  id: string;
  fromTableId: string;
  fromColumn: string;
  toTableId: string;
  toColumn: string;
  fromCardinality: Cardinality;
  toCardinality: Cardinality;
}

// EntityType → theme color
export const ENTITY_COLORS: Record<EntityType, { header: string; border: string; badge: string }> = {
  resource: { header: "#3b82f6", border: "#2563eb", badge: "bg-blue-100 text-blue-800" },
  event:    { header: "#ef4444", border: "#dc2626", badge: "bg-red-100 text-red-800"  },
  normal:   { header: "#6b7280", border: "#4b5563", badge: "bg-gray-100 text-gray-700" },
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  resource: "R",
  event:    "E",
  normal:   "",
};
