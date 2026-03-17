use er_diagram_core::{parse_atlas_hcl, parse_sql_ddl, export_sql, export_hcl, export_html, Diagram};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct ImportResult {
    json:     String,
    filename: String,
}

#[derive(serde::Serialize)]
struct OpenResult {
    content: String,
    path:    String,
}

// ---------------------------------------------------------------------------
// .erd project file commands
// ---------------------------------------------------------------------------

/// Open an .erd JSON project file via native file dialog.
#[tauri::command]
async fn open_erd_file(app: tauri::AppHandle) -> Result<OpenResult, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("ER Diagram", &["erd"])
        .blocking_pick_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path = picked.into_path().map_err(|e| e.to_string())?;
    let path_str = path.to_string_lossy().to_string();
    let content  = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read: {e}"))?;

    Ok(OpenResult { content, path: path_str })
}

/// Save content to an existing path (no dialog).
#[tauri::command]
async fn save_erd_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write: {e}"))
}

/// Save content via a native Save-As dialog; returns the chosen path.
#[tauri::command]
async fn save_erd_file_as(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let save_path = app
        .dialog()
        .file()
        .add_filter("ER Diagram", &["erd"])
        .set_file_name("diagram.erd")
        .blocking_save_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path = save_path.into_path().map_err(|e| e.to_string())?;
    let path_str = path.to_string_lossy().to_string();
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write: {e}"))?;

    Ok(path_str)
}

// ---------------------------------------------------------------------------
// Import commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn import_atlas_hcl(app: tauri::AppHandle) -> Result<ImportResult, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Atlas HCL", &["hcl"])
        .blocking_pick_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path     = picked.into_path().map_err(|e| e.to_string())?;
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("schema.hcl").to_owned();
    let hcl_str  = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read: {e}"))?;

    let json = parse_atlas_hcl(&hcl_str)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))?;

    Ok(ImportResult { json, filename })
}

#[tauri::command]
async fn import_sql_file(app: tauri::AppHandle) -> Result<ImportResult, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("SQL Files", &["sql"])
        .blocking_pick_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path     = picked.into_path().map_err(|e| e.to_string())?;
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("schema.sql").to_owned();
    let sql_str  = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read: {e}"))?;

    let json = parse_sql_ddl(&sql_str)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))?;

    Ok(ImportResult { json, filename })
}

// ---------------------------------------------------------------------------
// Export command
// ---------------------------------------------------------------------------

#[tauri::command]
async fn export_diagram(
    app: tauri::AppHandle,
    diagram_json: String,
    format: String,
    title: String,
    generated_at: String,
) -> Result<(), String> {
    let (content, ext, filter_name) = match format.as_str() {
        "sql"  => {
            let d = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            (export_sql(&d), "sql", "SQL files")
        }
        "hcl"  => {
            let d = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            (export_hcl(&d), "hcl", "Atlas HCL files")
        }
        "html" => {
            let d = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            let html = export_html(&d, &title, &generated_at)?;
            (html, "html", "HTML files")
        }
        "json" => {
            let d = Diagram::from_json(&diagram_json).map_err(|e| e.to_string())?;
            let j = d.to_json().map_err(|e| e.to_string())?;
            (j, "json", "JSON files")
        }
        _ => return Err(format!("Unknown format: {format}")),
    };

    let save_path = app
        .dialog()
        .file()
        .add_filter(filter_name, &[ext])
        .set_file_name(format!("schema.{ext}"))
        .blocking_save_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path = save_path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write: {e}"))
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
        .invoke_handler(tauri::generate_handler![
            open_erd_file,
            save_erd_file,
            save_erd_file_as,
            import_atlas_hcl,
            import_sql_file,
            export_diagram,
        ])
        .setup(|app| {
            // ── Import submenu ──────────────────────────────────────────────
            let import_menu = SubmenuBuilder::new(app, "インポート")
                .item(&MenuItemBuilder::with_id("import_hcl", "Atlas HCL (.hcl)…").build(app)?)
                .item(&MenuItemBuilder::with_id("import_sql", "SQL (.sql)…").build(app)?)
                .build()?;

            // ── Export submenu ──────────────────────────────────────────────
            let export_menu = SubmenuBuilder::new(app, "エクスポート")
                .item(&MenuItemBuilder::with_id("export_hcl",  "Atlas HCL…").build(app)?)
                .item(&MenuItemBuilder::with_id("export_sql",  "SQL…").build(app)?)
                .item(&MenuItemBuilder::with_id("export_html", "HTML 定義書…").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("export_png",  "画像 (PNG)…").build(app)?)
                .item(&MenuItemBuilder::with_id("export_svg",  "画像 (SVG)…").build(app)?)
                .build()?;

            // ── File menu ───────────────────────────────────────────────────
            let file_menu = SubmenuBuilder::new(app, "ファイル")
                .item(
                    &MenuItemBuilder::with_id("new_diagram", "新規作成")
                        .accelerator("CmdOrCtrl+N")
                        .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id("open_erd", "開く…")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id("save_erd", "保存")
                        .accelerator("CmdOrCtrl+S")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("save_erd_as", "名前を付けて保存…")
                        .accelerator("CmdOrCtrl+Shift+S")
                        .build(app)?,
                )
                .separator()
                .item(&import_menu)
                .item(&export_menu)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            // ── Edit menu ───────────────────────────────────────────────────
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

            // ── View menu ───────────────────────────────────────────────────
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

            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                handle.emit("menu-event", event.id().as_ref()).ok();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
