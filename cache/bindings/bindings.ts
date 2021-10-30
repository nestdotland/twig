// Auto-generated with deno_bindgen
import { Plug } from "https://deno.land/x/plug@0.4.0/mod.ts"
function encode(v: string | Uint8Array): Uint8Array {
  if (typeof v !== "string") return v
  return new TextEncoder().encode(v)
}
const opts = {
  name: "cache",
  url: "target/debug",
}
const _lib = await Plug.prepare(opts, {
  save: {
    parameters: ["buffer", "usize", "buffer", "usize"],
    result: "usize",
    nonblocking: true,
  },
})
export type File = {
  path: string
  size: number
  author_name: string
  module_name: string
  version_name: string
  id: string
  txid: string
  mime_type: string
}
export function save(a0: string, a1: File) {
  const a0_buf = encode(a0)
  const a1_buf = encode(JSON.stringify(a1))
  return _lib.symbols.save(
    a0_buf,
    a0_buf.byteLength,
    a1_buf,
    a1_buf.byteLength,
  ) as Promise<number>
}
