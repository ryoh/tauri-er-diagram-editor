import { useState, useRef, useEffect } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import { useFileSystem, type ExportFormat } from "../hooks/useFileSystem";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface Warning { table: string; message: string }

function validateDiagram(nodes: ReturnType<typeof useDiagramStore.getState>["nodes"]): Warning[] {
  const warnings: Warning[] = [];
  for (const node of nodes) {
    const t = node.data;
    if (t.columns.length === 0) {
      warnings.push({ table: t.name, message: "カラムが 0 件です" });
    }
    for (const col of t.columns) {
      if (!col.dataType.trim()) {
        warnings.push({ table: t.name, message: `"${col.name}" のデータ型が未入力` });
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

const ITEMS: { format: ExportFormat; label: string; ext: string; desc: string }[] = [
  { format: "sql",  label: "SQL",              ext: ".sql",  desc: "CREATE TABLE 文" },
  { format: "hcl",  label: "Atlas HCL",        ext: ".hcl",  desc: "Atlas スキーマ形式" },
  { format: "html", label: "HTML 定義書",       ext: ".html", desc: "検索付き静的 HTML" },
  { format: "json", label: "ERD JSON",          ext: ".json", desc: "エディタ保存形式" },
];

// ---------------------------------------------------------------------------
// Validation dialog
// ---------------------------------------------------------------------------

function ValidationDialog({
  warnings,
  onContinue,
  onCancel,
}: {
  warnings: Warning[];
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-[420px] max-w-[90vw] overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-4">
          <p className="font-semibold text-amber-800 text-sm">エクスポート前の確認</p>
          <p className="text-amber-600 text-xs mt-0.5">
            以下の項目が未入力です。このままエクスポートを続けますか？
          </p>
        </div>
        <ul className="px-5 py-3 max-h-48 overflow-y-auto divide-y divide-gray-100">
          {warnings.map((w, i) => (
            <li key={i} className="py-1.5 text-xs text-gray-700">
              <span className="font-medium text-gray-900">{w.table}</span>
              <span className="text-gray-400 mx-1">—</span>
              {w.message}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onContinue}
            className="px-4 py-1.5 text-xs font-semibold rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            このまま続ける
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExportMenu component
// ---------------------------------------------------------------------------

export default function ExportMenu() {
  const [open, setOpen]           = useState(false);
  const [pending, setPending]     = useState<ExportFormat | null>(null);
  const [warnings, setWarnings]   = useState<Warning[]>([]);
  const menuRef                   = useRef<HTMLDivElement>(null);

  const nodes          = useDiagramStore((s) => s.nodes);
  const { exportDiagram } = useFileSystem();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (format: ExportFormat) => {
    setOpen(false);
    const ws = validateDiagram(nodes);
    if (ws.length > 0) {
      setWarnings(ws);
      setPending(format);
    } else {
      exportDiagram(format);
    }
  };

  const handleContinue = () => {
    if (pending) exportDiagram(pending);
    setPending(null);
    setWarnings([]);
  };

  const handleCancel = () => {
    setPending(null);
    setWarnings([]);
  };

  return (
    <>
      {/* Dropdown trigger */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
        >
          エクスポート
          <svg className="w-3 h-3 text-gray-500" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 8L1 3h10L6 8z"/>
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-40">
            {ITEMS.map((item) => (
              <button
                key={item.format}
                onClick={() => handleSelect(item.format)}
                className="w-full flex items-start gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold text-gray-900">{item.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{item.ext}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Validation dialog */}
      {warnings.length > 0 && (
        <ValidationDialog
          warnings={warnings}
          onContinue={handleContinue}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
