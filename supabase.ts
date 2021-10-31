import "https://deno.land/x/dotenv@v3.0.0/load.ts";
import "https://deno.land/x/xhr@0.1.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

export const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_API_KEY"),
);

export async function verifyAuthor(
  version: string,
  moduleName: string,
  access_token: string,
) {
  const { data: Version, error } = await supabase.from("Version").select("*")
    .eq("name", version).eq("moduleName", moduleName).single();

  if (error) return false;

  const { data: User, error: userError } = await supabase.from("AccessToken")
    .select("username").eq("hash", access_token).single();

  if (userError) return false;
  return User.username === Version.authorName ? Version : null;
}

export async function createManifestEntry(
  version: string,
  moduleName: string,
  tx: string,
) {
  const { data, error } = await supabase.from("Version").update({
    manifestid: tx,
  }).eq("name", version).eq("moduleName", moduleName);
  if (error) throw new Error(`Failed to update manifest tx: ${error.message}`);

  return data;
}
