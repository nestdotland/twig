import { verifyAuthor } from "./supabase.ts";
import { assertEquals } from "https://deno.land/std@0.112.0/testing/asserts.ts";
import { TEST_ACCESS_TOKEN, TEST_TAG_ID } from "./test_util.ts";

Deno.test({
  name: "verify_author#test",
  fn: async () => {
    const tag = await verifyAuthor(TEST_TAG_ID, TEST_ACCESS_TOKEN);

    assertEquals(tag.authorName, "nestland");
    assertEquals(tag.moduleName, "eggs");
    assertEquals(tag.versionName, "0.3.2");

    assertEquals(await verifyAuthor(TEST_TAG_ID, "ABCD"), false);
    assertEquals(await verifyAuthor("ABCD", TEST_ACCESS_TOKEN), false);
  },
});
