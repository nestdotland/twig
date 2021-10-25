import "https://deno.land/x/dotenv@v3.0.0/load.ts";
import "https://deno.land/x/xhr@0.1.2/mod.ts";
import Arweave from "https://esm.sh/arweave";
import { Buffer } from "https://deno.land/std@0.112.0/io/buffer.ts";
import { Untar } from "https://deno.land/std@0.112.0/archive/tar.ts";
import { DB } from "https://deno.land/x/sqlite@v3.1.1/mod.ts";
import { createFileEntry, File, verifyAuthor } from "./supabase.ts";
import { getType } from "https://esm.sh/mime";
import { bignum, define } from "https://esm.sh/asn1.js";
import {
  decode,
  encode,
} from "https://deno.land/std@0.113.0/encoding/base64url.ts";


const Version = define("Version", function () {
  this.int();
});
const AlgorithmIdentifier = define("AlgorithmIdentifer", function () {
  this.seq().obj(
    this.key("algorithm").objid(),
    this.key("parameters").optional().any(),
  );
});

const PrivateKeyInfo = define("PrivateKeyInfo", function () {
  this.seq().obj(
    this.key("version").use(Version),
    this.key("privateKeyAlgorithm").use(AlgorithmIdentifier),
    this.key("privateKey").octstr(),
    this.key("attributes").optional().any(),
  );
});

const RsaPrivateKey = define("RSAPrivateKey", function () {
  this.seq().obj(
    this.key("version").use(Version),
    this.key("modulus").int(),
    this.key("publicExponent").int(),
    this.key("privateExponent").int(),
    this.key("prime1").int(),
    this.key("prime2").int(),
    this.key("exponent1").int(),
    this.key("exponent2").int(),
    this.key("coefficient").int(),
  );
});

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

const privatekey = JSON.parse(
  await Deno.readTextFile(
    Deno.env.get("KEYFILE") || "./arweave.json",
  ),
);

const toBigNum = (str: string) => new bignum(decode(str), 10, "be").iabs();

const privateKeyDer = PrivateKeyInfo.encode(
  {
    version: 0,
    privateKeyAlgorithm: {
      algorithm: [1, 2, 840, 113549, 1, 1, 1],
      parameters: [5, 0],
    },
    privateKey: RsaPrivateKey.encode({
      version: 0,
      modulus: toBigNum(privatekey.n),
      publicExponent: toBigNum(privatekey.e),
      privateExponent: toBigNum(privatekey.d),
      prime1: toBigNum(privatekey.p),
      prime2: toBigNum(privatekey.q),
      exponent1: toBigNum(privatekey.dp),
      exponent2: toBigNum(privatekey.dq),
      coefficient: toBigNum(privatekey.qi),
    }, "der"),
  },
);

const privateCryptoKey: CryptoKey = await crypto.subtle.importKey(
  "pkcs8",
  privateKeyDer,
  { name: "RSA-PSS", hash: "SHA-256" },
  false,
  ["sign"],
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
  const listener = Deno.listen({ port: 8080 });
  console.log("Listening on 0.0.0.0:8080");

  for await (const conn of listener) {
    handler(conn);
  }
}

export async function handler(conn: Deno.Conn) {
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
      const progress = record ? record[0].progress : PROGRESS.UNKNOWN;
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

      const tx = await client.createTransaction(
        { data: dataBuf.bytes() },
        privatekey,
      );
      tx.addTag("Content-Type", mimeType);

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

      tx.setOwner(privatekey.n);
      const data = await tx.getSignatureData();

      const signature = await crypto.subtle.sign(
        { name: "RSA-PSS", saltLength: 32 },
        privateCryptoKey,
        data,
      );
      const id = await crypto.subtle.digest("SHA-256", signature);
      tx.setSignature({
        owner: privatekey.n,
        signature: encode(new Uint8Array(signature)),
        id: encode(new Uint8Array(id)),
      });

      const res = await client.transactions.post(tx);

      // TODO: Handle
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
