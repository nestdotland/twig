import "https://deno.land/x/dotenv@v3.0.0/load.ts";
import "https://deno.land/x/xhr@0.1.2/mod.ts";
import Arweave from "https://esm.sh/arweave";
import { Buffer } from "https://deno.land/std@0.112.0/io/buffer.ts";
import { Untar } from "https://deno.land/std@0.112.0/archive/tar.ts";
import { DB } from "https://deno.land/x/sqlite@v3.1.1/mod.ts";
import { createFileEntry, File, verifyAuthor } from "./supabase.ts";
import { getType } from "https://esm.sh/mime";
import { encode } from "https://deno.land/std@0.113.0/encoding/base64url.ts";
import { loadPrivateKey } from "./private_key.ts";

const db = new DB("progress_cache.db");

export enum PROGRESS {
  STARTED = 0,
  PROCESSING = 1,
  UPLOADING = 2,
  DONE = 3,
  UNKNOWN = 4,
}

db.query(`
  CREATE TABLE IF NOT EXISTS cache (
    id TEXT PRIMARY KEY,
    progress INTEGER
  )
`);

db.query(`
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
  )
`);

const { cryptoKey, jwk } = await loadPrivateKey(
  Deno.env.get("KEYFILE") || "./arweave.json",
);

export const client = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
  timeout: 20000,
  logging: false,
  logger: (...e: any[]) => console.log(...e),
});

if (import.meta.main) {
  const save = async (data: Uint8Array, mimeType: string) => {
    const tx = await client.createTransaction(
      { data },
      jwk,
    );
    tx.addTag("Content-Type", mimeType);

    return {
      tx,
      submit: async () => {
        tx.setOwner(jwk.n);
        const data = await tx.getSignatureData();

        const signature = await crypto.subtle.sign(
          { name: "RSA-PSS", saltLength: 32 },
          cryptoKey,
          data,
        );
        const id = await crypto.subtle.digest("SHA-256", signature);
        tx.setSignature({
          owner: privatekey.n,
          signature: encode(new Uint8Array(signature)),
          id: encode(new Uint8Array(id)),
        });

        const res = await client.transactions.post(tx);
        return res;
      },
    };
  };

  const listener = Deno.listen({ port: 8080 });
  console.log("Listening on 0.0.0.0:8080");

  for await (const conn of listener) {
    handler(conn, save, createFileEntry);
  }
}

export async function handler(
  conn: Deno.Conn,
  save: (
    data: Uint8Array,
    mimeType: string,
  ) => Promise<{ tx: any; submit: () => Promise<any> }>,
  createFileEntry: (file: File) => Promise<void>,
) {
  for await (const requestEvent of Deno.serveHttp(conn)) {
    const { request } = requestEvent;
    if (request.method !== "POST") {
      const url = new URL(request.url);
      const cacheId = url.searchParams.get("cache_id");
      if (!cacheId) {
        return requestEvent.respondWith(
          new Response(JSON.stringify({
            error: "`cache_id` parameter missing.",
          })),
        );
      }
      const record = db.query("SELECT progress FROM cache WHERE id = ?", [
        cacheId,
      ]);
      const progress = record ? record[0][0] : PROGRESS.UNKNOWN;
      return requestEvent.respondWith(
        new Response(JSON.stringify({ progress }), { status: 200 }),
      );
    }

    const accessToken = request?.headers.get("authorization");
    const tagId = request?.headers.get("nest-tag-id");

    if (!accessToken || !tagId) {
      return requestEvent.respondWith(
        new Response(JSON.stringify({
          error: "Missing `Nest-Tag-ID` or `Authorization` header.",
        })),
      );
    }

    const tag = await verifyAuthor(tagId, accessToken);
    if (!tag) {
      return requestEvent.respondWith(
        new Response(JSON.stringify({
          error: "Access denied.",
        })),
        { status: 400 },
      );
    }

    const stream = request?.body?.getReader();
    if (stream == undefined) return requestEvent.respondWith(new Response());

    const cacheId = crypto.randomUUID();
    requestEvent.respondWith(new Response(cacheId, { status: 200 }));

    db.query("INSERT INTO cache (id, progress) VALUES (?, ?)", [
      cacheId,
      PROGRESS.PROCESSING,
    ]);

    const readBuffer = new Buffer();

    const reader: Deno.Reader = {
      async read(out: Uint8Array) {
        if (readBuffer.empty()) {
          const res = await stream.read();
          if (res.done) {
            return null;
          }

          let n = 0;
          while (n < res.value.length) {
            n += await readBuffer.write(res.value.subarray(n));
          }
        }

        return readBuffer.read(out);
      },
    };

    const files: File[] = [];
    const pack = new Untar(reader);
    for await (const entry of pack) {
      if (entry.type !== "file") continue;
      const mimeType = getType(entry.fileName);
      const dataBuf = new Buffer();
      await dataBuf.readFrom(entry);

      const { tx, submit } = await save(dataBuf.bytes(), mimeType);
      const file = {
        path: entry.fileName,
        size: entry.fileSize,
        authorName: tag.authorName,
        moduleName: tag.moduleName,
        versionName: tag.versionName,
        id: crypto.randomUUID(),
        txid: tx.id,
        mimeType,
      };

      db.query("INSERT INTO file VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        file.id,
        cacheId,
        file.path,
        file.size,
        file.authorName,
        file.moduleName,
        file.versionName,
        file.txid,
        file.mimeType,
      ]);

      const res = await submit();
      if (res.status >= 300) throw new Error(`Tx failed.`);

      files.push(file);
    }

    db.query("UPDATE cache SET progress = ? WHERE id = ?", [
      PROGRESS.UPLOADING,
      cacheId,
    ]);

    for (const file of files) {
      await createFileEntry(file);
      db.query("DELETE FROM file WHERE id = ?", [file.id]);
    }

    db.query("UPDATE cache SET progress = ? WHERE id = ?", [
      PROGRESS.DONE,
      cacheId,
    ]);
  }
}
