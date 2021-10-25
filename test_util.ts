import "https://deno.land/x/dotenv@v3.0.0/load.ts";

export const TEST_TAG_ID = Deno.env.get("TEST_TAG_ID");
export const TEST_ACCESS_TOKEN = Deno.env.get("TEST_ACCESS_TOKEN");
