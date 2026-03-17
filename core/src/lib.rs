use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use sqlparser::dialect::MySqlDialect;
use sqlparser::parser::Parser as SqlParser;
use sqlparser::ast::{Statement, ColumnOption, TableConstraint};
use handlebars::Handlebars;

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
// Exporters
// ---------------------------------------------------------------------------

// ── SQL Export ───────────────────────────────────────────────────────────────

/// Generate standard `CREATE TABLE` SQL from a Diagram.
pub fn export_sql(diagram: &Diagram) -> String {
    let mut out = String::new();
    for table in &diagram.tables {
        // Header comment
        if !table.logical_name.is_empty() {
            out.push_str(&format!("-- {} ({})\n", table.name, table.logical_name));
        } else {
            out.push_str(&format!("-- {}\n", table.name));
        }
        out.push_str(&format!("CREATE TABLE `{}` (\n", table.name));

        let mut lines: Vec<String> = Vec::new();

        for col in &table.columns {
            let null_clause = if col.not_null { " NOT NULL" } else { " NULL" };
            let comment_clause = if col.comment.is_empty() {
                String::new()
            } else {
                format!(" COMMENT '{}'", col.comment.replace('\'', "''"))
            };
            lines.push(format!(
                "  `{}` {}{}{}",
                col.name, col.data_type, null_clause, comment_clause
            ));
        }

        // PRIMARY KEY constraint
        let pk_cols: Vec<String> = table.columns.iter()
            .filter(|c| c.is_pk)
            .map(|c| format!("`{}`", c.name))
            .collect();
        if !pk_cols.is_empty() {
            lines.push(format!("  PRIMARY KEY ({})", pk_cols.join(", ")));
        }

        // FOREIGN KEY constraints (from relations that originate at this table)
        for rel in &diagram.relations {
            if rel.from_table_id == table.id {
                lines.push(format!(
                    "  CONSTRAINT `{}` FOREIGN KEY (`{}`) REFERENCES `{}` (`{}`)",
                    rel.id, rel.from_column, rel.to_table_id, rel.to_column
                ));
            }
        }

        out.push_str(&lines.join(",\n"));
        out.push_str("\n);\n\n");
    }
    out
}

// ── Atlas HCL Export ─────────────────────────────────────────────────────────

/// Serialise a Diagram to Atlas HCL format.
pub fn export_hcl(diagram: &Diagram) -> String {
    let mut out = String::new();
    for table in &diagram.tables {
        out.push_str(&format!("table \"{}\" {{\n", table.name));

        for col in &table.columns {
            out.push_str(&format!("  column \"{}\" {{\n", col.name));
            out.push_str(&format!("    null = {}\n", !col.not_null));
            // Use lowercase for Atlas HCL type expressions
            out.push_str(&format!("    type = {}\n", col.data_type.to_lowercase()));
            if !col.comment.is_empty() {
                out.push_str(&format!("    comment = \"{}\"\n", col.comment.replace('"', "\\\"")));
            }
            out.push_str("  }\n");
        }

        // primary_key
        let pk_cols: Vec<String> = table.columns.iter()
            .filter(|c| c.is_pk)
            .map(|c| format!("column.{}", c.name))
            .collect();
        if !pk_cols.is_empty() {
            out.push_str("  primary_key {\n");
            out.push_str(&format!("    columns = [{}]\n", pk_cols.join(", ")));
            out.push_str("  }\n");
        }

        // foreign_key blocks
        for rel in &diagram.relations {
            if rel.from_table_id == table.id {
                out.push_str(&format!("  foreign_key \"{}\" {{\n", rel.id));
                out.push_str(&format!("    columns     = [column.{}]\n", rel.from_column));
                out.push_str(&format!(
                    "    ref_columns = [table.{}.column.{}]\n",
                    rel.to_table_id, rel.to_column
                ));
                out.push_str("    on_update   = NO_ACTION\n");
                out.push_str("    on_delete   = NO_ACTION\n");
                out.push_str("  }\n");
            }
        }

        out.push_str("}\n\n");
    }
    out
}

// ── HTML Export ──────────────────────────────────────────────────────────────

fn cardinality_label(c: &Cardinality) -> &'static str {
    match c {
        Cardinality::One        => "1",
        Cardinality::ZeroOrOne  => "0..1",
        Cardinality::OneOrMany  => "1..N",
        Cardinality::ZeroOrMany => "0..N",
    }
}

fn entity_color(et: &EntityType) -> &'static str {
    match et {
        EntityType::Resource => "#3b82f6",
        EntityType::Event    => "#ef4444",
        EntityType::Normal   => "#6b7280",
    }
}

fn entity_label(et: &EntityType) -> &'static str {
    match et { EntityType::Resource => "R", EntityType::Event => "E", EntityType::Normal => "" }
}

#[derive(Serialize)]
struct HtmlCtx {
    title: String,
    generated_at: String,
    table_count: usize,
    relation_count: usize,
    has_relations: bool,
    tables: Vec<HtmlTableCtx>,
    relations: Vec<HtmlRelCtx>,
}

