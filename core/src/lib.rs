use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use sqlparser::dialect::MySqlDialect;
use sqlparser::parser::Parser as SqlParser;
use sqlparser::ast::{Statement, ColumnOption, TableConstraint};

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntityType {
    Resource,
    Event,
    Normal,
}

impl Default for EntityType {
    fn default() -> Self {
        EntityType::Normal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub name: String,
    pub data_type: String,
    pub is_pk: bool,
    pub is_fk: bool,
    pub not_null: bool,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    pub id: String,
    pub name: String,
    pub logical_name: String,
    pub entity_type: EntityType,
    pub columns: Vec<Column>,
    pub position: (f64, f64),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Cardinality {
    One,
    ZeroOrOne,
    OneOrMany,
    ZeroOrMany,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    pub id: String,
    pub from_table_id: String,
    pub from_column: String,
    pub to_table_id: String,
    pub to_column: String,
    pub from_cardinality: Cardinality,
    pub to_cardinality: Cardinality,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagram {
    pub tables: Vec<Table>,
    pub relations: Vec<Relation>,
}

impl Diagram {
    pub fn new() -> Self {
        Diagram { tables: Vec::new(), relations: Vec::new() }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

impl Default for Diagram {
    fn default() -> Self { Self::new() }
}

// ---------------------------------------------------------------------------
// Atlas HCL parser helpers
// ---------------------------------------------------------------------------

/// Look up an attribute in a `Body` by key and return a reference to its
/// expression.  `Attribute` provides `.key() -> &str` and `.expr() -> &Expression`.
fn find_attr<'a>(body: &'a hcl::Body, key: &str) -> Option<&'a hcl::Expression> {
    body.attributes()
        .find(|a| a.key() == key)
        .map(|a| a.expr())
}

/// Convert an HCL expression to a SQL type string.
/// Handles:
///   `bigint`              → Variable      → "BIGINT"
///   `varchar(100)`        → FuncCall      → "VARCHAR(100)"
///   `sql.bigint` etc.     → Traversal     → last segment uppercased
fn expr_to_type(expr: &hcl::Expression) -> String {
    match expr {
        hcl::Expression::Variable(v) => v.as_str().to_uppercase(),
        hcl::Expression::Traversal(t) => {
            // Take the last GetAttr segment as the type name
            t.operators.iter().rev()
                .find_map(|op| {
                    if let hcl::TraversalOperator::GetAttr(attr) = op {
                        Some(attr.as_str().to_uppercase())
                    } else {
                        None
                    }
                })
                // fall back to the root variable name
                .unwrap_or_else(|| expr_to_type(&t.expr))
        }
        hcl::Expression::FuncCall(fc) => {
            // fc.name is FuncName { name: Identifier, namespace: Vec<Identifier> }
            let fn_name = fc.name.name.as_str().to_uppercase();
            let args: Vec<String> = fc.args.iter().map(expr_to_type).collect();
            format!("{fn_name}({})", args.join(","))
        }
        hcl::Expression::Number(n) => n.to_string(),
        hcl::Expression::String(s) => s.to_uppercase(),
        _ => "TEXT".to_string(),
    }
}

/// Extract the last identifier in a traversal or variable expression.
/// `column.user_id` → `"user_id"`,  `column.id` → `"id"`
fn last_ident(expr: &hcl::Expression) -> Option<String> {
    match expr {
        hcl::Expression::Variable(v) => Some(v.as_str().to_string()),
        hcl::Expression::Traversal(t) => t.operators.iter().rev().find_map(|op| {
            if let hcl::TraversalOperator::GetAttr(attr) = op {
                Some(attr.as_str().to_string())
            } else {
                None
            }
        }),
        _ => None,
    }
}

/// Decode a `table.<tbl_name>.column.<col_name>` traversal.
/// Returns `(Some(table_name), Some(col_name))`, or best-effort fallback.
fn ref_column_parts(expr: &hcl::Expression) -> (Option<String>, Option<String>) {
    if let hcl::Expression::Traversal(t) = expr {
        let ops = &t.operators;
        // ops[0] = GetAttr(tbl_name), ops[1] = GetAttr("column"), ops[2] = GetAttr(col_name)
        if ops.len() >= 3 {
            let tbl = if let hcl::TraversalOperator::GetAttr(a) = &ops[0] {
                Some(a.as_str().to_string())
            } else { None };
            let col = ops.iter().rev().find_map(|op| {
                if let hcl::TraversalOperator::GetAttr(a) = op {
                    Some(a.as_str().to_string())
                } else { None }
            });
            return (tbl, col);
        }
    }
    (None, last_ident(expr))
}

// ---------------------------------------------------------------------------
// Public parsing function
// ---------------------------------------------------------------------------

/// Parse an Atlas HCL schema string into a `Diagram`.
pub fn parse_atlas_hcl(input: &str) -> Result<Diagram, String> {
    let body: hcl::Body = hcl::from_str(input).map_err(|e| e.to_string())?;

    let mut tables: Vec<Table> = Vec::new();
    let mut relations: Vec<Relation> = Vec::new();
    let mut rel_counter: usize = 0;

    // Simple grid auto-layout
    const GRID_X: f64 = 320.0;
    const GRID_Y: f64 = 260.0;
    const COLS: usize = 4;

    for block in body.blocks() {
        if block.identifier() != "table" { continue; }

        let table_name = match block.labels().first() {
            Some(l) => l.as_str().to_string(),
            None => continue,
        };
        let idx = tables.len();
        let pos = ((idx % COLS) as f64 * GRID_X + 60.0,
                   (idx / COLS) as f64 * GRID_Y + 60.0);

        let inner = block.body();
        let mut columns: Vec<Column> = Vec::new();
        let mut pk_names: Vec<String> = Vec::new();

        // ── column blocks ─────────────────────────────────
        for cb in inner.blocks().filter(|b| b.identifier() == "column") {
            let col_name = match cb.labels().first() {
                Some(l) => l.as_str().to_string(),
                None => continue,
            };
            let cbody = cb.body();

            let data_type = find_attr(cbody, "type")
                .map(expr_to_type)
                .unwrap_or_else(|| "TEXT".to_string());

            // `null = false` → not_null = true
            let not_null = find_attr(cbody, "null")
                .and_then(|e| if let hcl::Expression::Bool(b) = e { Some(!b) } else { None })
                .unwrap_or(false);

            let comment = find_attr(cbody, "comment")
                .and_then(|e| if let hcl::Expression::String(s) = e { Some(s.clone()) } else { None })
                .unwrap_or_default();

            columns.push(Column { name: col_name, data_type, is_pk: false, is_fk: false, not_null, comment });
        }

        // ── primary_key block ─────────────────────────────
        if let Some(pk) = inner.blocks().find(|b| b.identifier() == "primary_key") {
            if let Some(hcl::Expression::Array(arr)) = find_attr(pk.body(), "columns") {
                pk_names = arr.iter().filter_map(last_ident).collect();
            }
        }
        for col in &mut columns {
            if pk_names.contains(&col.name) {
                col.is_pk = true;
                col.not_null = true;
            }
        }

        // ── foreign_key blocks ────────────────────────────
        for fk in inner.blocks().filter(|b| b.identifier() == "foreign_key") {
            rel_counter += 1;
            let fk_id = fk.labels().first()
                .map(|l| l.as_str().to_string())
                .unwrap_or_else(|| format!("fk_{rel_counter}"));

            let fkbody = fk.body();

            let from_cols: Vec<String> = find_attr(fkbody, "columns")
                .and_then(|e| if let hcl::Expression::Array(a) = e { Some(a.iter().filter_map(last_ident).collect()) } else { None })
                .unwrap_or_default();

            let (ref_tbl, ref_col) = find_attr(fkbody, "ref_columns")
                .and_then(|e| if let hcl::Expression::Array(a) = e { a.first().map(ref_column_parts) } else { None })
                .unwrap_or((None, None));

            let from_col = from_cols.first().cloned().unwrap_or_default();
            let to_tbl   = ref_tbl.unwrap_or_default();
            let to_col   = ref_col.unwrap_or_default();

            for col in &mut columns {
                if from_cols.contains(&col.name) { col.is_fk = true; }
            }

            if !from_col.is_empty() && !to_tbl.is_empty() {
                relations.push(Relation {
                    id: fk_id,
                    from_table_id: table_name.clone(),
                    from_column: from_col,
                    to_table_id: to_tbl,
                    to_column: to_col,
                    from_cardinality: Cardinality::ZeroOrMany,
                    to_cardinality: Cardinality::One,
                });
            }
        }

        tables.push(Table {
            id: table_name.clone(),
            name: table_name,
            logical_name: String::new(),
            entity_type: EntityType::Normal,
            columns,
            position: pos,
        });
    }

    Ok(Diagram { tables, relations })
}

// ---------------------------------------------------------------------------
// SQL DDL parser  (CREATE TABLE ... ; statements)
// ---------------------------------------------------------------------------

/// Parse one or more SQL `CREATE TABLE` statements and return a `Diagram`.
/// Uses MySQL dialect to support AUTO_INCREMENT, backtick identifiers, etc.
pub fn parse_sql_ddl(input: &str) -> Result<Diagram, String> {
    let dialect = MySqlDialect {};
    let stmts = SqlParser::parse_sql(&dialect, input)
        .map_err(|e| e.to_string())?;

    let mut tables: Vec<Table> = Vec::new();
    let mut relations: Vec<Relation> = Vec::new();

    const GRID_X: f64 = 320.0;
    const GRID_Y: f64 = 260.0;
    const COLS: usize = 4;

    for stmt in &stmts {
        let ct = match stmt {
            Statement::CreateTable(ct) => ct,
            _ => continue,
        };

        // ObjectName.to_string() gives the full dotted name; split off schema prefix
        let table_name = ct.name.to_string()
            .split('.')
            .last()
            .unwrap_or("")
            .trim_matches('`')
            .to_string();

        let idx = tables.len();
        let pos = ((idx % COLS) as f64 * GRID_X + 60.0,
                   (idx / COLS) as f64 * GRID_Y + 60.0);

        // Collect PK column names from table-level PRIMARY KEY constraint.
        // In sqlparser 0.61, PrimaryKey is a tuple variant: PrimaryKey(PrimaryKeyConstraint).
        let mut pk_names: Vec<String> = Vec::new();
        for constraint in &ct.constraints {
            if let TableConstraint::PrimaryKey(pk) = constraint {
                for col in &pk.columns {
                    // IndexColumn.column is IndexColumnExpr; to_string() gives the ident
                    pk_names.push(col.column.to_string().trim_matches('`').to_string());
                }
            }
        }

        // Collect FK constraints.
        // In sqlparser 0.61, ForeignKey is a tuple variant: ForeignKey(ForeignKeyConstraint).
        struct FkInfo { fk_id: String, from_cols: Vec<String>, to_tbl: String, to_col: String }
        let mut fk_infos: Vec<FkInfo> = Vec::new();
        for constraint in &ct.constraints {
            if let TableConstraint::ForeignKey(fk) = constraint {
                fk_infos.push(FkInfo {
                    fk_id: fk.name.as_ref().map(|n| n.value.clone())
                        .unwrap_or_else(|| format!("fk_{}", relations.len() + fk_infos.len() + 1)),
                    from_cols: fk.columns.iter().map(|c| c.value.clone()).collect(),
                    to_tbl: fk.foreign_table.to_string()
                        .split('.').last().unwrap_or("").trim_matches('`').to_string(),
                    to_col: fk.referred_columns.first().map(|c| c.value.clone()).unwrap_or_default(),
                });
            }
        }

        // Build columns
        let mut columns: Vec<Column> = Vec::new();
        for col_def in &ct.columns {
            let col_name = col_def.name.value.clone();
            let data_type = format!("{}", col_def.data_type);

            let mut is_pk = pk_names.contains(&col_name);
            let mut not_null = is_pk;
            let is_fk = fk_infos.iter().any(|fk| fk.from_cols.contains(&col_name));

            for opt_def in &col_def.options {
                match &opt_def.option {
                    ColumnOption::NotNull => { not_null = true; }
                    // Column-level PRIMARY KEY (e.g. `id INT PRIMARY KEY`)
                    ColumnOption::PrimaryKey { .. } => {
                        is_pk = true;
                        not_null = true;
                    }
                    _ => {}
                }
            }

            columns.push(Column { name: col_name, data_type, is_pk, is_fk, not_null, comment: String::new() });
        }

        // Build relations from FK infos
        for fk in fk_infos {
            let from_col = fk.from_cols.first().cloned().unwrap_or_default();
            if !from_col.is_empty() && !fk.to_tbl.is_empty() {
                relations.push(Relation {
                    id: fk.fk_id,
                    from_table_id: table_name.clone(),
                    from_column: from_col,
                    to_table_id: fk.to_tbl,
                    to_column: fk.to_col,
                    from_cardinality: Cardinality::ZeroOrMany,
                    to_cardinality: Cardinality::One,
                });
            }
        }

        tables.push(Table {
            id: table_name.clone(),
            name: table_name,
            logical_name: String::new(),
            entity_type: EntityType::Normal,
            columns,
            position: pos,
        });
    }

    Ok(Diagram { tables, relations })
}

// ---------------------------------------------------------------------------
// Auto-detect: HCL or SQL
// ---------------------------------------------------------------------------

/// Detect whether `input` looks like SQL DDL and dispatch to the right parser.
pub fn parse_auto(input: &str) -> Result<Diagram, String> {
    let first = input.trim_start();
    let upper = first[..first.len().min(30)].to_uppercase();
    if upper.starts_with("CREATE")
        || upper.starts_with("--")
        || upper.starts_with("/*")
    {
        parse_sql_ddl(input)
    } else {
        parse_atlas_hcl(input)
    }
}

// ---------------------------------------------------------------------------
// wasm-bindgen public API
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn create_empty_diagram() -> Result<String, JsValue> {
    Diagram::new().to_json().map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn parse_diagram(json: &str) -> Result<String, JsValue> {
    Diagram::from_json(json)
        .and_then(|d| d.to_json())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Parse an Atlas HCL string and return a Diagram JSON (Wasm/Web entry point).
#[wasm_bindgen]
pub fn import_hcl(hcl_str: &str) -> Result<String, JsValue> {
    parse_atlas_hcl(hcl_str)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))
        .map_err(|e| JsValue::from_str(&e))
}

/// Parse a SQL DDL string and return a Diagram JSON (Wasm/Web entry point).
#[wasm_bindgen]
pub fn import_sql(sql_str: &str) -> Result<String, JsValue> {
    parse_sql_ddl(sql_str)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))
        .map_err(|e| JsValue::from_str(&e))
}

/// Auto-detect format (HCL or SQL) and return a Diagram JSON.
#[wasm_bindgen]
pub fn import_auto(input: &str) -> Result<String, JsValue> {
    parse_auto(input)
        .and_then(|d| d.to_json().map_err(|e| e.to_string()))
        .map_err(|e| JsValue::from_str(&e))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_HCL: &str = r#"
table "users" "public" {
  column "id" {
    null = false
    type = bigint
  }
  column "name" {
    null = false
    type = varchar(100)
  }
  column "email" {
    null = true
    type = varchar(255)
  }
  primary_key {
    columns = [column.id]
  }
}

table "orders" "public" {
  column "id" {
    null = false
    type = bigint
  }
  column "user_id" {
    null = false
    type = bigint
  }
  column "total" {
    null = false
    type = decimal(10,2)
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "orders_user_id_fkey" {
    columns     = [column.user_id]
    ref_columns = [table.users.column.id]
    on_update   = NO_ACTION
    on_delete   = NO_ACTION
  }
}
"#;

    #[test]
    fn parses_tables() {
        let d = parse_atlas_hcl(SAMPLE_HCL).unwrap();
        assert_eq!(d.tables.len(), 2);
        assert!(d.tables.iter().any(|t| t.name == "users"));
        assert!(d.tables.iter().any(|t| t.name == "orders"));
    }

    #[test]
    fn parses_columns_and_types() {
        let d = parse_atlas_hcl(SAMPLE_HCL).unwrap();
        let users = d.tables.iter().find(|t| t.name == "users").unwrap();
        assert_eq!(users.columns.len(), 3);
        let id_col = users.columns.iter().find(|c| c.name == "id").unwrap();
        assert_eq!(id_col.data_type, "BIGINT");
        let name_col = users.columns.iter().find(|c| c.name == "name").unwrap();
        assert_eq!(name_col.data_type, "VARCHAR(100)");
    }

    #[test]
    fn parses_pk_and_not_null() {
        let d = parse_atlas_hcl(SAMPLE_HCL).unwrap();
        let users = d.tables.iter().find(|t| t.name == "users").unwrap();
        let id_col = users.columns.iter().find(|c| c.name == "id").unwrap();
        assert!(id_col.is_pk);
        assert!(id_col.not_null);
        let email_col = users.columns.iter().find(|c| c.name == "email").unwrap();
        assert!(!email_col.not_null);
    }

    #[test]
    fn parses_foreign_key_relation() {
        let d = parse_atlas_hcl(SAMPLE_HCL).unwrap();
        assert_eq!(d.relations.len(), 1);
        let rel = &d.relations[0];
        assert_eq!(rel.from_table_id, "orders");
        assert_eq!(rel.from_column,   "user_id");
        assert_eq!(rel.to_table_id,   "users");
        assert_eq!(rel.to_column,     "id");
        let orders = d.tables.iter().find(|t| t.name == "orders").unwrap();
        assert!(orders.columns.iter().find(|c| c.name == "user_id").unwrap().is_fk);
    }

    #[test]
    fn round_trip_empty_diagram() {
        let d = Diagram::new();
        let json = d.to_json().unwrap();
        let d2 = Diagram::from_json(&json).unwrap();
        assert_eq!(d2.tables.len(), 0);
    }

    // ── SQL tests ────────────────────────────────────────────────────────────

    const SAMPLE_SQL: &str = r#"
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_email (email)
);
"#;

    #[test]
    fn parses_sql_table_name() {
        let d = parse_sql_ddl(SAMPLE_SQL).unwrap();
        assert_eq!(d.tables.len(), 1);
        assert_eq!(d.tables[0].name, "users");
    }

    #[test]
    fn parses_sql_columns() {
        let d = parse_sql_ddl(SAMPLE_SQL).unwrap();
        let t = &d.tables[0];
        // INDEX declarations should not appear as columns
        let col_names: Vec<&str> = t.columns.iter().map(|c| c.name.as_str()).collect();
        assert!(col_names.contains(&"id"));
        assert!(col_names.contains(&"name"));
        assert!(col_names.contains(&"email"));
        assert!(col_names.contains(&"created_at"));
    }

    #[test]
    fn parses_sql_pk_and_not_null() {
        let d = parse_sql_ddl(SAMPLE_SQL).unwrap();
        let t = &d.tables[0];
        let id_col = t.columns.iter().find(|c| c.name == "id").unwrap();
        assert!(id_col.is_pk, "id should be PK");
        assert!(id_col.not_null, "id should be NOT NULL");
        let name_col = t.columns.iter().find(|c| c.name == "name").unwrap();
        assert!(name_col.not_null, "name should be NOT NULL");
    }

    #[test]
    fn auto_detect_sql() {
        let d = parse_auto(SAMPLE_SQL).unwrap();
        assert_eq!(d.tables[0].name, "users");
    }

    #[test]
    fn auto_detect_hcl() {
        let d = parse_auto(SAMPLE_HCL).unwrap();
        assert_eq!(d.tables.len(), 2);
    }

    // ── sample/users.hcl format ─────────────────────────────────────────────
    // Single label, schema attribute inside table block, separate schema block

    const USERS_HCL: &str = r#"
table "users" {
  schema = schema.example
  column "id" {
    null = false
    type = int
  }
  column "name" {
    null = true
    type = varchar(100)
  }
  primary_key {
    columns = [column.id]
  }
}
schema "example" {
  charset = "utf8mb4"
  collate = "utf8mb4_0900_ai_ci"
}
"#;

    #[test]
    fn parses_single_label_table() {
        let d = parse_atlas_hcl(USERS_HCL).unwrap();
        assert_eq!(d.tables.len(), 1);
        assert_eq!(d.tables[0].name, "users");
    }

    #[test]
    fn parses_users_hcl_columns() {
        let d = parse_atlas_hcl(USERS_HCL).unwrap();
        let t = &d.tables[0];
        assert_eq!(t.columns.len(), 2);
        let id_col = t.columns.iter().find(|c| c.name == "id").unwrap();
        assert_eq!(id_col.data_type, "INT");
        assert!(id_col.is_pk);
        assert!(id_col.not_null);
        let name_col = t.columns.iter().find(|c| c.name == "name").unwrap();
        assert_eq!(name_col.data_type, "VARCHAR(100)");
        assert!(!name_col.not_null);
    }
}
