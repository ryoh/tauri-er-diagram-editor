/**
 * MenuBar — Webブラウザ版用カスタムメニューバー
 * Tauri 環境では OS ネイティブメニューがあるため非表示。
 */
import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

type MenuBarItem =
  | { kind: "action"; label: string; action: () => void; shortcut?: string; disabled?: boolean }
  | { kind: "separator" }
  | { kind: "group"; label: string }
  | { kind: "submenu"; label: string; items: MenuBarItem[] };

// ---------------------------------------------------------------------------
// Recursive item renderer
// ---------------------------------------------------------------------------

interface ItemProps {
  item: MenuBarItem;
  depth?: number;
  onClose: () => void;
}

function RenderItem({ item, depth = 0, onClose }: ItemProps) {
  const [subOpen, setSubOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (item.kind === "separator") {
    return <hr className="my-0.5 border-gray-100" />;
  }
  if (item.kind === "group") {
    return (
      <div className="px-4 pt-2 pb-0.5 text-[9px] font-bold text-gray-400 uppercase tracking-widest select-none">
        {item.label}
      </div>
    );
  }
  if (item.kind === "submenu") {
    return (
      <div
        ref={ref}
        className="relative"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-left text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
          <span>{item.label}</span>
          <span className="text-gray-400 ml-4">▸</span>
        </button>
        {subOpen && (
          <div
            className={`absolute ${depth === 0 ? "left-full top-0" : "left-full top-0"} min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50`}
          >
            {item.items.map((child, i) => (
              <RenderItem key={i} item={child} depth={depth + 1} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    );
  }
  // action
  return (
    <button
      disabled={item.disabled}
      onClick={() => { onClose(); item.action(); }}
      className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-left
                 text-gray-700 hover:bg-blue-50 hover:text-blue-700
                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span className="ml-8 text-[10px] text-gray-400 font-mono">{item.shortcut}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Top-level dropdown
// ---------------------------------------------------------------------------

function DropdownMenu({ label, items }: { label: string; items: MenuBarItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
          open ? "bg-gray-200 text-gray-900" : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-0.5 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
          {items.map((item, i) => (
            <RenderItem key={i} item={item} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MenuBar props
// ---------------------------------------------------------------------------

interface MenuBarProps {
  onNew:         () => void;
  onOpen:        () => void;
  onSave:        () => void;
  onSaveAs:      () => void;
  onImportHcl:   () => void;
  onImportSql:   () => void;
  onExport:      (fmt: string) => void;
  onExportImage: (fmt: "png" | "svg") => void;
  onUndo:        () => void;
  onRedo:        () => void;
  canUndo:       boolean;
  canRedo:       boolean;
  onZoomIn:      () => void;
  onZoomOut:     () => void;
  onFitView:     () => void;
  onToggleGrid:  () => void;
  onLayout:      () => void;
  onSearch:      () => void;
  onSettings:    () => void;
}

export default function MenuBar(p: MenuBarProps) {
  const fileItems: MenuBarItem[] = [
    { kind: "action", label: "新規作成",              action: p.onNew,    shortcut: "Ctrl+N" },
    { kind: "separator" },
    { kind: "action", label: "開く…",                 action: p.onOpen,   shortcut: "Ctrl+O" },
    { kind: "separator" },
    { kind: "action", label: "保存",                  action: p.onSave,   shortcut: "Ctrl+S" },
    { kind: "action", label: "名前を付けて保存…",     action: p.onSaveAs, shortcut: "Ctrl+Shift+S" },
    { kind: "separator" },
    {
      kind: "submenu", label: "インポート",
      items: [
        { kind: "action", label: "Atlas HCL (.hcl)…", action: p.onImportHcl },
        { kind: "action", label: "SQL (.sql)…",        action: p.onImportSql },
      ],
    },
    {
      kind: "submenu", label: "エクスポート",
      items: [
        { kind: "action", label: "Atlas HCL…",    action: () => p.onExport("hcl") },
        { kind: "action", label: "SQL…",           action: () => p.onExport("sql") },
        { kind: "action", label: "HTML 定義書…",  action: () => p.onExport("html") },
        { kind: "separator" },
        { kind: "action", label: "画像 (PNG)…",   action: () => p.onExportImage("png") },
        { kind: "action", label: "画像 (SVG)…",   action: () => p.onExportImage("svg") },
      ],
    },
  ];

  const editItems: MenuBarItem[] = [
    { kind: "action", label: "元に戻す",   action: p.onUndo, shortcut: "Ctrl+Z",       disabled: !p.canUndo },
    { kind: "action", label: "やり直し",   action: p.onRedo, shortcut: "Ctrl+Shift+Z", disabled: !p.canRedo },
  ];

  const viewItems: MenuBarItem[] = [
    { kind: "action", label: "ズームイン",   action: p.onZoomIn,    shortcut: "Ctrl++" },
    { kind: "action", label: "ズームアウト", action: p.onZoomOut,   shortcut: "Ctrl+-" },
    { kind: "action", label: "全体を表示",   action: p.onFitView,   shortcut: "Ctrl+Shift+F" },
    { kind: "action", label: "グリッド切替", action: p.onToggleGrid },
    { kind: "separator" },
    { kind: "action", label: "自動配置",     action: p.onLayout,    shortcut: "Ctrl+L" },
    { kind: "action", label: "テーブル検索", action: p.onSearch,    shortcut: "Ctrl+K" },
  ];

  const settingsItems: MenuBarItem[] = [
    { kind: "action", label: "設定…", action: p.onSettings },
  ];

  return (
    <nav className="flex items-center border-b border-gray-200 bg-gray-50 px-1 shrink-0">
      <DropdownMenu label="ファイル" items={fileItems} />
      <DropdownMenu label="編集"     items={editItems} />
      <DropdownMenu label="表示"     items={viewItems} />
      <DropdownMenu label="設定"     items={settingsItems} />
    </nav>
  );
}
