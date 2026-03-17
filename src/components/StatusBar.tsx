/**
 * StatusBar — 画面下部のステータスバー
 */
import { isTauri } from "../utils/env";

interface StatusBarProps {
  tableCount:      number;
  relationCount:   number;
  currentFilePath: string | null;
  isDirty:         boolean;
}

/** Display name: basename of path (strip directory separators) */
function basename(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

export default function StatusBar({ tableCount, relationCount, currentFilePath, isDirty }: StatusBarProps) {
  const env = isTauri() ? "Desktop" : "Web";
  const name = currentFilePath ? basename(currentFilePath) : "未保存";

  return (
    <footer className="flex items-center justify-between px-4 py-0.5 bg-gray-800 text-gray-400 text-[11px] shrink-0 select-none">
      {/* Left: counts */}
      <div className="flex items-center gap-4">
        <span><span className="text-gray-200 font-medium">{tableCount}</span> テーブル</span>
        <span><span className="text-gray-200 font-medium">{relationCount}</span> リレーション</span>
      </div>

      {/* Center: file name + dirty flag */}
      <div className={`flex items-center gap-1 ${isDirty ? "text-amber-400" : "text-gray-500"}`}>
        {isDirty && <span title="未保存の変更があります">●</span>}
        <span>{name}</span>
      </div>

      {/* Right: env badge */}
      <div>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          env === "Desktop" ? "bg-blue-900 text-blue-300" : "bg-gray-700 text-gray-300"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${env === "Desktop" ? "bg-blue-400" : "bg-gray-500"}`} />
          {env}
        </span>
      </div>
    </footer>
  );
}
