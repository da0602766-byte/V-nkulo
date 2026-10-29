// Static import reachability, not proof that a file can be deleted.
// Framework entries are roots. Tests and non-literal loaders require review.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, '.');
const normalize = file => path.resolve(file).replaceAll('\\', '/');
const relative = file => path.relative('.', file).replaceAll('\\', '/');
const files = new Set(parsed.fileNames.filter(f => !f.endsWith('.d.ts')).map(normalize));
const graph = new Map(), pages = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [], awaits = [];
  function visit(node) {
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
      : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require') ? node.arguments[0] : null;
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const resolved = ts.resolveModuleName(specifier.text, file, parsed.options, ts.sys).resolvedModule?.resolvedFileName;
      if (resolved && files.has(normalize(resolved))) imports.push(normalize(resolved));
    }
    if (ts.isAwaitExpression(node)) awaits.push(node.getText(ast).replace(/\s+/g, ' '));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  graph.set(file, imports);
  if (/\/page\.tsx$/.test(file)) pages.push({file: relative(file), bytes: Buffer.byteLength(source), awaits});
}
const roots = [...files].filter(file => {
  const name = relative(file);
  return /^worker\//.test(name)
    || /(^|\/)(page|layout|route|loading|error|not-found|global-error|default|template)\.[cm]?[jt]sx?$/.test(name)
    || /(^|\/)(middleware|instrumentation|instrumentation-client)\.[cm]?[jt]s$/.test(name)
    || /\.config\.[cm]?[jt]s$/.test(name);
});
const reached = new Set();
function follow(file) {
  if (reached.has(file)) return;
  reached.add(file);
  for (const dependency of graph.get(file) || []) follow(dependency);
}
roots.forEach(follow);
console.log(JSON.stringify({
  sourceFiles: files.size,
  runtimeEntries: roots.length,
  pages,
  unreachableCandidates: [...files].filter(f => relative(f).startsWith('app/') && !reached.has(f)).map(relative).sort(),
  caveat: 'Review tests, framework conventions, external integrations and computed imports before removing any candidate.',
}, null, 2));
