/**
 * EditModal — テーブル定義の編集モーダル
 *
 * ノードをダブルクリックすると開く。
 * - テーブル名 / 論理名 / エンティティタイプの編集
 * - カラムの追加 / 削除 / 並び替え (name / dataType / isPk / notNull / comment)
 */
import { useState } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import type { TableData, Column, EntityType } from "../types/diagram";

interface EditModalProps {
  nodeId: string;
  data: TableData;
  onClose: () => void;
}

const ENTITY_OPTIONS: { value: EntityType; label: string; color: string }[] = [
  { value: "resource", label: "Resource", color: "#3b82f6" },
  { value: "event",    label: "Event",    color: "#ef4444" },
  { value: "normal",   label: "Normal",   color: "#6b7280" },
];

function newColumn(): Column {
  return { name: "", dataType: "", isPk: false, isFk: false, notNull: false, comment: "" };
}

export default function EditModal({ nodeId, data, onClose }: EditModalProps) {
  const updateTableData = useDiagramStore((s) => s.updateTableData);

  const [name,        setName]        = useState(data.name);
  const [logicalName, setLogicalName] = useState(data.logicalName);
  const [entityType,  setEntityType]  = useState<EntityType>(data.entityType);
  const [columns,     setColumns]     = useState<Column[]>(data.columns.map((c) => ({ ...c })));

  const handleSave = () => {
    updateTableData(nodeId, { name, logicalName, entityType, columns });
    onClose();
  };

  const updateCol = (idx: number, patch: Partial<Column>) => {
    setColumns((cols) => cols.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const removeCol = (idx: number) => {
    setColumns((cols) => cols.filter((_, i) => i !== idx));
  };

  const addCol = () => {
    setColumns((cols) => [...cols, newColumn()]);
  };

  const moveCol = (idx: number, dir: -1 | 1) => {
    setColumns((cols) => {
      const next = [...cols];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return cols;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">テーブル定義の編集</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Table metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">テーブル名</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">論理名</label>
              <input
                value={logicalName}
                onChange={(e) => setLogicalName(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Entity type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">エンティティタイプ</label>
            <div className="flex gap-2">
              {ENTITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEntityType(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                    entityType === opt.value
                      ? "text-white border-transparent"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                  style={entityType === opt.value ? { backgroundColor: opt.color, borderColor: opt.color } : {}}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Columns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">カラム</label>
              <button
                onClick={addCol}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                + カラムを追加
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Column header */}
              <div className="grid grid-cols-[1fr_1fr_auto_auto_1fr_auto] gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                <span>カラム名</span>
                <span>データ型</span>
                <span>PK</span>
                <span>NN</span>
                <span>コメント</span>
                <span />
              </div>

              {columns.length === 0 ? (
                <div className="px-3 py-4 text-xs text-gray-400 text-center">
                  カラムがありません
                </div>
              ) : (
                columns.map((col, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_1fr_auto_auto_1fr_auto] gap-2 items-center px-3 py-1.5 border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <input
                      value={col.name}
                      onChange={(e) => updateCol(i, { name: e.target.value })}
                      placeholder="column_name"
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                    />
                    <input
                      value={col.dataType}
                      onChange={(e) => updateCol(i, { dataType: e.target.value })}
                      placeholder="VARCHAR(255)"
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                    />
                    <input
                      type="checkbox"
                      checked={col.isPk}
                      onChange={(e) => updateCol(i, { isPk: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-500"
                    />
                    <input
                      type="checkbox"
                      checked={col.notNull}
                      onChange={(e) => updateCol(i, { notNull: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-500"
                    />
                    <input
                      value={col.comment}
                      onChange={(e) => updateCol(i, { comment: e.target.value })}
                      placeholder="説明"
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveCol(i, -1)}
                        disabled={i === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-0.5"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2l4 5H2z"/></svg>
                      </button>
                      <button
                        onClick={() => moveCol(i, 1)}
                        disabled={i === columns.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-0.5"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10L2 5h8z"/></svg>
                      </button>
                      <button
                        onClick={() => removeCol(i)}
                        className="text-red-400 hover:text-red-600 p-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" d="M2 2l8 8M10 2L2 10"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-semibold rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
