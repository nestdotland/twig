import "https://deno.land/x/dotenv@v3.0.0/load.ts";
import "https://deno.land/x/xhr@0.1.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

export const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_API_KEY"),
);

export async function verifyAuthor(tag_id: string, access_token: string) {
  const { data: Tag, error } = await supabase.from("Tag").select("*")
    .eq("id", tag_id).single();

  if (error) return false;

  const { data: User, error: userError } = await supabase.from("AccessToken")
    .select("username").eq("hash", access_token).single();

  if (userError) return false;
  return User.username === Tag.authorName ? Tag : null;
}

export type File = {
  path: string;
  size: number;
  authorName: string;
  moduleName: string;
  versionName: string;
  id: string;
  txid: string;
  mimeType: string;
};

export async function createFileEntry(file: File) {
  const { data, error } = await supabase.from("File").insert(file);
  if (error) throw new Error(`File creation failed: ${error.message}`);

  return data;
}
