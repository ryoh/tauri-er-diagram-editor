/**
 * useFileSystem
 *
 * Unified file I/O adapter for Tauri (desktop) and Web (browser) environments.
 *
 * .erd project file  : open / save / saveAs / newDiagram
 * Import             : Atlas HCL (.hcl), SQL (.sql)
 * Export (formatted) : SQL / Atlas HCL / HTML / ERD JSON
 * Export (image)     : PNG / SVG  (via html-to-image + ReactFlow helpers)
 */

import { useCallback } from "react";
import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { useDiagramStore, type CoreDiagram } from "../store/useDiagramStore";
import { isTauri } from "../utils/env";

// ---------------------------------------------------------------------------
// Web: module-level save handle (persists across re-renders)
// ---------------------------------------------------------------------------

// FileSystemFileHandle is available in modern browsers but not in TypeScript
// lib without the DOM 2024 target. We use `unknown` and cast.
let _webSaveHandle: unknown = null;

// ---------------------------------------------------------------------------
// Lazy Wasm loader
// ---------------------------------------------------------------------------

type WasmModule = {
  default: () => Promise<void>;
  import_hcl:       (hcl: string) => string;
  import_sql:       (sql: string) => string;
  export_sql_wasm:  (json: string) => string;
  export_hcl_wasm:  (json: string) => string;
  export_html_wasm: (json: string, title: string, generatedAt: string) => string;
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
// Browser helpers
// ---------------------------------------------------------------------------

function browserDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function browserDownloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function pickFile(accept: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept;
    input.onchange  = () => { const f = input.files?.[0]; f ? resolve(f) : reject(new Error("No file selected")); };
    input.oncancel  = () => reject(new Error("Cancelled"));
    input.click();
  });
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/** showOpenFilePicker with .erd filter; falls back to <input> */
async function webOpenErd(): Promise<{ text: string; name: string; handle: unknown }> {
  const w = window as { showOpenFilePicker?: Function };
  if (w.showOpenFilePicker) {
    const [handle] = await w.showOpenFilePicker({
      types: [{ description: "ER Diagram", accept: { "application/json": [".erd"] } }],
    });
    const file = await (handle as { getFile(): Promise<File> }).getFile();
    return { text: await file.text(), name: file.name, handle };
  }
  const file = await pickFile(".erd");
  return { text: await readFileAsText(file), name: file.name, handle: null };
}

/** showSaveFilePicker; falls back to download */
async function webSaveErd(
  content: string,
  suggestedName: string,
  existingHandle: unknown
): Promise<{ name: string; handle: unknown }> {
  const w = window as { showSaveFilePicker?: Function };

  if (existingHandle) {
    // Re-use existing handle
    const writable = await (existingHandle as { createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }).createWritable();
    await writable.write(content);
    await writable.close();
    const file = await (existingHandle as { getFile(): Promise<File> }).getFile();
    return { name: file.name, handle: existingHandle };
  }

  if (w.showSaveFilePicker) {
    const handle = await w.showSaveFilePicker({
      suggestedName,
      types: [{ description: "ER Diagram", accept: { "application/json": [".erd"] } }],
    });
    const writable = await (handle as { createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }).createWritable();
    await writable.write(content);
    await writable.close();
    const file = await (handle as { getFile(): Promise<File> }).getFile();
    return { name: file.name, handle };
  }

  browserDownload(content, suggestedName, "application/json");
  return { name: suggestedName, handle: null };
}

const MIME: Record<string, string> = {
  sql: "application/sql", hcl: "text/plain", html: "text/html", json: "application/json",
};

