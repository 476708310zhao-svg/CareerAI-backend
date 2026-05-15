const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const PACKAGE_ROOTS = new Set(['package-ai', 'package-career', 'package-content', 'package-agency', 'package-user']);
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.wxml', '.wxss']);
const MB = 1024 * 1024;
const PACKAGE_SIZE_LIMITS = {
  main: 1.8 * MB,
  subpackage: 1.8 * MB,
};

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

function checkProjectConfig() {
  const configPath = path.join(MINI_ROOT, 'project.config.json');
  const config = readJson(configPath);
  const setting = config.setting || {};
  const issues = [];

  if (setting.urlCheck !== true) {
    issues.push('setting.urlCheck must be true before upload/review');
  }
  if (setting.uploadWithSourceMap !== false) {
    issues.push('setting.uploadWithSourceMap should be false before production upload');
  }
  if (config.compileType !== 'miniprogram') {
    issues.push('compileType should be miniprogram');
  }

  if (issues.length) {
    fail(`[miniprogram] project.config.json release settings need attention:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkRuntimeConfig() {
  const configPath = path.join(MINI_ROOT, 'utils', 'config.js');
  const source = fs.readFileSync(configPath, 'utf8');
  const issues = [];

  if (!/const\s+PROD_API_BASE_URL\s*=\s*['"]https:\/\/api\.zhiyincareer\.com['"]/.test(source)) {
    issues.push('PROD_API_BASE_URL should point to https://api.zhiyincareer.com');
  }
  for (const key of ['API_BASE_URL', 'ASSET_BASE_URL', 'CONTENT_API_BASE_URL']) {
    const pattern = new RegExp(`${key}\\s*:\\s*PROD_API_BASE_URL`);
    if (!pattern.test(source)) {
      issues.push(`${key} should use PROD_API_BASE_URL before release`);
    }
  }

  if (issues.length) {
    fail(`[miniprogram] runtime config is not release-ready:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkTabBarAssets() {
  const app = readJson(path.join(MINI_ROOT, 'app.json'));
  const missing = [];

  for (const item of (app.tabBar && app.tabBar.list) || []) {
    for (const key of ['iconPath', 'selectedIconPath']) {
      if (!item[key]) continue;
      const iconPath = path.join(MINI_ROOT, item[key]);
      if (!fs.existsSync(iconPath)) {
        missing.push(`${item.pagePath}: ${key} -> ${item[key]}`);
      }
    }
  }

  if (missing.length) {
    fail(`[miniprogram] missing tabBar assets:\n${missing.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkJsonSyntax() {
  const issues = [];

  walk(MINI_ROOT, file => {
    if (!file.endsWith('.json')) return;
    try {
      readJson(file);
    } catch (err) {
      issues.push(`${path.relative(ROOT, file)}: ${err.message}`);
    }
  });

  if (issues.length) {
    fail(`[miniprogram] invalid JSON files:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkJsSyntax() {
  const issues = [];

  walk(MINI_ROOT, file => {
    if (!file.endsWith('.js')) return;
    try {
      // Parse only. Do not execute mini program code because it depends on wx.
      // eslint-disable-next-line no-new-func
      new Function(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      issues.push(`${path.relative(ROOT, file)}: ${err.message}`);
    }
  });

  if (issues.length) {
    fail(`[miniprogram] JavaScript syntax errors:\n${issues.map(item => `  - ${item}`).join('\n')}`);
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

  const oversized = rows.filter(([name, bytes]) => {
    const limit = name === 'main' ? PACKAGE_SIZE_LIMITS.main : PACKAGE_SIZE_LIMITS.subpackage;
    return bytes > limit;
  });

  if (oversized.length) {
    fail(`[miniprogram] package size is too close to WeChat upload limits:\n${oversized.map(([name, bytes]) => `  - ${name}: ${(bytes / MB).toFixed(2)} MB`).join('\n')}`);
  }
}

checkProjectConfig();
checkRuntimeConfig();
checkJsonSyntax();
checkJsSyntax();
checkRegisteredPages();
checkTabBarAssets();
checkRelativeRequires();
checkCommonPathMistakes();
checkWxmlRiskyExpressions();
reportPackageSizes();

if (process.exitCode) {
  process.exit(process.exitCode);
}
