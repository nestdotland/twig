import { verifyAuthor } from "./supabase.ts";
import { assertEquals } from "https://deno.land/std@0.112.0/testing/asserts.ts";
import { TEST_ACCESS_TOKEN } from "./test_util.ts";

Deno.test({
  name: "verify_author#test",
  fn: async () => {
    const tag = await verifyAuthor("0.3.2", "eggs", TEST_ACCESS_TOKEN);
    assertEquals(!!tag, true);
    assertEquals(tag.authorName, "nestland");
    assertEquals(tag.moduleName, "eggs");
    assertEquals(tag.name, "0.3.2");

    assertEquals(await verifyAuthor("0.3.2", "nestland", "DIVY"), false);
    assertEquals(
      await verifyAuthor("0.x.x", "nestland", TEST_ACCESS_TOKEN),
      false,
    );
  },
});
