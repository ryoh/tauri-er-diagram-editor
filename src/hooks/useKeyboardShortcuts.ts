/**
 * useKeyboardShortcuts
 *
 * Ctrl+N         → 新規作成
 * Ctrl+O         → 開く (.erd)
 * Ctrl+S         → 保存
 * Ctrl+Shift+S   → 名前を付けて保存
 * Ctrl+Z         → Undo
 * Ctrl+Shift+Z   → Redo
 * Ctrl+L         → 自動レイアウト
 * Ctrl+K         → クイックサーチ
 * Ctrl++/=       → ズームイン
 * Ctrl+-         → ズームアウト
 * Ctrl+Shift+F   → 全体を表示
 */
import { useEffect } from "react";

interface Handlers {
  onNew:     () => void;
  onOpen:    () => void;
  onSave:    () => void;
  onSaveAs:  () => void;
  onUndo:    () => void;
  onRedo:    () => void;
  onLayout:  () => void;
  onSearch:  () => void;
  onZoomIn:  () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "n":
            e.preventDefault();
            handlers.onNew();
            break;
          case "o":
            e.preventDefault();
            handlers.onOpen();
            break;
          case "s":
            e.preventDefault();
            if (e.shiftKey) handlers.onSaveAs();
            else            handlers.onSave();
            break;
          case "z":
            e.preventDefault();
            if (e.shiftKey) handlers.onRedo();
            else            handlers.onUndo();
            break;
          case "l":
            e.preventDefault();
            handlers.onLayout();
            break;
          case "k":
            e.preventDefault();
            handlers.onSearch();
            break;
          case "=":
          case "+":
            e.preventDefault();
            handlers.onZoomIn();
            break;
          case "-":
            e.preventDefault();
            handlers.onZoomOut();
            break;
          case "f":
            if (e.shiftKey) {
              e.preventDefault();
              handlers.onFitView();
            }
            break;
        }
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [handlers]);
}
