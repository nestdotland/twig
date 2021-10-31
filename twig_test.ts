import { handler } from "./twig.ts";
import { readableStreamFromReader } from "https://deno.land/std@0.112.0/streams/conversion.ts";
import { TEST_ACCESS_TOKEN } from "./test_util.ts";

const DUMMY_TX = () => crypto.randomUUID();
const DUMMY_TX_SAVE = async (data: Uint8Array, mime: string) => {
  return {
    tx: DUMMY_TX(),
    submit: async () => {
      console.log(`Content-Type: ${mime}\n Data:`);
      console.log(data);
      return { status: 200 };
    },
  };
};

const DUMMY_UPDATE_MANIFEST = (
  version: string,
  moduleName: string,
  tx: string,
) => {
  console.log(`${moduleName}@${version} ${tx}`);
};

Deno.test({
  name: "handler#upload",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const listener = Deno.listen({ port: 5000 });
    const conn = listener.next().then(async (conn) => {
      await handler(conn.value, DUMMY_TX_SAVE, DUMMY_UPDATE_MANIFEST);
      return conn.value;
    });
    const tarModule = await Deno.open("testdata/test_module.tar");
    const response = await fetch("http://localhost:5000", {
      method: "POST",
      headers: {
        "Authorization": TEST_ACCESS_TOKEN,
        "Nest-Version-Name": "0.3.2",
        "Nest-Version-Module": "eggs",
      },
      body: readableStreamFromReader(tarModule),
    });

    const cacheId = await response.text();
    let status = 4; // Unknown

    const checkProgress = (r) => {
      if (status === 3 /* Done */) return r();
      const conn = listener.next().then(async (conn) => {
        await handler(conn.value, DUMMY_TX_SAVE, DUMMY_UPDATE_MANIFEST);
        return conn.value;
      });

      setTimeout(async () => {
        const progressResponse = await fetch(
          `http://localhost:5000/?cache_id=${cacheId}`,
        );
        const { progress } = await progressResponse.json();

        console.log(progress);
        status = progress;
        checkProgress(r);
      }, 500);
    };

    await new Promise((r) => checkProgress(r));
    await listener.close();
  },
});
