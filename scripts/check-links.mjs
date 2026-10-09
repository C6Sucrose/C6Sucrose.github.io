import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { parse } from 'parse5';

const root = resolve('dist');
const origin = 'https://c6sucrose.github.io';
const failures = [];
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files;
}
const files = await walk(root);
const documents = new Map();
function nodes(node, output = []) {
  output.push(node);
  for (const child of node.childNodes ?? []) nodes(child, output);
  return output;
}
for (const file of files.filter(path => path.endsWith('.html'))) {
  const all = nodes(parse(await readFile(file, 'utf8')));
  const ids = all.flatMap(node => (node.attrs ?? []).filter(attr => attr.name === 'id').map(attr => attr.value));
  if (new Set(ids).size !== ids.length) failures.push(`${relative(root, file)}: duplicate IDs`);
  if (all.filter(node => node.tagName === 'h1').length !== 1) failures.push(`${relative(root, file)}: expected one H1`);
  documents.set(file, { all, ids: new Set(ids) });
}
let checked = 0;
for (const [file, doc] of documents) {
  const pathname = '/' + relative(root, file).split(sep).join('/');
  for (const node of doc.all) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name, attr.value]));
    const values = ['href','src'].flatMap(key => attrs[key] ? [attrs[key]] : []);
    if (node.tagName === 'meta' && attrs.property === 'og:image') values.push(attrs.content);
    for (const value of values) {
      const url = new URL(value, origin + pathname);
      if (url.origin !== origin) continue;
      checked++;
      let path = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (path !== root && !path.startsWith(root + sep)) { failures.push(`${pathname}: path escapes build root: ${value}`); continue; }
      try {
        const info = await stat(path);
        if (info.isDirectory()) path = join(path, 'index.html');
        await stat(path);
      } catch { failures.push(`${pathname}: missing ${value}`); continue; }
      if (url.hash && documents.has(path) && !documents.get(path).ids.has(decodeURIComponent(url.hash.slice(1)))) failures.push(`${pathname}: missing fragment ${value}`);
    }
  }
}
const projectPaths = [...documents.keys()].filter(path => path.includes(`${sep}projects${sep}`));
if (projectPaths.length !== 3) failures.push(`Expected exactly three case studies, found ${projectPaths.length}`);
const home = documents.get(join(root, 'index.html'));
const projectNodes = home?.all.filter(node => node.attrs?.some(attr => attr.name === 'data-project')) ?? [];
if (projectNodes.length !== 7) failures.push(`Expected seven homepage projects, found ${projectNodes.length}`);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Checked ${checked} local links/assets across ${documents.size} HTML pages; 7 projects, 3 case studies, no broken links or duplicate IDs.`);
