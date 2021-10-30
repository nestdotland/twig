use deno_bindgen::deno_bindgen;
use lazy_static::lazy_static;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

lazy_static! {
    static ref POOL: Pool<SqliteConnectionManager> = {
        let conn = SqliteConnectionManager::file("progress_cache.db").with_init(|c| {
            c.execute_batch(
                r#"
CREATE TABLE IF NOT EXISTS cache (
    id TEXT PRIMARY KEY,
    progress INTEGER
);
CREATE TABLE IF NOT EXISTS file (
    id TEXT PRIMARY KEY,
    cache_id TEXT,
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    authorName TEXT NOT NULL,
    moduleName TEXT NOT NULL,
    versionName TEXT NOT NULL,
    txid TEXT,
    mimeType TEXT
);"#,
            )
        });
        let pool = r2d2::Pool::new(conn).unwrap();
        pool
    };
}

#[deno_bindgen]
pub struct File {
    path: String,
    size: usize,
    author_name: String,
    module_name: String,
    version_name: String,
    id: String,
    txid: String,
    mime_type: String,
}

#[deno_bindgen(non_blocking)]
fn save(cache_id: &str, file: File) -> usize {
    let conn = POOL.get().unwrap();
    conn.execute(
        "INSERT INTO file VALUES (:id, :cache_id, :path, :size, :author_name, :module_name, :version_name, :txid, :mime_type);",
        &[
            (":id", &file.id),
            (":cache_id", &cache_id.to_string()),
            (":path", &file.path),
            (":size", &file.size.to_string()),
            (":author_name", &file.author_name),
            (":module_name", &file.module_name),
            (":version_name", &file.version_name),
            (":txid", &file.txid),
            (":mime_type", &file.mime_type),
        ],
    )
    .unwrap()
}