export type ExportFormat = "sql" | "hcl" | "html" | "json";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileSystem() {
  const importFromCore    = useDiagramStore((s) => s.importFromCore);
  const clearDiagram      = useDiagramStore((s) => s.clearDiagram);
  const setCurrentFilePath = useDiagramStore((s) => s.setCurrentFilePath);
  const setIsDirty        = useDiagramStore((s) => s.setIsDirty);
  const nodes             = useDiagramStore((s) => s.nodes);
  const edges             = useDiagramStore((s) => s.edges);

  // ── Helper: build CoreDiagram from store ──────────────────────────────────
  const buildCoreDiagram = useCallback((): CoreDiagram => ({
    tables: nodes.map((n) => ({
      id: n.data.id, name: n.data.name, logicalName: n.data.logicalName,
      entityType: n.data.entityType, columns: n.data.columns,
      position: [n.position.x, n.position.y] as [number, number],
    })),
    relations: edges.map((e) => e.data!),
  }), [nodes, edges]);

  // ── NEW ────────────────────────────────────────────────────────────────────

  const newDiagram = useCallback(async () => {
    const { isDirty } = useDiagramStore.getState();
    if (isDirty) {
      if (!window.confirm("未保存の変更があります。新規作成しますか？")) return;
    }
    clearDiagram();
    _webSaveHandle = null;
  }, [clearDiagram]);

  // ── OPEN .erd ──────────────────────────────────────────────────────────────

  const openErd = useCallback(async () => {
    const { isDirty } = useDiagramStore.getState();
    if (isDirty) {
      if (!window.confirm("未保存の変更があります。続けますか？")) return;
    }
    try {
      let content: string;
      let filePath: string;

      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<{ content: string; path: string }>("open_erd_file");
        content  = result.content;
        filePath = result.path;
      } else {
        const { text, name, handle } = await webOpenErd();
        content       = text;
        filePath      = name;
        _webSaveHandle = handle;
      }

      const diagram: CoreDiagram = JSON.parse(content);
      importFromCore(diagram);
      setCurrentFilePath(filePath);
      setIsDirty(false);
    } catch (err) {
      handleError("[openErd]", err);
    }
  }, [importFromCore, setCurrentFilePath, setIsDirty]);

  // ── SAVE ───────────────────────────────────────────────────────────────────

  const saveErd = useCallback(async () => {
    const { currentFilePath } = useDiagramStore.getState();
    // Tauri: use existing path if available; else save-as
    if (isTauri()) {
      if (currentFilePath) {
        const content = JSON.stringify(buildCoreDiagram(), null, 2);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("save_erd_file", { path: currentFilePath, content });
          setIsDirty(false);
        } catch (err) {
          handleError("[saveErd]", err);
        }
        return;
      }
    } else {
      // Web: use existing handle if available
      if (_webSaveHandle) {
        const content = JSON.stringify(buildCoreDiagram(), null, 2);
        try {
          const { handle } = await webSaveErd(content, "diagram.erd", _webSaveHandle);
          _webSaveHandle = handle;
          setIsDirty(false);
        } catch (err) {
          handleError("[saveErd]", err);
        }
        return;
      }
    }
    // No existing path/handle → Save As
    await saveErdAs();
  }, [buildCoreDiagram, setIsDirty]);

  // ── SAVE AS ────────────────────────────────────────────────────────────────

  const saveErdAs = useCallback(async () => {
    const content = JSON.stringify(buildCoreDiagram(), null, 2);
    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const path = await invoke<string>("save_erd_file_as", { content });
        setCurrentFilePath(path);
        setIsDirty(false);
      } else {
        const { currentFilePath } = useDiagramStore.getState();
        const suggested = currentFilePath ?? "diagram.erd";
        const { name, handle } = await webSaveErd(content, suggested, null);
        _webSaveHandle = handle;
        setCurrentFilePath(name);
        setIsDirty(false);
      }
    } catch (err) {
      handleError("[saveErdAs]", err);
    }
  }, [buildCoreDiagram, setCurrentFilePath, setIsDirty]);

  // ── IMPORT HCL ────────────────────────────────────────────────────────────

  const importHcl = useCallback(async () => {
    try {
      let json: string, filename: string;
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const r = await invoke<{ json: string; filename: string }>("import_atlas_hcl");
        json = r.json; filename = r.filename;
      } else {
        const file = await pickFile(".hcl");
        const wasm = await getWasm();
        json     = wasm.import_hcl(await readFileAsText(file));
        filename = file.name;
      }
      importFromCore(JSON.parse(json));
      setCurrentFilePath(filename);
      setIsDirty(false);
    } catch (err) {
      handleError("[importHcl]", err);
    }
  }, [importFromCore, setCurrentFilePath, setIsDirty]);

  // ── IMPORT SQL ────────────────────────────────────────────────────────────

  const importSql = useCallback(async () => {
    try {
      let json: string, filename: string;
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const r = await invoke<{ json: string; filename: string }>("import_sql_file");
        json = r.json; filename = r.filename;
      } else {
        const file = await pickFile(".sql");
        const wasm = await getWasm();
        json     = wasm.import_sql(await readFileAsText(file));
        filename = file.name;
      }
      importFromCore(JSON.parse(json));
      setCurrentFilePath(filename);
      setIsDirty(false);
    } catch (err) {
      handleError("[importSql]", err);
    }
  }, [importFromCore, setCurrentFilePath, setIsDirty]);

  // ── EXPORT (text formats) ─────────────────────────────────────────────────

  const exportDiagram = useCallback(async (format: ExportFormat) => {
    const diagramJson = JSON.stringify(buildCoreDiagram());
    const title       = "ER Diagram";
    const generatedAt = new Date().toLocaleString("ja-JP");
    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("export_diagram", { diagramJson, format, title, generatedAt });
      } else {
        const wasm = await getWasm();
        let content: string;
        switch (format) {
          case "sql":  content = wasm.export_sql_wasm(diagramJson);  break;
          case "hcl":  content = wasm.export_hcl_wasm(diagramJson);  break;
          case "html": content = wasm.export_html_wasm(diagramJson, title, generatedAt); break;
          case "json": content = JSON.stringify(buildCoreDiagram(), null, 2); break;
        }
        browserDownload(content, `schema.${format}`, MIME[format]);
      }
    } catch (err) {
      handleError("[exportDiagram]", err);
    }
  }, [buildCoreDiagram]);

  // ── EXPORT IMAGE ─────────────────────────────────────────────────────────

  const exportImage = useCallback(async (format: "png" | "svg") => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport) return;

    // Compute bounds of all nodes for the crop area
    const reactFlowNodes = useDiagramStore.getState().nodes;
    if (reactFlowNodes.length === 0) return;

    const bounds   = getNodesBounds(reactFlowNodes);
    const padding  = 40;
    const width    = bounds.width  + padding * 2;
    const height   = bounds.height + padding * 2;
    const transform = getViewportForBounds(bounds, width, height, 0.5, 2, padding);

    const opts = {
      backgroundColor: "#f8fafc",
      width,
      height,
      style: {
        width:     `${width}px`,
        height:    `${height}px`,
        transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.zoom})`,
      },
    };

    try {
      if (format === "png") {
        const dataUrl = await toPng(viewport, opts);
        const res     = await fetch(dataUrl);
        const blob    = await res.blob();
        browserDownloadBlob(blob, "diagram.png");
      } else {
        const svg = await toSvg(viewport, opts);
        browserDownload(svg, "diagram.svg", "image/svg+xml");
      }
    } catch (err) {
      handleError("[exportImage]", err);
    }
  }, []);

  return { newDiagram, openErd, saveErd, saveErdAs, importHcl, importSql, exportDiagram, exportImage };
}

// ---------------------------------------------------------------------------
// Internal: error handler
// ---------------------------------------------------------------------------

function handleError(ctx: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "No file selected" || msg === "Cancelled" || msg === "The user aborted a request.") return;
  console.error(ctx, msg);
  alert(`エラー: ${msg}`);
}
