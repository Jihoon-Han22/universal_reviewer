#!/usr/bin/env node
/**
 * Author: --export --root <original repository> [--architecture <package dir>]
 * Rebuild: --generate --catalog <style-catalog.json> --out <new CSS directory>
 * Rebuild verification: --check-generated --catalog <...> --out <...>
 * Only --export needs original src/, PostCSS and TypeScript. Other modes use Node built-ins.
 * Exports declarative CSS/JSX visual metadata, never component bodies or application JS.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing ${name} value`);
  return argv[index + 1];
};
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const digest = input => crypto.createHash('sha256').update(input).digest('hex');
const slash = value => value.split(path.sep).join('/');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async location => JSON.parse(await fs.readFile(location, 'utf8'));
const writeJson = async (location, value) => { await fs.mkdir(path.dirname(location), { recursive: true }); await fs.writeFile(location, json(value)); };
const within = (root, candidate) => {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Path escapes output root: ${candidate}`);
  return candidate;
};

// The tree retains order, duplicate declarations and nested containers. Whitespace/comments
// are non-normative; exact CSS values (including comments embedded in values) are preserved.
function semanticNode(node) {
  if (node.kind === 'declaration') return ['declaration', node.property, node.value, node.important];
  if (node.kind === 'rule') return ['rule', node.selector, node.children.map(semanticNode)];
  return ['at-rule', node.name, node.parameters, node.children ? node.children.map(semanticNode) : null];
}
function cssText(nodes, indent = '') {
  return nodes.map(node => {
    if (node.kind === 'declaration') return `${indent}${node.property}: ${node.exactValue ?? node.value}${node.important ? node.importantSyntax || ' !important' : ''};\n`;
    const prelude = node.kind === 'rule' ? node.selector : `@${node.name}${node.parameters ? ` ${node.parameters}` : ''}`;
    return node.children ? `${indent}${prelude} {\n${cssText(node.children, `${indent}  `)}${indent}}\n` : `${indent}${prelude};\n`;
  }).join('');
}
function generatedFiles(catalog) {
  if (catalog.schemaVersion !== 1 || catalog.kind !== 'portable-active-css-catalog') throw new Error('Unsupported catalog');
  const files = new Map();
  for (const source of catalog.sources) {
    if (digest(JSON.stringify(source.rules.map(semanticNode))) !== source.semanticSha256) throw new Error(`Semantic digest mismatch: ${source.id}`);
    const css = cssText(source.rules);
    if (digest(css) !== source.generatedCssSha256) throw new Error(`Generated CSS digest mismatch: ${source.id}`);
    files.set(source.outputPath, css);
  }
  const byId = new Map(catalog.sources.map(source => [source.id, source]));
  files.set('eager.css', catalog.cascade.eagerCssSourceIds.map(id => `@import url('./${byId.get(id).outputPath}');`).join('\n') + '\n');
  files.set('load-plan.json', json({
    schemaVersion: 1, catalogSha256: digest(json(catalog)),
    eager: catalog.cascade.eagerCssSourceIds.map(id => byId.get(id).outputPath),
    dynamic: catalog.cascade.dynamicBoundaries.map(boundary => ({
      ...boundary, sourcePaths: boundary.newCssSourceIds.map(id => byId.get(id).outputPath),
    })),
    isolatedDocumentStyles: catalog.sources.filter(source => source.scope !== 'parent-document').map(source => ({ sourceId: source.id, outputPath: source.outputPath, scope: source.scope, activation: source.activation })),
    fontImport: 'Original remote @import is preserved for semantic identity. In an offline browser intercept only that URL with the bundled ui/fonts/fonts.css; see VISUAL-CONTRACT.md.',
    sharedCss: 'Insert each CSS source only once. Dynamic source order is per activation; do not concatenate all lazy styles into eager.css.',
  }));
  return files;
}

async function authorExport() {
  const root = path.resolve(argument('--root', process.cwd()));
  const destination = path.resolve(argument('--architecture', path.join(root, 'architecture')));
  const require = createRequire(path.join(root, 'package.json'));
  const postcss = require('postcss');
  const ts = require('typescript');
  const packageJson = await readJson(path.join(root, 'package.json'));
  const lock = await readJson(path.join(root, 'package-lock.json'));
  const relative = absolute => slash(path.relative(root, absolute));
  const moduleId = filename => `module:${filename}`;
  const cssId = filename => `css:${filename}`;
  const modules = new Map();
  const sourceContents = new Map();
  const cssPaths = new Set();
  const line = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const location = (sf, node) => ({ line: line(sf, node), endLine: sf.getLineAndCharacterOfPosition(node.end).line + 1 });
  const localResolve = async (from, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const absolute = path.resolve(path.dirname(path.join(root, from)), specifier.split('?')[0]);
    for (const suffix of ['', '.tsx', '.ts', '.mjs', '.js', '/index.tsx', '/index.ts', '/index.mjs']) {
      const candidate = absolute + suffix;
      if ((await fs.stat(candidate).catch(() => null))?.isFile()) return relative(candidate);
    }
    throw new Error(`Unresolved local import ${from} -> ${specifier}`);
  };
  async function visit(filename) {
    if (filename.endsWith('.css')) { cssPaths.add(filename); return; }
    if (modules.has(filename)) return;
    const buffer = await fs.readFile(path.join(root, filename));
    const content = buffer.toString('utf8');
    sourceContents.set(filename, content);
    const sf = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const record = { id: moduleId(filename), sourcePath: filename, sha256: digest(buffer), bytes: buffer.length, imports: [], jsx: filename.endsWith('.tsx') };
    modules.set(filename, record);
    const pending = [];
    const inspect = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) return;
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name && clause.namedBindings.elements.every(entry => entry.isTypeOnly)) return;
        const bindings = [];
        if (clause?.name) bindings.push({ local: clause.name.text, imported: 'default' });
        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) bindings.push({ local: clause.namedBindings.name.text, imported: '*' });
          else for (const entry of clause.namedBindings.elements) if (!entry.isTypeOnly) bindings.push({ local: entry.name.text, imported: entry.propertyName?.text || entry.name.text });
        }
        pending.push({ specifier: node.moduleSpecifier.text, kind: 'static', line: line(sf, node), bindings });
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
        pending.push({ specifier: node.moduleSpecifier.text, kind: 'static', line: line(sf, node), bindings: [] });
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        pending.push({ specifier: node.arguments[0].text, kind: 'dynamic', line: line(sf, node), bindings: [] });
      }
      ts.forEachChild(node, inspect);
    };
    inspect(sf);
    pending.sort((a, b) => a.line - b.line);
    for (const item of pending) {
      const resolved = await localResolve(filename, item.specifier);
      record.imports.push({ ...item, target: resolved ? (resolved.endsWith('.css') ? cssId(resolved) : moduleId(resolved)) : null });
      if (resolved) await visit(resolved);
    }
  }
  await visit('src/main.tsx');
  const eagerVisited = new Set();
  const eagerCssSourceIds = [];
  function evaluate(filename, visited, output, cssSeen) {
    if (visited.has(filename)) return;
    visited.add(filename);
    if (filename.endsWith('.css')) {
      if (!cssSeen.has(cssId(filename))) { cssSeen.add(cssId(filename)); output.push(cssId(filename)); }
      return;
    }
    for (const edge of modules.get(filename).imports) if (edge.kind === 'static' && edge.target) evaluate(edge.target.replace(/^(module|css):/, ''), visited, output, cssSeen);
  }
  evaluate('src/main.tsx', eagerVisited, eagerCssSourceIds, new Set());
  const dynamicBoundaries = [];
  for (const record of modules.values()) for (const edge of record.imports) if (edge.kind === 'dynamic' && edge.target) {
    const result = [];
    evaluate(edge.target.replace(/^module:/, ''), new Set(eagerVisited), result, new Set(eagerCssSourceIds));
    dynamicBoundaries.push({ id: `${record.id}:dynamic:${edge.line}`, importer: record.id, line: edge.line, target: edge.target, newCssSourceIds: result });
  }
  function convertCss(rootNode, sourceId) {
    let ordinal = 0;
    function convert(node) {
      if (node.type === 'comment') return null;
      const base = { id: `${sourceId}#${String(++ordinal).padStart(5, '0')}`, order: ordinal, line: node.source.start.line, endLine: node.source.end.line };
      if (node.type === 'decl') return { ...base, kind: 'declaration', property: node.prop, value: node.value, ...(node.raws.value?.raw ? { exactValue: node.raws.value.raw } : {}), important: Boolean(node.important), ...(node.important && node.raws.important ? { importantSyntax: node.raws.important } : {}) };
      if (node.type === 'rule') return { ...base, kind: 'rule', selector: node.selector, children: node.nodes.map(convert).filter(Boolean) };
      if (node.type === 'atrule') return { ...base, kind: 'at-rule', name: node.name, parameters: node.params, ...(node.nodes ? { children: node.nodes.map(convert).filter(Boolean) } : {}) };
      throw new Error(`Unsupported CSS node ${node.type}`);
    }
    return rootNode.nodes.map(convert).filter(Boolean);
  }
  const sourceDescriptors = [...cssPaths].sort().map(filename => ({ filename, id: cssId(filename), scope: 'parent-document', outputPath: filename }));
  // Host-owned CSS template literals style an isolated iframe, not the parent document.
  // Extract through TypeScript AST, never by scanning arbitrary strings as application CSS.
  for (const record of modules.values()) {
    const content = sourceContents.get(record.sourcePath);
    const sf = ts.createSourceFile(record.sourcePath, content, ts.ScriptTarget.Latest, true, record.jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const inspect = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['previewReducedMotionCss', 'previewMotionCss'].includes(node.name.text)) {
        if (!node.initializer || !ts.isNoSubstitutionTemplateLiteral(node.initializer)) throw new Error(`Embedded style became dynamic: ${record.sourcePath}:${node.name.text}`);
        sourceDescriptors.push({ filename: record.sourcePath, id: `css:${record.sourcePath}#${node.name.text}`, scope: 'dashboard-preview-iframe', outputPath: `embedded/${node.name.text}.css`, content: node.initializer.text, parentSourceSha256: record.sha256, templateName: node.name.text, templateStartLine: line(sf, node.initializer), activation: node.name.text === 'previewReducedMotionCss' ? 'Append to iframe head when app motion OFF OR preview.job.design.motion is none. Also add trace-reduced-motion meta.' : 'Append to iframe head only when app motion ON AND preview.job.design is absent (older cached preview). A present design owns motion. Internal media conditions still apply.' });
      }
      ts.forEachChild(node, inspect);
    };
    inspect(sf);
  }
  const sources = [];
  const rulesIndex = [];
  const keyframes = [];
  const media = [];
  const totals = { cssSources: 0, rules: 0, declarations: 0, atRules: 0, keyframes: 0, importantDeclarations: 0 };
  for (const descriptor of sourceDescriptors) {
    const { filename, id } = descriptor;
    const buffer = descriptor.content === undefined ? await fs.readFile(path.join(root, filename)) : Buffer.from(descriptor.content);
    const rules = convertCss(postcss.parse(buffer.toString('utf8'), { from: filename }), id);
    const generated = cssText(rules);
    const canonical = JSON.stringify(rules.map(semanticNode));
    const reparsed = convertCss(postcss.parse(generated, { from: filename }), id);
    if (JSON.stringify(reparsed.map(semanticNode)) !== canonical) throw new Error(`Semantic roundtrip failed ${filename}`);
    const source = { id, sourcePath: filename, outputPath: descriptor.outputPath, scope: descriptor.scope, ...(descriptor.templateName ? { templateName: descriptor.templateName, templateStartLine: descriptor.templateStartLine, parentSourceSha256: descriptor.parentSourceSha256, activation: descriptor.activation, lineNumberMeaning: 'Rule line numbers are relative to the CSS template content; templateStartLine is the owning TSX provenance location.' } : {}), sha256: digest(buffer), bytes: buffer.length, semanticSha256: digest(canonical), generatedCssSha256: digest(generated), eager: eagerCssSourceIds.includes(id), importedBy: [...modules.values()].filter(module => module.imports.some(edge => edge.target === id)).map(module => module.id), rules };
    sources.push(source);
    function index(nodes, ancestry = []) {
      for (const node of nodes) {
        if (node.kind === 'declaration') { totals.declarations++; if (node.important) totals.importantDeclarations++; }
        if (node.kind === 'rule') {
          totals.rules++;
          rulesIndex.push({ id: node.id, sourceId: id, selector: node.selector, ancestorIds: ancestry.map(item => item.id), classTokens: [...new Set([...node.selector.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)].map(match => match[1]))] });
        }
        if (node.kind === 'at-rule') {
          totals.atRules++;
          if (/keyframes$/i.test(node.name)) { totals.keyframes++; keyframes.push({ id: node.id, sourceId: id, name: node.parameters, ancestorIds: ancestry.map(item => item.id) }); }
          if (node.name === 'media') media.push({ id: node.id, sourceId: id, query: node.parameters });
        }
        if (node.children) index(node.children, [...ancestry, node]);
      }
    }
    index(rules);
  }
  totals.cssSources = sources.length;
  totals.stylesheetAssets = cssPaths.size;
  totals.embeddedStyles = sourceDescriptors.length - cssPaths.size;
  async function allCss(directory) {
    const result = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) result.push(...await allCss(path.join(directory, entry.name)));
      else if (entry.name.endsWith('.css')) result.push(relative(path.join(directory, entry.name)));
    }
    return result;
  }
  const main = modules.get('src/main.tsx');
  const catalog = {
    schemaVersion: 1, kind: 'portable-active-css-catalog', generatedAt: new Date().toISOString(),
    provenance: { entry: 'src/main.tsx', entrySha256: main.sha256, packageVersion: packageJson.version, packageLockSha256: digest(await fs.readFile(path.join(root, 'package-lock.json'))), parser: { postcss: require('postcss/package.json').version, typescript: ts.version }, sourceUse: 'Original source read only at author export. Rebuild requires this catalog and the exporter in --generate mode, not original src/. Source hashes are provenance, not implementation equality requirements.' },
    semantics: { order: 'sources are sorted for lookup only. Cascade order comes from cascade.eagerCssSourceIds and actual dynamic activation. Within each source children arrays are ordered and duplicate declarations remain significant.', declarations: 'value is PostCSS semantic value; exactValue preserves raw value spelling when present. important is separate. No colors, units, shorthand values, gradients, filters, paths, timings or fallbacks are normalized.', classIndex: 'Class token index is a search aid, not a CSS selector matcher or a computed-style result. Use a browser for pseudo states, combinators, specificity, inheritance, variables and media resolution.', comments: 'Standalone CSS comments and formatting whitespace omitted. No application implementation code included.' },
    cascade: { entry: main.id, eagerCssSourceIds, explicitMainCssSourceIds: main.imports.filter(edge => edge.target?.startsWith('css:')).map(edge => edge.target), dynamicBoundaries, charcoalOverrideSourceIds: sources.filter(source => /\/charcoal-/.test(source.sourcePath)).map(source => source.id), notes: ['ES module static dependency traversal defines this source-order model. Vite may deduplicate/shared-chunk CSS; record actual link/style order in browser evidence.', 'Dynamic boundaries list CSS newly required relative to the eager baseline. Once a lazy source was loaded, it remains present; remove already-loaded sources from subsequent lists.', 'App imports some lazy-named modules eagerly through other components. Reachability, not filename or React.lazy spelling, determines eager membership.', 'Charcoal rules are ordinary CSS with many scoped high-specificity selectors and !important declarations. Do not wrap all CSS in new layers, discard earlier rules, or move all lazy CSS before charcoal.', 'External font @import is the sole CSS URL dependency in this source graph. Bundled ui/fonts preserves offline reference assets; see VISUAL-CONTRACT.md.'] },
    totals, sources, indices: { rules: rulesIndex, keyframes, media },
    excludedUnreachableCss: (await allCss(path.join(root, 'src'))).filter(filename => !cssPaths.has(filename)).sort().map(sourcePath => ({ sourcePath, reason: 'No runtime CSS import reachable from main.tsx, including local dynamic imports. Historical CSS must not be enabled by filename glob.' })),
  };
  await writeJson(path.join(destination, 'ui/style-catalog.json'), catalog);

  // TypeScript AST traversal records visual metadata, never arbitrary source lines or function bodies.
  const program = ts.createProgram({ rootNames: [...modules.keys()].filter(name => /\.(tsx?|mjs|js)$/.test(name)).map(name => path.join(root, name)), options: { jsx: ts.JsxEmit.Preserve, allowJs: true, noResolve: true, target: ts.ScriptTarget.Latest } });
  const checker = program.getTypeChecker();
  const motionAttributes = new Set('initial animate exit transition variants whileHover whileTap whileFocus whileInView whileDrag layout layoutId layoutDependency layoutScroll layoutRoot viewport drag dragConstraints dragElastic dragMomentum mode presenceAffectsLayout reducedMotion inherit'.split(' '));
  const geometryAttributes = new Set('viewBox preserveAspectRatio width height minWidth minHeight x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fillOpacity stroke strokeWidth strokeOpacity strokeDasharray strokeDashoffset strokeLinecap strokeLinejoin strokeMiterlimit opacity offset stopColor stopOpacity gradientUnits gradientTransform filter filterUnits stdDeviation result in in2 dx dy floodColor floodOpacity colorInterpolationFilters markerStart markerMid markerEnd pathLength textAnchor dominantBaseline fontSize fontWeight letterSpacing lengthAdjust textLength size absoluteStrokeWidth dataKey nameKey innerRadius outerRadius startAngle endAngle paddingAngle cornerRadius isAnimationActive animationDuration animationEasing animationBegin barSize stackId radius margin layout orientation type domain tick tickLine axisLine minTickGap cursor content position wrapperStyle contentStyle labelStyle itemStyle formatter tickFormatter name unit aspect debounce responsive rows cols wrap colSpan rowSpan'.split(' '));
  const selectorStateAttributes = new Set('hidden disabled checked selected open multiple readOnly required inert role tabIndex key'.split(' '));
  const visualComponentProperties = new Set('preview reduced reduceMotion gradient reread verify complete active kind phase status busy completed failed waiting live connectionLive focused expanded collapsed showDashboardButton'.split(' '));
  const pureCalls = new Set(['Math.max', 'Math.min', 'Math.round', 'Math.floor', 'Math.ceil', 'Number', 'String', 'Boolean', 'useId']);
  function hasJsx(node) { let yes = false; const inspect = child => { if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) yes = true; else ts.forEachChild(child, inspect); }; inspect(node); return yes; }
  function expressionRecord(sf, node) {
    if (!node) return { kind: 'boolean', value: true };
    if (ts.isStringLiteral(node)) return { kind: 'string', value: node.text };
    const actual = ts.isJsxExpression(node) ? node.expression : node;
    if (!actual) return { kind: 'empty' };
    if (hasJsx(actual)) return { kind: 'render-function', note: 'Render callback omitted; its visual JSX nodes are separately catalogued.' };
    return { kind: ts.SyntaxKind[actual.kind], expression: actual.getText(sf) };
  }
  function owner(node) {
    let current = node.parent;
    while (current) {
      if ((ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) && current.name) return current.name.text;
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
      current = current.parent;
    }
    return '<module>';
  }
  function extractClasses(sf, initializer) {
    if (!initializer) return { staticTokens: [], literalCandidates: [], dynamic: false };
    if (ts.isStringLiteral(initializer)) return { staticTokens: initializer.text.split(/\s+/).filter(Boolean), literalCandidates: initializer.text.split(/\s+/).filter(Boolean), dynamic: false };
    const strings = [];
    const inspect = node => { if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push(node.text); ts.forEachChild(node, inspect); };
    inspect(initializer);
    return { staticTokens: [], literalCandidates: [...new Set(strings.flatMap(value => value.split(/\s+/).filter(Boolean)))], dynamic: true, expression: (ts.isJsxExpression(initializer) ? initializer.expression : initializer)?.getText(sf), note: 'Literal pieces can be partial prefixes/suffixes (for example stage-). Resolve interpolation at runtime; candidate tokens are not a complete possible class set.' };
  }
  const componentSources = [];
  for (const record of modules.values()) {
    if (!record.jsx) continue;
    const sf = program.getSourceFile(path.join(root, record.sourcePath));
    if (!sf) throw new Error(`Missing TypeScript source ${record.sourcePath}`);
    const bindings = new Map(record.imports.flatMap(edge => edge.bindings.map(binding => [binding.local, { ...binding, specifier: edge.specifier, target: edge.target }])));
    const nodes = [];
    const nodeIds = new Map();
    const valueRecipes = new Map();
    const unresolved = new Set();
    function recipeAllowed(initializer) {
      if (initializer.getText(sf).length > 4000 || hasJsx(initializer)) return false;
      let allowed = true;
      const inspect = node => {
        if (ts.isBlock(node) || ts.isAwaitExpression(node) || ts.isNewExpression(node)) allowed = false;
        if (ts.isCallExpression(node)) {
          const call = node.expression.getText(sf);
          if (!pureCalls.has(call) && !/\.(map|filter|slice|replace|join|toString|padStart|toLocaleString|includes|indexOf)$/.test(call)) allowed = false;
        }
        ts.forEachChild(node, inspect);
      };
      inspect(initializer);
      return allowed;
    }
    function collectDependencies(expression) {
      if (!expression) return;
      const inspect = node => {
        if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
          const symbol = checker.getSymbolAtLocation(node);
          const declaration = symbol?.valueDeclaration;
          if (declaration && ts.isVariableDeclaration(declaration) && declaration.getSourceFile() === sf && declaration.initializer && recipeAllowed(declaration.initializer)) {
            const id = `${record.id}:value:${line(sf, declaration)}:${node.text}`;
            if (!valueRecipes.has(id)) {
              valueRecipes.set(id, { id, name: node.text, owner: owner(declaration), ...location(sf, declaration), kind: ts.SyntaxKind[declaration.initializer.kind], expression: declaration.initializer.getText(sf) });
              collectDependencies(declaration.initializer);
            }
          } else if (declaration && !ts.isImportSpecifier(declaration) && !ts.isImportClause(declaration)) unresolved.add(node.text);
        }
        ts.forEachChild(node, inspect);
      };
      inspect(expression);
    }
    const visualCalls = [];
    const inspect = node => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const id = `${record.id}:jsx:${nodes.length + 1}`;
        nodeIds.set(ts.isJsxOpeningElement(node) ? node.parent : node, id);
        let parent = node.parent;
        let parentId = null;
        while (parent) { if (nodeIds.has(parent) && nodeIds.get(parent) !== id) { parentId = nodeIds.get(parent); break; } parent = parent.parent; }
        const tag = node.tagName.getText(sf);
        const binding = bindings.get(tag.split('.')[0]);
        const attributes = [];
        let classes = { staticTokens: [], literalCandidates: [], dynamic: false };
        const spreads = [];
        for (const attribute of node.attributes.properties) {
          if (ts.isJsxSpreadAttribute(attribute)) { spreads.push(expressionRecord(sf, attribute.expression)); collectDependencies(attribute.expression); continue; }
          const name = attribute.name.getText(sf);
          if (name === 'className') classes = extractClasses(sf, attribute.initializer);
          const svg = /^[a-z]/.test(tag) && new Set(['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'defs', 'linearGradient', 'radialGradient', 'stop', 'filter', 'feGaussianBlur', 'feColorMatrix', 'feOffset', 'feBlend', 'feComposite', 'mask', 'clipPath', 'text', 'tspan', 'use']).has(tag);
          if (name === 'className' || name === 'style' || motionAttributes.has(name) || geometryAttributes.has(name) || selectorStateAttributes.has(name) || visualComponentProperties.has(name) || (svg && !name.startsWith('on')) || name === 'id' || name.startsWith('data-') || name.startsWith('aria-')) {
            attributes.push({ name, category: name === 'style' ? 'inline-style' : motionAttributes.has(name) ? 'motion' : selectorStateAttributes.has(name) || name.startsWith('aria-') ? 'selector-state-or-lifecycle' : visualComponentProperties.has(name) ? 'visual-component-property' : geometryAttributes.has(name) || svg ? 'vector-or-chart-geometry' : 'selector-hook', value: expressionRecord(sf, attribute.initializer) });
            if (attribute.initializer) collectDependencies(attribute.initializer);
          }
        }
        const candidateRules = rulesIndex.filter(rule => rule.classTokens.some(token => classes.literalCandidates.includes(token))).map(rule => rule.id);
        const conditions = [];
        const repetitions = [];
        let ancestor = node.parent;
        while (ancestor && !ts.isFunctionDeclaration(ancestor)) {
          if (ts.isConditionalExpression(ancestor)) conditions.push({ expression: ancestor.condition.getText(sf), branch: node.pos >= ancestor.whenTrue.pos && node.end <= ancestor.whenTrue.end ? 'truthy' : 'falsy' });
          if (ts.isBinaryExpression(ancestor) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(ancestor.operatorToken.kind) && ancestor.right.pos <= node.pos) conditions.push({ expression: ancestor.left.getText(sf), operator: ancestor.operatorToken.getText(sf) });
          if (ts.isCallExpression(ancestor) && ts.isPropertyAccessExpression(ancestor.expression) && ancestor.expression.name.text === 'map') {
            const callback = ancestor.arguments[0];
            repetitions.push({ collection: ancestor.expression.expression.getText(sf), parameters: callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback.parameters.map(parameter => parameter.name.getText(sf)) : [] });
            collectDependencies(ancestor.expression.expression);
          }
          ancestor = ancestor.parent;
        }
        nodes.push({ id, ...location(sf, node), owner: owner(node), tag, parentId, library: binding ? binding.target ? binding.target : binding.specifier : tag.startsWith('motion.') ? 'motion/react' : /^[a-z]/.test(tag) ? 'browser' : 'local-symbol', classes, attributes, ...(spreads.length ? { visualSpreads: spreads } : {}), ...(conditions.length ? { renderConditions: conditions } : {}), ...(repetitions.length ? { repetitions } : {}), candidateRuleIds: candidateRules });
      }
      if (ts.isCallExpression(node) && ['animate', 'useMotionValue', 'useTransform'].includes(node.expression.getText(sf))) {
        const call = { id: `${record.id}:motion-call:${line(sf, node)}`, ...location(sf, node), owner: owner(node), api: node.expression.getText(sf), arguments: node.arguments.map(argument => expressionRecord(sf, argument)) };
        visualCalls.push(call); node.arguments.forEach(collectDependencies);
      }
      // Explicitly include standalone declarative constants, even when imported into another module.
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && /^(defaultMotionTransition|ease|packetColors|PACKET_SECONDS|MAX_PACKETS|paths|colors|coordinates)$/.test(node.name.text) && recipeAllowed(node.initializer)) {
        const id = `${record.id}:value:${line(sf, node)}:${node.name.text}`;
        valueRecipes.set(id, { id, name: node.name.text, owner: owner(node), ...location(sf, node), kind: ts.SyntaxKind[node.initializer.kind], expression: node.initializer.getText(sf) });
        collectDependencies(node.initializer);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(sf);
    const parameterDefaults = [];
    const findDefaults = node => {
      if (ts.isParameter(node) || ts.isBindingElement(node)) {
        if (node.initializer && !hasJsx(node.initializer) && recipeAllowed(node.initializer)) parameterDefaults.push({ name: node.name.getText(sf), owner: owner(node), ...location(sf, node), value: expressionRecord(sf, node.initializer) });
      }
      ts.forEachChild(node, findDefaults);
    };
    findDefaults(sf);
    componentSources.push({ sourceId: record.id, sourcePath: record.sourcePath, sha256: record.sha256, eager: eagerVisited.has(record.sourcePath), cssImports: record.imports.filter(edge => edge.target?.startsWith('css:')).map(edge => edge.target), externalLibraries: [...new Set(record.imports.filter(edge => !edge.target).map(edge => edge.specifier))], nodes, parameterDefaults, valueRecipes: [...valueRecipes.values()].sort((a, b) => a.line - b.line), imperativeMotionCalls: visualCalls, runtimeBindings: [...unresolved].sort(), runtimeBindingMeaning: 'Parameters, state, imported helpers and callbacks are supplied by the independent implementation using 04-ui-motion and state/API contracts. This inventory is not executable TSX; no component body, API handler or business implementation is included. Reachable module does not prove every exported component mounts: ReviewItems is also imported only for StatusIcon/statusLabels helpers.' });
  }
  const dependencyVersions = Object.fromEntries(['react', 'react-dom', 'motion', 'lucide-react', 'recharts', 'pdfjs-dist'].map(name => [name, { declared: packageJson.dependencies[name], locked: lock.packages?.[`node_modules/${name}`]?.version ?? null }]));
  const styleMap = {
    schemaVersion: 1, kind: 'portable-component-visual-map', generatedAt: catalog.generatedAt,
    styleCatalogSha256: digest(json(catalog)), sourceGraph: [...modules.values()], dependencyVersions,
    semantics: ['Nodes describe tag/visual ownership and ancestor relationships, not complete application markup or text.', 'CSS rule references are candidate class-token matches. Compound/pseudo/global/tag selectors still apply even when absent from candidateRuleIds; all catalog rules remain normative.', 'Expressions retain original declarative spelling and units. They are reference recipes, not code to eval. Reimplement pure formulas and bind runtime identifiers to the contract state.', 'valueRecipes includes recursively referenced pure visual constants and object-return motion helpers; renderConditions/repetitions expose state and repeat context without component bodies.', 'SVG path d, gradients, stop opacity and normalization coordinates are design assets. Distinct useId-derived references must stay unique per mounted instance.', 'Inline styles override normal stylesheet declarations according to browser cascade; stylesheet !important still applies. Motion/Recharts may write runtime styles beyond JSX.', 'Libraries implement distinct renderers: Motion controls imperative/layout motion; CSS controls native keyframes; Recharts owns summary charts; native SVG owns scene art; Lucide owns icons. Dashboard iframe renderer is contracted separately.'],
    totals: { moduleSources: modules.size, jsxSources: componentSources.length, jsxNodes: componentSources.reduce((total, item) => total + item.nodes.length, 0), valueRecipes: componentSources.reduce((total, item) => total + item.valueRecipes.length, 0), imperativeMotionCalls: componentSources.reduce((total, item) => total + item.imperativeMotionCalls.length, 0) },
    components: componentSources,
  };
  await writeJson(path.join(destination, 'ui/component-style-map.json'), styleMap);
  console.log(JSON.stringify({ mode: 'export', ...catalog.totals, ...styleMap.totals, eagerCss: eagerCssSourceIds.length, dynamicBoundaries: dynamicBoundaries.length, excludedCss: catalog.excludedUnreachableCss.map(item => item.sourcePath), semanticRoundtrips: 'all CSS sources passed', output: destination }, null, 2));
}

if (argv.includes('--export')) {
  if (argv.includes('--generate') || argv.includes('--check-generated')) throw new Error('Choose one mode');
  await authorExport();
} else if (argv.includes('--generate') || argv.includes('--check-generated')) {
  const catalogPath = path.resolve(argument('--catalog', path.join(scriptDirectory, '../ui/style-catalog.json')));
  const output = argument('--out');
  if (!output) throw new Error('--out is required; write into a new directory, not the source repository');
  const outputRoot = path.resolve(output);
  const catalog = await readJson(catalogPath);
  const files = generatedFiles(catalog);
  for (const [name, content] of files) {
    const filename = within(outputRoot, path.resolve(outputRoot, name));
    if (argv.includes('--check-generated')) {
      if (await fs.readFile(filename, 'utf8') !== content) throw new Error(`Generated file mismatch: ${name}`);
    } else {
      await fs.mkdir(path.dirname(filename), { recursive: true });
      // Existing generated files may be refreshed; unrelated files are never removed.
      await fs.writeFile(filename, content);
    }
  }
  console.log(JSON.stringify({ mode: argv.includes('--check-generated') ? 'check-generated' : 'generate', cssSources: catalog.sources.length, files: files.size, output: outputRoot, originalSourceRequired: false, externalPackagesRequired: false, result: 'PASS' }, null, 2));
} else {
  console.log('Author: node export-visual-contract.mjs --export --root <original repo> [--architecture <package dir>]\nRebuild: node export-visual-contract.mjs --generate --catalog <style-catalog.json> --out <new directory>\nVerify: node export-visual-contract.mjs --check-generated --catalog <style-catalog.json> --out <generated directory>');
}
