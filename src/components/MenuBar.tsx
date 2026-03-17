/**
 * MenuBar — Webブラウザ版用カスタムメニューバー
 *
 * Tauri 環境では OS ネイティブメニューがあるため非表示。
 * ファイル / 編集 / 表示 / 設定 の4メニュー。
 */
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";

interface MenuBarItem {
  label?: string;
  action?: () => void;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

interface MenuBarMenuProps {
  label: string;
  items: MenuBarItem[];
}

function DropdownMenu({ label, items }: MenuBarMenuProps) {
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
        className={`px-3 py-1 text-xs font-medium transition-colors rounded ${
          open ? "bg-gray-200 text-gray-900" : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-0.5 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50 py-1">
          {items.map((item, i) =>
            item.separator ? (
              <hr key={i} className="my-1 border-gray-100" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.action?.();
                }}
                className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-left
                           text-gray-700 hover:bg-blue-50 hover:text-blue-700
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="ml-8 text-[10px] text-gray-400 font-mono">{item.shortcut}</span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface MenuBarProps {
  onImport:      () => void;
  onExport:      (fmt: string) => void;
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

export default function MenuBar({
  onImport, onExport,
  onUndo, onRedo, canUndo, canRedo,
  onZoomIn, onZoomOut, onFitView, onToggleGrid,
  onLayout, onSearch, onSettings,
}: MenuBarProps): ReactNode {
  const fileItems: MenuBarItem[] = [
    { label: "Atlas HCL を開く…", action: onImport,              shortcut: "Ctrl+O" },
    { separator: true },
    { label: "JSON として保存",    action: () => onExport("json"), shortcut: "Ctrl+S" },
    { label: "SQL をエクスポート…", action: () => onExport("sql") },
    { label: "Atlas HCL をエクスポート…", action: () => onExport("hcl") },
    { label: "HTML 定義書をエクスポート…", action: () => onExport("html") },
  ];

  const editItems: MenuBarItem[] = [
    { label: "元に戻す",   action: onUndo, shortcut: "Ctrl+Z",       disabled: !canUndo },
    { label: "やり直し",   action: onRedo, shortcut: "Ctrl+Shift+Z", disabled: !canRedo },
  ];

  const viewItems: MenuBarItem[] = [
    { label: "ズームイン",    action: onZoomIn,  shortcut: "Ctrl++" },
    { label: "ズームアウト",  action: onZoomOut, shortcut: "Ctrl+-" },
    { label: "全体を表示",    action: onFitView, shortcut: "Ctrl+Shift+F" },
    { label: "グリッド切替",  action: onToggleGrid },
    { separator: true },
    { label: "自動配置",      action: onLayout,  shortcut: "Ctrl+L" },
    { label: "テーブル検索",  action: onSearch,  shortcut: "Ctrl+K" },
  ];

  const settingsItems: MenuBarItem[] = [
    { label: "設定…", action: onSettings },
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
