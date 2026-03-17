use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntityType {
    /// T字形における静的要素 (Resource)
    Resource,
    /// T字形における動的要素 (Event)
    Event,
    /// IE記法のみで使う標準テーブル (Normal)
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

/// Cardinality on one end of a relation
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
        Diagram {
            tables: Vec::new(),
            relations: Vec::new(),
        }
    }
}

impl Default for Diagram {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

impl Diagram {
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

// ---------------------------------------------------------------------------
// wasm-bindgen public API
// ---------------------------------------------------------------------------

/// Create an empty diagram and return it as a JSON string.
#[wasm_bindgen]
pub fn create_empty_diagram() -> Result<String, JsValue> {
    Diagram::new()
        .to_json()
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Validate and round-trip a diagram JSON string.
/// Returns the normalised JSON on success, or throws on parse error.
#[wasm_bindgen]
pub fn parse_diagram(json: &str) -> Result<String, JsValue> {
    Diagram::from_json(json)
        .and_then(|d| d.to_json())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_empty_diagram() {
        let d = Diagram::new();
        let json = d.to_json().unwrap();
        let d2 = Diagram::from_json(&json).unwrap();
        assert_eq!(d2.tables.len(), 0);
        assert_eq!(d2.relations.len(), 0);
    }

    #[test]
    fn round_trip_table() {
        let col = Column {
            name: "id".into(),
            data_type: "BIGINT".into(),
            is_pk: true,
            is_fk: false,
            not_null: true,
            comment: "Primary key".into(),
        };
        let table = Table {
            id: "t1".into(),
            name: "users".into(),
            logical_name: "ユーザー".into(),
            entity_type: EntityType::Resource,
            columns: vec![col],
            position: (100.0, 200.0),
        };
        let mut d = Diagram::new();
        d.tables.push(table);

        let json = d.to_json().unwrap();
        let d2 = Diagram::from_json(&json).unwrap();
        assert_eq!(d2.tables[0].name, "users");
        assert_eq!(d2.tables[0].entity_type, EntityType::Resource);
        assert_eq!(d2.tables[0].columns[0].is_pk, true);
    }
}
