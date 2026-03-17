/**
 * useKeyboardShortcuts
 *
 * Ctrl+S  → JSON エクスポート
 * Ctrl+L  → 自動レイアウト
 * Ctrl+K  → クイックサーチ
 * Ctrl+Z  → Undo
 * Ctrl+Shift+Z → Redo
 * Ctrl++  → ズームイン
 * Ctrl+-  → ズームアウト
 * Ctrl+Shift+F → Fit View
 */
import { useEffect } from "react";

interface Handlers {
  onSave:    () => void;
  onLayout:  () => void;
  onSearch:  () => void;
  onUndo:    () => void;
  onRedo:    () => void;
  onZoomIn:  () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when the user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "s":
            e.preventDefault();
            handlers.onSave();
            break;
          case "l":
            e.preventDefault();
            handlers.onLayout();
            break;
          case "k":
            e.preventDefault();
            handlers.onSearch();
            break;
          case "z":
            e.preventDefault();
            if (e.shiftKey) {
              handlers.onRedo();
            } else {
              handlers.onUndo();
            }
            break;
          case "=": // Ctrl++ (unshifted)
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

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}
