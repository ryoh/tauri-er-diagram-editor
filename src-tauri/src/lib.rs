use er_diagram_core::parse_atlas_hcl;
use tauri_plugin_dialog::DialogExt;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Open a file-picker dialog for .hcl files, read the chosen file, parse it
/// with the core library, and return the resulting Diagram as a JSON string.
#[tauri::command]
async fn import_atlas_hcl(app: tauri::AppHandle) -> Result<String, String> {
    // 1. Show file-open dialog (blocking on the dialog thread)
    let file_path = app
        .dialog()
        .file()
        .add_filter("Atlas HCL", &["hcl"])
        .blocking_pick_file()
        .ok_or_else(|| "No file selected".to_string())?;

    // 2. Read the file contents
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    let hcl_str = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    // 3. Parse as Atlas HCL and return JSON
    parse_atlas_hcl(&hcl_str)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))
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
        .invoke_handler(tauri::generate_handler![import_atlas_hcl])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
