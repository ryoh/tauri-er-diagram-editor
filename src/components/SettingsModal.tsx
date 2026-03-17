/**
 * SettingsModal — アプリケーション設定ダイアログ
 *
 * - グリッド表示/非表示
 * - ダークモード (外観のみ)
 * - デフォルトエンティティタイプ
 * - デフォルト記法モード
 */
import { useState } from "react";
import { useDiagramStore, type DiagramSettings } from "../store/useDiagramStore";
import type { EntityType } from "../types/diagram";
import type { DiagramMode } from "../store/useDiagramStore";

interface SettingsModalProps {
  onClose: () => void;
}

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "resource", label: "Resource" },
  { value: "event",    label: "Event" },
  { value: "normal",   label: "Normal" },
];

const MODE_OPTIONS: { value: DiagramMode; label: string }[] = [
  { value: "ie",      label: "IE 記法" },
  { value: "t-shape", label: "T字形" },
];

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <label className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 cursor-pointer group">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-gray-300"}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
    </label>
  );
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const settings       = useDiagramStore((s) => s.settings);
  const updateSettings = useDiagramStore((s) => s.updateSettings);

  const [draft, setDraft] = useState<DiagramSettings>({ ...settings });

  const update = (patch: Partial<DiagramSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };

  const handleSave = () => {
    updateSettings(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[95vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-2">
          {/* Appearance */}
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-3 mb-1">表示</p>
          <Toggle
            checked={draft.showGrid}
            onChange={(v) => update({ showGrid: v })}
            label="グリッドを表示"
            description="キャンバス背景にドットグリッドを表示します"
          />
          <Toggle
            checked={draft.darkMode}
            onChange={(v) => update({ darkMode: v })}
            label="ダークモード"
            description="アプリケーションの外観をダークにします"
          />

          {/* Defaults */}
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-4 mb-1">デフォルト設定</p>

          <div className="py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800 mb-2">デフォルト記法モード</p>
            <div className="flex gap-2">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ defaultMode: opt.value })}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                    draft.defaultMode === opt.value
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="py-3">
            <p className="text-sm font-medium text-gray-800 mb-2">デフォルトエンティティタイプ</p>
            <div className="flex gap-2">
              {ENTITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ defaultEntityType: opt.value })}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                    draft.defaultEntityType === opt.value
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-semibold rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
