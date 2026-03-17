/**
 * useFileSystem
 *
 * Unified file I/O adapter for Tauri (desktop) and Web (browser) environments.
 *
 * IMPORT
 *   Tauri → invoke('import_atlas_hcl') — native file picker + Rust parser
 *   Web   → <input type="file"> + wasm import_hcl()
 *
 * EXPORT
 *   Tauri → invoke('export_diagram') — Rust generator + native save dialog
 *   Web   → Rust wasm generator → Blob → browser download
 */

import { useCallback } from "react";
import { useDiagramStore, type CoreDiagram } from "../store/useDiagramStore";
import { isTauri } from "../utils/env";

// ---------------------------------------------------------------------------
// Lazy Wasm loader (shared across import + export)
// ---------------------------------------------------------------------------

type WasmModule = {
  default: () => Promise<void>;
  import_hcl:      (hcl: string) => string;
  export_sql_wasm: (json: string) => string;
  export_hcl_wasm: (json: string) => string;
  export_html_wasm:(json: string, title: string, generatedAt: string) => string;
};

let _wasm: WasmModule | null = null;

async function getWasm(): Promise<WasmModule> {
  if (_wasm) return _wasm;
  const wasmPath = "../../core/pkg/er_diagram_core.js";
  const mod = await import(/* @vite-ignore */ wasmPath) as WasmModule;
  await mod.default();
  _wasm = mod;
  return mod;
}

// ---------------------------------------------------------------------------
// Browser download helper
// ---------------------------------------------------------------------------

function browserDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MIME: Record<string, string> = {
  sql:  "application/sql",
  hcl:  "text/plain",
  html: "text/html",
  json: "application/json",
};

// ---------------------------------------------------------------------------
// Export format type
// ---------------------------------------------------------------------------

export type ExportFormat = "sql" | "hcl" | "html" | "json";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileSystem() {
  const importFromCore = useDiagramStore((s) => s.importFromCore);
  const setCurrentFile = useDiagramStore((s) => s.setCurrentFile);
  const nodes          = useDiagramStore((s) => s.nodes);
  const edges          = useDiagramStore((s) => s.edges);

  // ── IMPORT ────────────────────────────────────────────────────────────────

  const importHcl = useCallback(async () => {
    try {
      let json: string;
      let filename: string;
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<{ json: string; filename: string }>("import_atlas_hcl");
        json     = result.json;
        filename = result.filename;
      } else {
        const file = await pickFile(".hcl");
        const wasm = await getWasm();
        const text = await readFileAsText(file);
        json     = wasm.import_hcl(text);
        filename = file.name;
      }
      const diagram: CoreDiagram = JSON.parse(json);
      importFromCore(diagram);
      setCurrentFile(filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "No file selected" && msg !== "Cancelled") {
        console.error("[useFileSystem] importHcl:", msg);
        alert(`インポートエラー: ${msg}`);
      }
    }
  }, [importFromCore, setCurrentFile]);

  // ── EXPORT ────────────────────────────────────────────────────────────────

  const exportDiagram = useCallback(async (format: ExportFormat) => {
    // Build Diagram JSON from current store state
    const coreDiagram: CoreDiagram = {
      tables: nodes.map((n) => ({
        id:          n.data.id,
        name:        n.data.name,
        logicalName: n.data.logicalName,
        entityType:  n.data.entityType,
        columns:     n.data.columns,
        position:    [n.position.x, n.position.y] as [number, number],
      })),
      relations: edges.map((e) => e.data!),
    };
    const diagramJson  = JSON.stringify(coreDiagram);
    const title        = "ER Diagram";
    const generatedAt  = new Date().toLocaleString("ja-JP");

    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("export_diagram", { diagramJson, format, title, generatedAt });
      } else {
        // Web: generate via Wasm then download
        let content: string;
        const wasm = await getWasm();
        switch (format) {
          case "sql":  content = wasm.export_sql_wasm(diagramJson); break;
          case "hcl":  content = wasm.export_hcl_wasm(diagramJson); break;
          case "html": content = wasm.export_html_wasm(diagramJson, title, generatedAt); break;
          case "json": content = JSON.stringify(coreDiagram, null, 2); break;
        }
        browserDownload(content, `schema.${format}`, MIME[format]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "No file selected" && msg !== "Cancelled") {
        console.error("[useFileSystem] exportDiagram:", msg);
        alert(`エクスポートエラー: ${msg}`);
      }
    }
  }, [nodes, edges]);

  return { importHcl, exportDiagram };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function pickFile(accept: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error("No file selected")); return; }
      resolve(file);
    };
    input.oncancel = () => reject(new Error("Cancelled"));
    input.click();
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
