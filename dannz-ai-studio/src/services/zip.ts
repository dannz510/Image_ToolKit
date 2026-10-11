/**
 * Batch export helper - bundles processed images into a .zip download.
 * Uses @zip.js/zip.js (streaming, no worker needed for small batches).
 *
 * Entry names are sanitised: paths, "..", separators, control characters and
 * over-long names are stripped so an archive can never be crafted to write
 * outside its own directory when extracted (the "zip slip" class of bug).
 */

import { ZipWriter, BlobWriter, BlobReader } from "@zip.js/zip.js";

export interface ZipEntry {
  name: string;
  blob: Blob;
}

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
const MAX_NAME_LENGTH = 96;

/** Reduce an arbitrary string to a safe single-segment archive entry name. */
export function sanitizeZipEntryName(rawName: string): string {
  // Keep only the final path segment, then strip anything path-like.
  let name = rawName.split(/[/\\]/).pop() ?? "";
  // Remove control characters and Windows-reserved punctuation. (The control
  // ranges in the class are the whole point of the check.)
  // eslint-disable-next-line no-control-regex -- sanitising control chars
  name = name.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "");
  // Neutralise any remaining traversal tokens.
  name = name.replace(/\.{2,}/g, ".");
  name = name.replace(/^[.\s]+|[.\s]+$/g, "");

  const dot = name.lastIndexOf(".");
  let stem = dot > 0 ? name.slice(0, dot) : name;
  let ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";

  stem =
    stem.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, MAX_NAME_LENGTH) || "image";
  if (!ALLOWED_EXTENSIONS.includes(ext)) ext = "png";
  return `${stem}.${ext}`;
}

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const base = sanitizeZipEntryName(entry.name);
    let name = base;
    if (seen.has(base)) {
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const dot = base.lastIndexOf(".");
      name =
        dot === -1
          ? `${base}-${count}`
          : `${base.slice(0, dot)}-${count}${base.slice(dot)}`;
    } else {
      seen.set(base, 0);
    }
    await writer.add(name, new BlobReader(entry.blob));
  }

  return writer.close();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const safeName = sanitizeZipEntryName(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
