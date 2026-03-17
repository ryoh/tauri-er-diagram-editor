/**
 * useKeyboardShortcuts
 *
 * Ctrl+S  → JSON エクスポート
 * Ctrl+L  → 自動レイアウト
 * Ctrl+K  → クイックサーチ
 */
import { useEffect } from "react";

interface Handlers {
  onSave:   () => void;
  onLayout: () => void;
  onSearch: () => void;
}

export function useKeyboardShortcuts({ onSave, onLayout, onSearch }: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when the user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "s":
            e.preventDefault();
            onSave();
            break;
          case "l":
            e.preventDefault();
            onLayout();
            break;
          case "k":
            e.preventDefault();
            onSearch();
            break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave, onLayout, onSearch]);
}
