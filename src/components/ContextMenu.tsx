/**
 * ContextMenu — 右クリックコンテキストメニュー
 *
 * type="node"   : コピー / 削除 / EntityType変更 / SQLとしてコピー
 * type="canvas" : テーブル追加 / 自動レイアウト
 */
import { useEffect, useRef } from "react";
import type { EntityType, TableData } from "../types/diagram";

export interface ContextMenuState {
  x: number;
  y: number;
  type: "node" | "canvas";
  nodeId?: string;
  nodeData?: TableData;
  /** Canvas position for "add table" */
  canvasX?: number;
  canvasY?: number;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onDuplicateNode:  (id: string) => void;
  onDeleteNode:     (id: string) => void;
  onChangeEntity:   (id: string, type: EntityType) => void;
  onCopySql:        (data: TableData) => void;
  onAddTable:       (x: number, y: number) => void;
  onLayout:         () => void;
}

interface ItemProps {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: string;
}

function Item({ label, onClick, danger, icon }: ItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {icon && <span className="w-3.5 text-center opacity-60">{icon}</span>}
      {label}
    </button>
  );
}

function Separator() {
  return <hr className="my-0.5 border-gray-100" />;
}

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "resource", label: "Resource (R)" },
  { value: "event",    label: "Event (E)" },
  { value: "normal",   label: "Normal" },
];

export default function ContextMenu({
  menu, onClose,
  onDuplicateNode, onDeleteNode, onChangeEntity, onCopySql,
  onAddTable, onLayout,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const wrap = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.type === "node" && menu.nodeId && menu.nodeData ? (
        <>
          <Item icon="⧉" label="複製"            onClick={wrap(() => onDuplicateNode(menu.nodeId!))} />
          <Separator />
          <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            EntityType
          </div>
          {ENTITY_OPTIONS.map((opt) => (
            <Item
              key={opt.value}
              label={opt.label}
              onClick={wrap(() => onChangeEntity(menu.nodeId!, opt.value))}
            />
          ))}
          <Separator />
          <Item icon="📋" label="SQL としてコピー" onClick={wrap(() => onCopySql(menu.nodeData!))} />
          <Separator />
          <Item icon="🗑" label="削除" danger onClick={wrap(() => onDeleteNode(menu.nodeId!))} />
        </>
      ) : (
        <>
          <Item icon="＋" label="テーブルを追加"   onClick={wrap(() => onAddTable(menu.canvasX ?? 0, menu.canvasY ?? 0))} />
          <Item icon="⊞" label="自動レイアウト実行" onClick={wrap(() => onLayout())} />
        </>
      )}
    </div>
  );
}
