import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "static/vendor/article-visuals");
const licenseDirectory = join(output, "licenses");
await mkdir(licenseDirectory, { recursive: true });
const packages = new Set();
const packageMetadata = new Map();
async function packageSideEffects(path) {
  const normalized = path.replaceAll("\\", "/");
  const match = normalized.match(/^(.*\/node_modules\/((?:@[^/]+\/)?[^/]+))\/(.*)$/);
  if (!match) return true;
  const directory = match[1], relative = match[3];
  if (!packageMetadata.has(directory)) packageMetadata.set(directory, JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
  const value = packageMetadata.get(directory).sideEffects;
  if (typeof value === "boolean") return value;
  if (!Array.isArray(value)) return true;
  return value.some((pattern) => {
    const expression = pattern.replace(/^\.\//, "").split("**").map(part => part.split("*").map(segment => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*");
    return new RegExp(`^${expression}$`).test(relative);
  });
}
// Resolve installed modules through Node, then give esbuild their contents.
// This also works in Windows sandboxes that cannot enumerate drive ancestors.
const localModules = {
  name: "installed-modules",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      const importer = args.importer && args.namespace === "installed" ? args.importer : join(root, "package.json");
      const path = createRequire(importer).resolve(args.path);
      if (!path.startsWith(join(root, "node_modules") + "/") && !path.startsWith(join(root, "node_modules") + "\\")) throw new Error(`Dependency outside node_modules: ${args.path}`);
      return { path, namespace: "installed", sideEffects: await packageSideEffects(path) };
    });
    build.onLoad({ filter: /.*/, namespace: "installed" }, async (args) => ({
      contents: await readFile(args.path, "utf8"), loader: args.path.endsWith(".json") ? "json" : "js",
    }));
  },
};
const entries = {
  markmap: 'export { Markmap } from "markmap-view";',
  echarts: `import { use } from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent, LegendComponent, AriaComponent, GraphicComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
use([PieChart, TooltipComponent, LegendComponent, AriaComponent, GraphicComponent, SVGRenderer]);
export { init } from "echarts/core";`,
};
const manifest = { generatedBy: "npm run build:visuals", delivery: "Self-hosted ES modules; no runtime CDN or data requests", bundles: {}, licenses: [] };
for (const [name, contents] of Object.entries(entries)) {
  const result = await build({
    absWorkingDir: root,
    stdin: { contents, resolveDir: root, sourcefile: `${name}-entry.mjs`, loader: "js" },
    outfile: join(output, `${name}.js`),
    bundle: true, format: "esm", platform: "browser", target: ["es2020"], minify: true,
    legalComments: "external", metafile: true, charset: "utf8", logLevel: "warning", tsconfigRaw: {}, preserveSymlinks: true,
    plugins: [localModules],
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const match = input.replaceAll("\\", "/").match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) packages.add(match[1]);
  }
  manifest.bundles[`${name}.js`] = { bytes: (await readFile(join(output, `${name}.js`))).length };
  const legalPath = join(output, `${name}.js.LEGAL.txt`);
  await writeFile(legalPath, (await readFile(legalPath, "utf8")).replace(/[ \t]+$/gm, ""));
}
for (const name of [...packages].sort()) {
  const directory = join(root, "node_modules", name);
  const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  const files = (await readdir(directory)).filter((file) => /^(license|licence|copying|notice)(\..*)?$/i.test(file));
  if (!files.length) throw new Error(`No license file found for ${name}`);
  const saved = [];
  for (const file of files) {
    const filename = `${name.replaceAll("/", "-").replaceAll("@", "")}-${file}.txt`;
    await writeFile(join(licenseDirectory, filename), await readFile(join(directory, file)));
    saved.push(`licenses/${filename}`);
  }
  manifest.licenses.push({ name, version: metadata.version, license: metadata.license, files: saved });
}
await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(output, "README.txt"), "Self-hosted third-party modules for DEX Research article graphics.\nRebuild with npm ci && npm run build:visuals.\nPinned package versions and integrity hashes are in package-lock.json.\nSee manifest.json, *.LEGAL.txt and licenses/ for versions and license notices.\nThese committed files let Hugo publish the site without npm or remote module loading.\n");
console.log(JSON.stringify(manifest.bundles, null, 2));
