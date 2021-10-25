import { handler, PROGRESS } from "./twig.ts";
import { readableStreamFromReader } from "https://deno.land/std@0.112.0/streams/conversion.ts";
import { TEST_ACCESS_TOKEN, TEST_TAG_ID } from "./test_util.ts";

const DUMMY_TX = "ABCD";
const DUMMY_TX_SAVE = async (_data: Uint8Array, _mime: string) => {
  return {
    tx: DUMMY_TX,
    submit: async () => {
      return { status: 200 };
    },
  };
};

Deno.test({
  name: "handler#upload",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const listener = Deno.listen({ port: 5000 });
    const conn = listener.next().then((conn) => {
      handler(conn.value, DUMMY_TX_SAVE, async () => {});
      return conn.value;
    });

    const tarModule = await Deno.open("testdata/test_module.tar");
    const response = await fetch("http://localhost:5000", {
      method: "POST",
      headers: {
        "Authorization": TEST_ACCESS_TOKEN,
        "Nest-Tag-ID": TEST_TAG_ID,
      },
      body: readableStreamFromReader(tarModule),
    });

    const cacheId = await response.text();

    let status = PROGRESS.UNKNOWN;

    const checkProgress = (r) => {
      if (status === PROGRESS.DONE) return r();
      setTimeout(async () => {
        const conn = listener.next().then((conn) => {
          handler(conn.value, DUMMY_TX_SAVE, async () => {});
          return conn.value;
        });

        const progressResponse = await fetch(
          `http://localhost:5000/?cache_id=${cacheId}`,
        );
        const { progress } = await progressResponse.json();
        status = progress;
        checkProgress(r);
      }, 1000);
    };

    await new Promise((r) => checkProgress(r));
    await listener.close();
  },
});
