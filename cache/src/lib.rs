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
    mimeType TEXT
);"#,
            )
        });
        let pool = r2d2::Pool::new(conn).unwrap();
        pool
    };
}

#[deno_bindgen]
#[repr(u8)]
pub enum Progress {
    Started,
    Processing,
    Uploading,
    Done,
    Unknown,
}

#[deno_bindgen]
#[serde(rename_all = "camelCase")]
pub struct File {
    path: String,
    size: usize,
    author_name: String,
    module_name: String,
    version_name: String,
    id: String,
    mime_type: String,
}

#[deno_bindgen(non_blocking)]
pub fn save(cache_id: &str, file: File) -> usize {
    let conn = POOL.get().unwrap();
    conn.execute(
        "INSERT INTO file VALUES (:id, :cache_id, :path, :size, :author_name, :module_name, :version_name, :mime_type);",
        &[
            (":id", &file.id),
            (":cache_id", &cache_id.to_string()),
            (":path", &file.path),
            (":size", &file.size.to_string()),
            (":author_name", &file.author_name),
            (":module_name", &file.module_name),
            (":version_name", &file.version_name),
            (":mime_type", &file.mime_type),
        ],
    )
    .unwrap()
}

#[deno_bindgen(non_blocking)]
pub fn update_status(cache_id: &str, progress: Progress) -> usize {
    let conn = POOL.get().unwrap();
    let progress = progress as u8;
    conn.execute(
        "INSERT INTO cache (id, progress) VALUES (:id, :progress) ON CONFLICT(id) DO UPDATE SET progress = :progress;",
        &[(":id", &cache_id.to_string()), (":progress", &progress.to_string())],
    )
    .unwrap()
}

#[deno_bindgen(non_blocking)]
pub fn get_status(cache_id: &str) -> u8 {
    let conn = POOL.get().unwrap();
    conn.query_row(
        "SELECT progress FROM cache WHERE id = ?",
        [&cache_id.to_string()],
        |row| row.get(0),
    )
    .unwrap()
}

#[deno_bindgen(non_blocking)]
pub fn drop_file(file_id: &str) -> usize {
    let conn = POOL.get().unwrap();
    conn.execute("DELETE FROM file WHERE id = ?", &[&file_id.to_string()])
        .unwrap()
}

