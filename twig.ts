import "https://deno.land/x/dotenv@v3.0.0/load.ts";
import "https://deno.land/x/xhr@0.1.2/mod.ts";
import Arweave from "https://esm.sh/arweave";
import { Buffer } from "https://deno.land/std@0.112.0/io/buffer.ts";
import { Untar } from "https://deno.land/std@0.112.0/archive/tar.ts";
import { createManifestEntry, verifyAuthor } from "./supabase.ts";
import { getType } from "https://esm.sh/mime";
import { encode } from "https://deno.land/std@0.113.0/encoding/base64url.ts";
import {
  drop_file,
  File,
  get_status,
  save as saveFileCache,
  update_status,
} from "./cache/mod.ts";
import { loadPrivateKey } from "./private_key.ts";

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
          owner: jwk.n,
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
    handler(conn, save, createManifestEntry);
  }
}

export async function handler(
  conn: Deno.Conn,
  save: (
    data: Uint8Array,
    mimeType: string,
  ) => Promise<{ tx: any; submit: () => Promise<any> }>,
  createManifestEntry: (
    version: string,
    moduleName: string,
    tx: string,
  ) => Promise<void>,
) {
  for await (const requestEvent of Deno.serveHttp(conn)) {
    const { request } = requestEvent;
    if (request.method !== "POST") {
      const url = new URL(request.url);
      const cacheId = url.searchParams.get("cache_id");
      if (!cacheId) {
        await requestEvent.respondWith(
          new Response(JSON.stringify({
            error: "`cache_id` parameter missing.",
          })),
        );

        continue;
      }
      const progress = await get_status(cacheId);
      await requestEvent.respondWith(
        new Response(JSON.stringify({ progress }), { status: 200 }),
      );

      continue;
    }

    const accessToken = request?.headers.get("authorization");
    const version = request?.headers.get("nest-version-name");
    const moduleName = request?.headers.get("nest-version-module");

    if (!accessToken || !version || !moduleName) {
      await requestEvent.respondWith(
        new Response(JSON.stringify({
          error:
            "Missing `Nest-Version-Name`, `Nest-Version-Module` or `Authorization` header.",
        })),
      );

      continue;
    }

    const tag = await verifyAuthor(version, moduleName, accessToken);

    if (!tag) {
      return requestEvent.respondWith(
        new Response(JSON.stringify({
          error: "Access denied.",
        })),
      );
    }

    const stream = request?.body?.getReader();
    if (stream == undefined) return requestEvent.respondWith(new Response());

    const cacheId = crypto.randomUUID();
    await update_status(cacheId, "Processing");
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

    const files: Record<string, { id: string }> = {};
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
        versionName: tag.name,
        id: tx,
        mimeType,
      };

      await saveFileCache(cacheId, file);
      const res = await submit();
      if (res.status >= 300) throw new Error(`Tx failed.`);

      files[file.path] = { id: tx };
    }

    await update_status(cacheId, "Uploading");
    const { tx, submit } = await save(
      Deno.core.encode(JSON.stringify({
        manifest: "arweave/paths",
        version: "0.1.0",
        index: {
          path: tag.main,
        },
        paths: files,
      })),
      "application/x.arweave-manifest+json",
    );

    await submit();
    await createManifestEntry(version, moduleName, tx);

    for (const file in files) {
      await drop_file(files[file].id);
    }
    await update_status(cacheId, "Done");
    await requestEvent.respondWith(new Response(cacheId));
    continue;
  }
}
