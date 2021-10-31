// Auto-generated with deno_bindgen
import { Plug } from "https://deno.land/x/plug@0.4.0/mod.ts"
function encode(v: string | Uint8Array): Uint8Array {
  if (typeof v !== "string") return v
  return new TextEncoder().encode(v)
}
const opts = {
  name: "cache",
  url: (new URL("../target/debug", import.meta.url)).toString(),
}
const _lib = await Plug.prepare(opts, {
  update_status: {
    parameters: ["buffer", "usize", "buffer", "usize"],
    result: "usize",
    nonblocking: true,
  },
  get_status: {
    parameters: ["buffer", "usize"],
    result: "u8",
    nonblocking: true,
  },
  save: {
    parameters: ["buffer", "usize", "buffer", "usize"],
    result: "usize",
    nonblocking: true,
  },
  drop_file: {
    parameters: ["buffer", "usize"],
    result: "usize",
    nonblocking: true,
  },
})
export type Progress =
  | "Started"
  | "Processing"
  | "Uploading"
  | "Done"
  | "Unknown"
export type File = {
  path: string
  size: number
  authorName: string
  moduleName: string
  versionName: string
  id: string
  mimeType: string
}
export function update_status(a0: string, a1: Progress) {
  const a0_buf = encode(a0)
  const a1_buf = encode(JSON.stringify(a1))
  return _lib.symbols.update_status(
    a0_buf,
    a0_buf.byteLength,
    a1_buf,
    a1_buf.byteLength,
  ) as Promise<number>
}
export function get_status(a0: string) {
  const a0_buf = encode(a0)
  return _lib.symbols.get_status(a0_buf, a0_buf.byteLength) as Promise<number>
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
export function drop_file(a0: string) {
  const a0_buf = encode(a0)
  return _lib.symbols.drop_file(a0_buf, a0_buf.byteLength) as Promise<number>
}
