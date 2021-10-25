import { handler, PROGRESS } from "./twig.ts";
import { readableStreamFromReader } from "https://deno.land/std@0.112.0/streams/conversion.ts";
import { TEST_ACCESS_TOKEN, TEST_TAG_ID } from "./test_util.ts";

Deno.test({
  name: "handler#upload",
  fn: async () => {
    const listener = Deno.listen({ port: 5000 });
    const conn = listener.next().then((conn) => {
      handler(conn.value);
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
        const progressResponse = await fetch(
          `http://localhost:5000/?cache_id=${cacheId}`,
        );
        const { progress } = await progressResponse.json();
        console.log(progress);
        status = progress;
        checkProgress(r);
      }, 1000);
    };

    await new Promise((r) => checkProgress(r));

    await listener.close();
    (await conn).close();
  },
});