#[derive(Serialize)]
struct HtmlTableCtx {
    name: String,
    logical_name: String,
    entity_color: String,
    entity_label: String,
    col_names: String,
    columns: Vec<HtmlColCtx>,
}

#[derive(Serialize)]
struct HtmlColCtx {
    name: String,
    data_type: String,
    pk: bool,
    fk: bool,
    not_null: bool,
    comment: String,
}

#[derive(Serialize)]
struct HtmlRelCtx {
    from_table: String,
    from_column: String,
    cardinality: String,
    to_table: String,
    to_column: String,
}

const HTML_TEMPLATE: &str = r###"<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{title}}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6}
a{color:inherit;text-decoration:none}
header{background:#1e293b;color:#f8fafc;padding:2rem 2.5rem}
header h1{font-size:1.75rem;font-weight:700;letter-spacing:-.025em}
header p{color:#94a3b8;margin-top:.375rem;font-size:.875rem}
.toolbar{background:#fff;border-bottom:1px solid #e2e8f0;padding:.625rem 2.5rem;position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:1rem}
#search{flex:1;max-width:340px;padding:.4rem .75rem;border:1px solid #cbd5e1;border-radius:.375rem;font-size:.875rem;outline:none;transition:border-color .15s,box-shadow .15s}
#search:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
.toc{display:flex;flex-wrap:wrap;gap:.5rem;padding:1.25rem 2.5rem}
.toc-chip{padding:.25rem .875rem;border-radius:9999px;font-size:.8125rem;font-weight:600;border:2px solid;transition:all .15s;cursor:pointer}
.toc-chip:hover{opacity:.8}
main{padding:0 2.5rem 4rem}
.table-card{background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;margin-bottom:1.5rem;overflow:hidden}
.table-card.hidden{display:none}
.card-head{padding:.875rem 1.25rem;display:flex;align-items:center;gap:.625rem}
.card-head h2{font-size:1.0625rem;font-weight:700;color:#fff;margin:0}
.card-head .lg{font-size:.875rem;font-weight:400;opacity:.75;margin-left:.25rem}
.badge-entity{padding:.125rem .5rem;border-radius:9999px;font-size:.75rem;font-weight:800;background:rgba(255,255,255,.22);color:#fff}
table{width:100%;border-collapse:collapse}
th{background:#f8fafc;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;padding:.5rem 1rem;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap}
td{padding:.5625rem 1rem;font-size:.875rem;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#fafafa}
.key-cell{display:flex;gap:.25rem;min-width:52px}
.bpk{font-size:.7rem;font-weight:700;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;padding:.0625rem .375rem;border-radius:9999px}
.bfk{font-size:.7rem;font-weight:700;color:#1e40af;background:#dbeafe;border:1px solid #93c5fd;padding:.0625rem .375rem;border-radius:9999px}
code{font-family:"SF Mono",Consolas,monospace;font-size:.8125rem;background:#f1f5f9;color:#475569;padding:.125rem .375rem;border-radius:.25rem}
.nn{color:#0f766e;font-weight:600}
.cm{color:#94a3b8;font-size:.8125rem}
.rel-section{background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;padding:1.5rem;margin-bottom:1.5rem}
.rel-section h2{font-size:1rem;font-weight:700;margin-bottom:1rem;color:#475569;text-transform:uppercase;letter-spacing:.05em}
.card-sym{font-family:monospace;background:#f1f5f9;padding:.125rem .5rem;border-radius:.25rem;font-size:.8125rem;white-space:nowrap}
footer{text-align:center;padding:2rem;color:#94a3b8;font-size:.75rem;border-top:1px solid #e2e8f0;margin-top:2rem}
</style>
</head>
<body>
<header>
  <h1>{{title}}</h1>
  <p>生成日時: {{generated_at}} &nbsp;|&nbsp; テーブル: {{table_count}} &nbsp;|&nbsp; リレーション: {{relation_count}}</p>
</header>
<div class="toolbar">
  <input id="search" type="search" placeholder="テーブル名・カラム名で絞り込む…" oninput="doFilter(this.value)" autocomplete="off">
  <span id="hit-count" style="font-size:.8125rem;color:#94a3b8"></span>
</div>
<div class="toc">
  {{#each tables}}
  <a class="toc-chip" href="#t-{{name}}" style="border-color:{{entity_color}};color:{{entity_color}}">{{name}}{{#if logical_name}}&nbsp;<span style="font-weight:400;opacity:.7">{{logical_name}}</span>{{/if}}</a>
  {{/each}}
</div>
<main id="main">
{{#each tables}}
<div class="table-card" id="t-{{name}}" data-s="{{name}} {{logical_name}} {{col_names}}">
  <div class="card-head" style="background:{{entity_color}}">
    {{#if entity_label}}<span class="badge-entity">{{entity_label}}</span>{{/if}}
    <h2>{{name}}{{#if logical_name}}<span class="lg">{{logical_name}}</span>{{/if}}</h2>
  </div>
  <table>
    <thead><tr><th style="width:72px">Key</th><th>カラム名</th><th>データ型</th><th style="width:76px;text-align:center">NOT NULL</th><th>コメント</th></tr></thead>
    <tbody>
    {{#each columns}}
    <tr>
      <td><div class="key-cell">{{#if pk}}<span class="bpk">PK</span>{{/if}}{{#if fk}}<span class="bfk">FK</span>{{/if}}</div></td>
      <td style="font-weight:{{#if pk}}600{{else}}400{{/if}}">{{name}}</td>
      <td><code>{{data_type}}</code></td>
      <td style="text-align:center">{{#if not_null}}<span class="nn">●</span>{{/if}}</td>
      <td class="cm">{{comment}}</td>
    </tr>
    {{/each}}
    </tbody>
  </table>
</div>
{{/each}}
{{#if has_relations}}
<div class="rel-section">
  <h2>リレーション一覧</h2>
  <table>
    <thead><tr><th>FROM テーブル</th><th>FROM カラム</th><th style="text-align:center">多重度</th><th>TO テーブル</th><th>TO カラム</th></tr></thead>
    <tbody>
    {{#each relations}}
    <tr>
      <td><a href="#t-{{from_table}}" style="color:#3b82f6">{{from_table}}</a></td>
      <td>{{from_column}}</td>
      <td style="text-align:center"><span class="card-sym">{{cardinality}}</span></td>
      <td><a href="#t-{{to_table}}" style="color:#3b82f6">{{to_table}}</a></td>
      <td>{{to_column}}</td>
    </tr>
    {{/each}}
    </tbody>
  </table>
</div>
{{/if}}
</main>
<footer>Generated by ER Diagram Editor</footer>
<script>
function doFilter(q){
  q=q.trim().toLowerCase();
  var cards=document.querySelectorAll('.table-card');
  var n=0;
  cards.forEach(function(c){
    var show=!q||c.dataset.s.toLowerCase().includes(q);
    c.classList.toggle('hidden',!show);
    if(show)n++;
  });
  document.getElementById('hit-count').textContent=q?n+' / '+cards.length+' 件':'';
}
</script>
</body>
</html>
"###;

/// Generate a full HTML table-definition document from a Diagram.
pub fn export_html(diagram: &Diagram, title: &str, generated_at: &str) -> Result<String, String> {
    let mut hb = Handlebars::new();
    hb.register_template_string("html", HTML_TEMPLATE)
        .map_err(|e| e.to_string())?;

    let tables: Vec<HtmlTableCtx> = diagram.tables.iter().map(|t| {
        let col_names = t.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join(" ");
        HtmlTableCtx {
            name: t.name.clone(),
            logical_name: t.logical_name.clone(),
            entity_color: entity_color(&t.entity_type).to_string(),
            entity_label: entity_label(&t.entity_type).to_string(),
            col_names,
            columns: t.columns.iter().map(|c| HtmlColCtx {
                name: c.name.clone(),
                data_type: c.data_type.clone(),
                pk: c.is_pk,
                fk: c.is_fk,
                not_null: c.not_null,
                comment: c.comment.clone(),
            }).collect(),
        }
    }).collect();

    let relations: Vec<HtmlRelCtx> = diagram.relations.iter().map(|r| HtmlRelCtx {
        from_table: r.from_table_id.clone(),
        from_column: r.from_column.clone(),
        cardinality: format!(
            "{} : {}",
            cardinality_label(&r.from_cardinality),
            cardinality_label(&r.to_cardinality)
        ),
        to_table: r.to_table_id.clone(),
        to_column: r.to_column.clone(),
    }).collect();

    let has_relations = !relations.is_empty();
    let ctx = HtmlCtx {
        title: title.to_string(),
        generated_at: generated_at.to_string(),
        table_count: tables.len(),
        relation_count: relations.len(),
        has_relations,
        tables,
        relations,
    };

    hb.render("html", &ctx).map_err(|e| e.to_string())
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

/// Generate CREATE TABLE SQL from a Diagram JSON string.
#[wasm_bindgen]
pub fn export_sql_wasm(json: &str) -> Result<String, JsValue> {
    Diagram::from_json(json)
        .map(|d| export_sql(&d))
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Serialise a Diagram JSON string to Atlas HCL.
#[wasm_bindgen]
pub fn export_hcl_wasm(json: &str) -> Result<String, JsValue> {
    Diagram::from_json(json)
        .map(|d| export_hcl(&d))
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Generate an HTML table-definition document from a Diagram JSON string.
#[wasm_bindgen]
pub fn export_html_wasm(json: &str, title: &str, generated_at: &str) -> Result<String, JsValue> {
    Diagram::from_json(json)
        .map_err(|e| e.to_string())
        .and_then(|d| export_html(&d, title, generated_at))
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
