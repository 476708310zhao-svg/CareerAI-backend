const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const PACKAGE_ROOTS = new Set(['package-ai', 'package-career', 'package-content', 'package-agency', 'package-user']);
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.wxml', '.wxss']);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walk(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') continue;
      walk(fullPath, visitor);
    } else {
      visitor(fullPath);
    }
  }
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function checkRegisteredPages() {
  const app = readJson(path.join(MINI_ROOT, 'app.json'));
  const missing = [];

  for (const page of app.pages || []) {
    const jsFile = path.join(MINI_ROOT, `${page}.js`);
    if (!fs.existsSync(jsFile)) missing.push(page);
  }

  for (const subPackage of app.subPackages || []) {
    for (const page of subPackage.pages || []) {
      const jsFile = path.join(MINI_ROOT, subPackage.root, `${page}.js`);
      if (!fs.existsSync(jsFile)) missing.push(`${subPackage.root}/${page}`);
    }
  }

  if (missing.length) {
    fail(`[miniprogram] app.json registers missing pages:\n${missing.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkRelativeRequires() {
  const missing = [];

  walk(MINI_ROOT, file => {
    if (!file.endsWith('.js')) return;
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
    let match;
    while ((match = requirePattern.exec(source))) {
      const request = match[1];
      if (!request.startsWith('.')) continue;
      let target = path.resolve(path.dirname(file), request);
      if (!path.extname(target)) target += '.js';
      if (!fs.existsSync(target)) {
        missing.push(`${path.relative(ROOT, file)} -> ${request}`);
      }
    }
  });

  if (missing.length) {
    fail(`[miniprogram] missing relative require targets:\n${missing.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkCommonPathMistakes() {
  const issues = [];

  walk(MINI_ROOT, file => {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) return;
    const rel = path.relative(MINI_ROOT, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    const parts = rel.split('/');
    const packageRoot = parts[0];

    if ((rel.startsWith('pages/') || rel.startsWith('components/')) && text.includes('../../../utils/')) {
      issues.push(`${rel}: main package/component should usually use ../../utils, not ../../../utils`);
    }

    if (PACKAGE_ROOTS.has(packageRoot) && text.includes('../../../../utils/')) {
      issues.push(`${rel}: subpackage path is too deep; use ../../../utils`);
    }

    for (const root of PACKAGE_ROOTS) {
      if (text.includes(`/${root}/${root}/`)) {
        issues.push(`${rel}: duplicated package root /${root}/${root}/`);
      }
    }
  });

  if (issues.length) {
    fail(`[miniprogram] common path mistakes found:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkWxmlRiskyExpressions() {
  const issues = [];
  const methodPattern = /\{\{[^}]*\.(toFixed|slice|trim|map|filter|reduce|join|split)\s*\(/;
  const brokenTagPattern = /<\/>|\?\/(text|view)>/;

  walk(MINI_ROOT, file => {
    if (!file.endsWith('.wxml')) return;
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (methodPattern.test(line)) {
        issues.push(`${rel}:${index + 1}: avoid method calls inside WXML expressions`);
      }
      if (brokenTagPattern.test(line)) {
        issues.push(`${rel}:${index + 1}: broken closing tag`);
      }
    });
  });

  if (issues.length) {
    fail(`[miniprogram] risky WXML expressions found:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function reportPackageSizes() {
  function sumFiles(dir, excludeSubpackages) {
    let total = 0;
    walk(dir, file => {
      const rel = path.relative(MINI_ROOT, file).replace(/\\/g, '/');
      if (rel.startsWith('node_modules/') || rel.startsWith('miniprogram_npm/')) return;
      if (excludeSubpackages && PACKAGE_ROOTS.has(rel.split('/')[0])) return;
      total += fs.statSync(file).size;
    });
    return total;
  }

  const rows = [
    ['main', sumFiles(MINI_ROOT, true)],
    ...Array.from(PACKAGE_ROOTS).map(root => [root, sumFiles(path.join(MINI_ROOT, root), false)]),
  ];

  console.log('[miniprogram] package size estimate excluding node_modules/miniprogram_npm:');
  for (const [name, bytes] of rows) {
    console.log(`  - ${name}: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  }
}

checkRegisteredPages();
checkRelativeRequires();
checkCommonPathMistakes();
checkWxmlRiskyExpressions();
reportPackageSizes();

if (process.exitCode) {
  process.exit(process.exitCode);
}
