/**
 * useMenuEvents
 *
 * Tauri の OS メニューイベントをフロントエンドのアクションにブリッジする。
 * Tauri 環境以外では何もしない。
 */
import { useEffect } from "react";
import { isTauri } from "../utils/env";

type MenuHandler = (id: string) => void;

export function useMenuEvents(handler: MenuHandler) {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<string>("menu-event", (event) => {
        handler(event.payload);
      }).then((fn) => { unlisten = fn; });
    });

    return () => { unlisten?.(); };
  // Re-register if handler identity changes (use stable callbacks)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
