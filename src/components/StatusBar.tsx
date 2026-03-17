/**
 * StatusBar — 画面下部のステータスバー
 *
 * 左: テーブル数、リレーション数
 * 中央: 現在のファイル名
 * 右: 環境バッジ (Desktop / Web)
 */
import { isTauri } from "../utils/env";

interface StatusBarProps {
  tableCount:    number;
  relationCount: number;
  currentFile:   string | null;
}

export default function StatusBar({ tableCount, relationCount, currentFile }: StatusBarProps) {
  const env = isTauri() ? "Desktop" : "Web";

  return (
    <footer className="flex items-center justify-between px-4 py-0.5 bg-gray-800 text-gray-400 text-[11px] shrink-0 select-none">
      {/* Left: counts */}
      <div className="flex items-center gap-4">
        <span>
          <span className="text-gray-200 font-medium">{tableCount}</span> テーブル
        </span>
        <span>
          <span className="text-gray-200 font-medium">{relationCount}</span> リレーション
        </span>
      </div>

      {/* Center: filename */}
      <div className="text-gray-500">
        {currentFile ?? "未保存"}
      </div>

      {/* Right: env badge */}
      <div>
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            env === "Desktop"
              ? "bg-blue-900 text-blue-300"
              : "bg-gray-700 text-gray-300"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${env === "Desktop" ? "bg-blue-400" : "bg-gray-500"}`} />
          {env}
        </span>
      </div>
    </footer>
  );
}
