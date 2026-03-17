use er_diagram_core::{parse_atlas_hcl, export_sql, export_hcl, export_html, Diagram};
use tauri_plugin_dialog::DialogExt;

// ---------------------------------------------------------------------------
// Import command
// ---------------------------------------------------------------------------

#[tauri::command]
async fn import_atlas_hcl(app: tauri::AppHandle) -> Result<String, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Atlas HCL", &["hcl"])
        .blocking_pick_file()
        .ok_or_else(|| "No file selected".to_string())?;

    let path = file_path.into_path().map_err(|e| e.to_string())?;
    let hcl_str = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    parse_atlas_hcl(&hcl_str)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
