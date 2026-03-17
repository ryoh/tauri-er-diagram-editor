/**
 * QuickSearch — Ctrl+K で開くテーブル名検索オーバーレイ
 *
 * - テーブル名 / 論理名でインクリメンタルサーチ
 * - 選択すると setCenter でそのノードにズーム
 * - Escape または外側クリックで閉じる
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useDiagramStore } from "../store/useDiagramStore";
import type { TableData } from "../types/diagram";
import type { Node } from "@xyflow/react";

interface QuickSearchProps {
  onClose: () => void;
}

export default function QuickSearch({ onClose }: QuickSearchProps) {
  const [query, setQuery]         = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const { setCenter }             = useReactFlow();
  const nodes                     = useDiagramStore((s) => s.nodes) as Node<TableData>[];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = nodes.filter((n) => {
    const q = query.toLowerCase();
    return (
      n.data.name.toLowerCase().includes(q) ||
      n.data.logicalName.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const jumpTo = useCallback((node: Node<TableData>) => {
    setCenter(
      node.position.x + 110,
      node.position.y + 70,
      { zoom: 1.5, duration: 400 }
    );
    onClose();
  }, [setCenter, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (filtered[activeIdx]) jumpTo(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[480px] max-w-[90vw] bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="テーブル名を検索…"
            className="flex-1 text-sm text-gray-700 outline-none placeholder:text-gray-400"
          />
          <span className="text-[10px] text-gray-400 border border-gray-300 rounded px-1.5 py-0.5 font-mono">Esc</span>
        </div>

        {/* Results */}
        <ul className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-xs text-gray-400 text-center">該当するテーブルが見つかりません</li>
          ) : (
            filtered.map((node, i) => (
              <li key={node.id}>
                <button
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === activeIdx ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => jumpTo(node)}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        node.data.entityType === "resource" ? "#3b82f6" :
                        node.data.entityType === "event"    ? "#ef4444" : "#6b7280",
                    }}
                  />
                  <span className="text-sm font-medium text-gray-900">{node.data.name}</span>
                  {node.data.logicalName && (
                    <span className="text-xs text-gray-400">{node.data.logicalName}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-3 text-[10px] text-gray-400">
          <span><span className="font-mono border border-gray-300 rounded px-1">↑↓</span> 選択</span>
          <span><span className="font-mono border border-gray-300 rounded px-1">Enter</span> ジャンプ</span>
        </div>
      </div>
    </div>
  );
}
