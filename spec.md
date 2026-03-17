# ER図エディタ実装仕様書 (Standard/T-Style Hybrid)

## 1. プロジェクト概要
Tauri (Desktop) および Cloudflare Pages (Web/Wasm) で動作する、DBA向け高機能ER図エディタ。

* **対応記法:** IE記法（鳥の足） & T字形ER図（TH法）
* **入出力:** 独自JSON (.erd), Atlas HCL (.hcl), 標準SQL (.sql), HTML定義書
* **プラットフォーム:** Windows/macOS/Linux (Tauri), Web Browser (Wasm/Cloudflare)

---

## 2. アーキテクチャ構成
ロジックを共有化し、環境に応じてI/Oを切り替える構成をとる。

* **`core/` (Rust Library):**
    * `crate-type = ["cdylib", "rlib"]`
    * HCLパース (`hcl-rs`), SQLパース (`sqlparser`), DDL生成, HTMLテンプレート実行。
    * `wasm-bindgen` によりブラウザからも呼び出し可能。
* **`src-tauri/` (Desktop Entry):**
    * `core` を依存関係に持ち、OSのファイルシステムI/Oを担当。
* **`src/` (React Frontend):**
    * **Diagram:** React Flow (カスタムノード/エッジ)
    * **State:** Zustand (テーブル/リレーションの状態管理)
    * **Adapter:** 環境(TauriかWebか)を検知し、保存処理を振り分ける。

---

## 3. データ構造 (Core Schema)

```rust
// エンティティ分類
enum EntityType {
    Resource, // (R) T字形における静的要素
    Event,    // (E) T字形における動的要素
    Normal    // IE記法のみで使う標準テーブル
}

struct Table {
    id: String,
    name: String,        // 物理名
    logical_name: String, // 論理名
    entity_type: EntityType,
    columns: Vec<Column>,
    position: (f64, f64),
}

struct Column {
    name: String,
    data_type: String,
    is_pk: bool,
    is_fk: bool,
    not_null: bool,
    comment: String,
}
```

---

## 4. 機能要件

### A. 描画エンジン
* **IE記法エッジ:** `React Flow` の `Custom Edge` で、鳥の足（1:N等）のシンボルを描画。
* **T字形ノード:** 垂直線を中央に配置し、左に識別子、右に属性を表示する専用コンポーネント。
* **自動レイアウト:** `Dagre` を使用し、依存関係に基づいた階層配置。T字モードでは「Rは左、Eは右」の原則を適用。

### B. インポート / エクスポート
* **Atlas HCL:** `.hcl` ファイルを読み込み、エンティティとリレーションを復元。
* **SQL:** `CREATE TABLE` 文のパース。
* **HTML定義書:** `Handlebars` 等を使い、検索・フィルタ機能付きの静的HTMLを出力。

### C. 環境対応
* **Tauri:** `dialog` APIでローカルファイルを直接読み書き。
* **Web:** ブラウザのダウンロード機能、または `LocalStorage` を使用。

---

## 5. Claude Code への実装指示ステップ

1.  **ステップ 1 (基礎):** `core/` に共通データ構造と `wasm-bindgen` の設定を行い、`src-tauri` と `src/` の雛形を作成せよ。
2.  **ステップ 2 (描画):** React Flowを導入し、`TableNode` (IE用) と `TNode` (T字用) の切り替え機能を実装せよ。
3.  **ステップ 3 (パース):** Rust側で `hcl-rs` を用いたAtlas HCLのインポーターを実装し、フロントエンドにデータを渡せ。
4.  **ステップ 4 (I/O):** SQL/HCL/HTML出力機能を順次実装し、環境に応じた保存アダプターを構築せよ。
5.  **ステップ 5 (洗練):** `Dagre` による自動レイアウトを実装し、DBAが使いやすいショートカットキー等を追加せよ。
6.  **ステップ 6：** 共通メニューシステムとUIの統合

---

### 補足: スタイリングガイド
* **Resource (R):** ヘッダー色 `#3b82f6` (Blue)
* **Event (E):** ヘッダー色 `#ef4444` (Red)
* **Normal:** ヘッダー色 `#6b7280` (Gray)
