import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../mobile/dist-android");
function maps(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? maps(path) : entry.isFile() && entry.name.endsWith(".map") ? [path] : [];
  });
}
type SourceMap = { sources?: string[]; sections?: Array<{ map: SourceMap }> };
function sources(map: SourceMap): string[] {
  return [...(map.sources ?? []), ...(map.sections ?? []).flatMap((section) => sources(section.map))];
}
const files = maps(root);
if (!files.length) throw new Error("Export Android with --source-maps before checking tooling exceptions.");
const sourceNames = files.flatMap((file) => sources(JSON.parse(readFileSync(file, "utf8")))).map((source) => source.replaceAll("\\", "/"));
if (!sourceNames.length) throw new Error("Release source maps contain no source evidence.");
const unexpected = sourceNames.filter((source) => /(?:^|\/)(?:node_modules\/)?(?:braces|node-forge)\//.test(source));
if (unexpected.length) throw new Error(`Tooling dependency reached Android bundle: ${unexpected.join(", ")}`);
console.log(`Android release source maps checked: ${sourceNames.length} sources; reviewed tooling dependencies absent.`);
