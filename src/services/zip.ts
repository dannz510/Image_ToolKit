/**
 * Batch export helper - bundles processed images into a .zip download.
 * Uses @zip.js/zip.js (streaming, no worker needed for small batches).
 */

import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js';

export interface ZipEntry {
  name: string;
  blob: Blob;
}

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  const seen = new Map<string, number>();

  for (const entry of entries) {
    let name = entry.name;
    if (seen.has(name)) {
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      const dot = name.lastIndexOf('.');
      name = dot === -1 ? `${name}-${count}` : `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
    } else {
      seen.set(name, 0);
    }
    await writer.add(name, new BlobReader(entry.blob));
  }

  return writer.close();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
