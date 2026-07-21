import fs from "node:fs";
import { ZipArchive, type ArchiverError } from "archiver";

/**
 * Zips `srcDir` into `outPath`, nesting its contents under `rootName/` inside
 * the archive. Uses the "store" method (no compression) — playlist media is
 * already compressed, so deflating it just burns CPU for no size win.
 *
 * Resolves with the byte size of the finished archive.
 */
export function zipDirectory(srcDir: string, outPath: string, rootName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = new ZipArchive({ store: true });

    output.on("close", () => resolve(archive.pointer()));
    output.on("error", reject);
    archive.on("warning", (err: ArchiverError) => {
      if (err.code !== "ENOENT") reject(err);
    });
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(srcDir, rootName);
    void archive.finalize();
  });
}
