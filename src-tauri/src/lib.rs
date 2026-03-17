use er_diagram_core::{parse_atlas_hcl, export_sql, export_hcl, export_html, Diagram};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

// ---------------------------------------------------------------------------
// Import command
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct ImportResult {
    json: String,
    filename: String,
}

#[tauri::command]
async fn import_atlas_hcl(app: tauri::AppHandle) -> Result<ImportResult, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Atlas HCL", &["hcl"])
        .blocking_pick_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path = file_path.into_path().map_err(|e| e.to_string())?;
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.hcl")
        .to_owned();
    let hcl_str = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let json = parse_atlas_hcl(&hcl_str)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))?;

    Ok(ImportResult { json, filename })
}

// ---------------------------------------------------------------------------
// Export command
// ---------------------------------------------------------------------------

/// Generate export content and save it via a native save dialog.
/// `format` is one of: "sql" | "hcl" | "html" | "json"
#[tauri::command]
async fn export_diagram(
    app: tauri::AppHandle,
    diagram_json: String,
    format: String,
    title: String,
    generated_at: String,
) -> Result<(), String> {
    // 1. Generate content
    let (content, ext, filter_name) = match format.as_str() {
        "sql" => {
            let diagram = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            (export_sql(&diagram), "sql", "SQL files")
        }
        "hcl" => {
            let diagram = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            (export_hcl(&diagram), "hcl", "Atlas HCL files")
        }
        "html" => {
            let diagram = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            let html = export_html(&diagram, &title, &generated_at)?;
            (html, "html", "HTML files")
        }
        "json" => {
            // ERD JSON: just re-serialise the parsed Diagram for normalisation
            let diagram = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            let json = diagram.to_json().map_err(|e| e.to_string())?;
            (json, "json", "JSON files")
        }
        _ => return Err(format!("Unknown format: {format}")),
    };

    // 2. Show save dialog
    let save_path = app
        .dialog()
        .file()
        .add_filter(filter_name, &[ext])
        .set_file_name(format!("schema.{ext}"))
        .blocking_save_file()
        .ok_or_else(|| "No file selected".to_string())?;

    // 3. Write file
    let path = save_path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write file: {e}"))
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![import_atlas_hcl, export_diagram])
        .setup(|app| {
            // ── Build OS menu ──────────────────────────────────────────────
            let file_menu = SubmenuBuilder::new(app, "ファイル")
                .item(
                    &MenuItemBuilder::with_id("open_hcl", "Atlas HCL を開く…")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id("save_json", "JSON として保存")
                        .accelerator("CmdOrCtrl+S")
                        .build(app)?,
                )
                .item(&MenuItemBuilder::with_id("export_sql",  "SQL をエクスポート…").build(app)?)
                .item(&MenuItemBuilder::with_id("export_hcl",  "Atlas HCL をエクスポート…").build(app)?)
                .item(&MenuItemBuilder::with_id("export_html", "HTML 定義書をエクスポート…").build(app)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "編集")
                .item(
                    &MenuItemBuilder::with_id("undo", "元に戻す")
                        .accelerator("CmdOrCtrl+Z")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("redo", "やり直し")
                        .accelerator("CmdOrCtrl+Shift+Z")
                        .build(app)?,
                )
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "表示")
                .item(
                    &MenuItemBuilder::with_id("zoom_in", "ズームイン")
                        .accelerator("CmdOrCtrl+Equal")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("zoom_out", "ズームアウト")
                        .accelerator("CmdOrCtrl+Minus")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("fit_view", "全体を表示")
                        .accelerator("CmdOrCtrl+Shift+F")
                        .build(app)?,
                )
                .item(&MenuItemBuilder::with_id("toggle_grid", "グリッド切替").build(app)?)
                .separator()
                .item(
                    &MenuItemBuilder::with_id("auto_layout", "自動配置")
                        .accelerator("CmdOrCtrl+L")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("quick_search", "テーブル検索")
                        .accelerator("CmdOrCtrl+K")
                        .build(app)?,
                )
                .separator()
                .item(&MenuItemBuilder::with_id("open_settings", "設定…").build(app)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .build()?;

            app.set_menu(menu)?;

            // ── Bridge menu events to frontend ────────────────────────────
            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                handle.emit("menu-event", event.id().as_ref()).ok();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
