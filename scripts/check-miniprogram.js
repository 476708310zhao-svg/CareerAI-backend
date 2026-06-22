const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const PACKAGE_ROOTS = new Set(['skills', 'package-ai', 'package-career', 'package-content', 'package-agency', 'package-user']);
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.wxml', '.wxss']);
const MB = 1024 * 1024;
const PACKAGE_SIZE_LIMITS = {
  main: 1.5 * MB,
  subpackage: 1.8 * MB,
};
const MEDIA_SIZE_LIMIT = 200 * 1024;
const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.mp4', '.wav', '.aac', '.m4a']);

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
  if (config.lazyCodeLoading !== undefined) {
    issues.push('lazyCodeLoading belongs in app.json, not project.config.json');
  }

  if (issues.length) {
    fail(`[miniprogram] project.config.json release settings need attention:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkAppReleaseConfig() {
  const app = readJson(path.join(MINI_ROOT, 'app.json'));
  const issues = [];

  if (app.lazyCodeLoading !== 'requiredComponents') {
    issues.push('app.json should enable lazyCodeLoading: requiredComponents for component lazy injection');
  }

  if (issues.length) {
    fail(`[miniprogram] app.json release settings need attention:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function checkRuntimeConfig() {
  const configPath = path.join(MINI_ROOT, 'utils', 'app-config.js');
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

function checkDemoDataBoundary() {
  const issues = [];
  const allowed = new Set([
    'utils/demo-data.js',
    'utils/question-bank.js',
    'utils/mock-data.js',
  ]);

  walk(MINI_ROOT, file => {
    if (!file.endsWith('.js')) return;
    const rel = path.relative(MINI_ROOT, file).replace(/\\/g, '/');
    if (allowed.has(rel)) return;
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    if (/require\(['"][^'"]*mock-data(?:\.js)?['"]\)/.test(source)) {
      issues.push(`${rel}: import demo fixtures through utils/demo-data.js, or curated content through utils/question-bank.js`);
    }
  });

  if (issues.length) {
    fail(`[miniprogram] demo fixture boundary violations:\n${issues.map(item => `  - ${item}`).join('\n')}`);
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

function normalizeAppPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOwningSubPackage(app, relPath) {
  return (app.subPackages || []).find(subPackage => {
    const root = normalizeAppPath(subPackage.root);
    return relPath === root || relPath.startsWith(`${root}/`);
  });
}

function checkAgentSkillManifests() {
  const app = readJson(path.join(MINI_ROOT, 'app.json'));
  const ignoreRules = getPackIgnoreRules();
  const agent = app.agent || {};
  const declaredSkills = Array.isArray(agent.skills) ? agent.skills : [];
  const declaredPaths = new Set(declaredSkills.map(skill => normalizeAppPath(skill.path)).filter(Boolean));
  const skillsDir = path.join(MINI_ROOT, 'skills');
  const diskSkillPaths = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `skills/${entry.name}`)
    : [];
  const issues = [];

  if (!declaredSkills.length) return;

  for (const diskSkillPath of diskSkillPaths) {
    if (!declaredPaths.has(diskSkillPath)) {
      issues.push(`${diskSkillPath}: skill directory is not declared in app.json agent.skills`);
    }
  }

  for (const field of [
    ['instruction', 10000],
    ['pageMetadata', 8000],
  ]) {
    const [name, maxBytes] = field;
    const rel = normalizeAppPath(agent[name]);
    if (!rel) continue;
    const fullPath = path.join(MINI_ROOT, rel);
    if (!fs.existsSync(fullPath)) {
      issues.push(`agent.${name}: missing ${rel}`);
    } else if (isPackIgnored(rel, ignoreRules)) {
      issues.push(`agent.${name}: ${rel} is ignored by project.config.json packOptions`);
    } else {
      const size = fs.statSync(fullPath).size;
      if (size > maxBytes) issues.push(`agent.${name}: ${rel} exceeds ${maxBytes} bytes`);
    }
  }

  for (const skill of declaredSkills) {
    const skillPath = normalizeAppPath(skill.path);

    if (!skill.name) {
      issues.push(`${skillPath || '<unnamed skill>'}: missing name`);
    }
    if (!skill.description) {
      issues.push(`${skill.name || skillPath || '<unnamed skill>'}: missing description`);
    }
    if (!skillPath) {
      issues.push(`${skill.name || '<unnamed skill>'}: missing path`);
      continue;
    }

    if (isPackIgnored(skillPath, ignoreRules)) {
      issues.push(`${skillPath}: ignored by project.config.json packOptions`);
    }

    const owningSubPackage = findOwningSubPackage(app, skillPath);
    if (!owningSubPackage) {
      issues.push(`${skillPath}: must be inside a declared independent subPackage`);
    } else if (owningSubPackage.independent !== true) {
      issues.push(`${skillPath}: owning subPackage "${owningSubPackage.root}" must set independent: true`);
    }

    const skillRoot = path.join(MINI_ROOT, skillPath);
    if (!fs.existsSync(skillRoot)) {
      issues.push(`${skillPath}: missing skill directory`);
      continue;
    }

    const docPath = path.join(skillRoot, 'SKILL.md');
    if (!fs.existsSync(docPath)) {
      issues.push(`${skillPath}: missing SKILL.md`);
    }

    const indexPath = path.join(skillRoot, 'index.js');
    let indexSource = '';
    if (!fs.existsSync(indexPath)) {
      issues.push(`${skillPath}: missing index.js`);
    } else {
      indexSource = fs.readFileSync(indexPath, 'utf8');
      const createSkillPattern = new RegExp(`wx\\.modelContext\\.createSkill\\(\\s*['"]${escapeRegExp(skillPath)}['"]\\s*\\)`);
      if (!createSkillPattern.test(indexSource)) {
        issues.push(`${skillPath}/index.js: must register with wx.modelContext.createSkill('${skillPath}')`);
      }
    }

    const manifestPath = path.join(skillRoot, 'mcp.json');
    if (!fs.existsSync(manifestPath)) {
      issues.push(`${skillPath}: missing mcp.json`);
      continue;
    }

    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch (err) {
      issues.push(`${skillPath}/mcp.json: ${err.message}`);
      continue;
    }

    if (!Array.isArray(manifest.apis) || !manifest.apis.length) {
      issues.push(`${skillPath}/mcp.json: missing apis`);
    }

    (manifest.apis || []).forEach((api, index) => {
      if (!api.name) {
        issues.push(`${skillPath}/mcp.json apis[${index}]: missing name`);
        return;
      }
      if (!api.description) issues.push(`${skillPath}/mcp.json apis[${index}]: missing description`);
      if (!api.inputSchema) issues.push(`${skillPath}/mcp.json apis[${index}]: missing inputSchema`);
      if (!api.outputSchema) issues.push(`${skillPath}/mcp.json apis[${index}]: missing outputSchema`);

      const apiFile = path.join(skillRoot, 'apis', `${api.name}.js`);
      if (!fs.existsSync(apiFile)) issues.push(`${skillPath}: missing apis/${api.name}.js`);
      const registerPattern = new RegExp(`registerAPI\\(\\s*['"]${escapeRegExp(api.name)}['"]`);
      if (indexSource && !registerPattern.test(indexSource)) {
        issues.push(`${skillPath}/index.js: does not register API ${api.name}`);
      }
    });

    (manifest.components || []).forEach((component, index) => {
      if (!component.path) {
        issues.push(`${skillPath}/mcp.json components[${index}]: missing path`);
      } else {
        const componentJson = path.join(skillRoot, `${component.path}.json`);
        if (!fs.existsSync(componentJson)) {
          issues.push(`${skillPath}/mcp.json components[${index}]: missing component ${component.path}.json`);
        }
      }
      if (!component.relatedPage) {
        issues.push(`${skillPath}/mcp.json components[${index}]: missing relatedPage`);
      }
    });
  }

  if (issues.length) {
    fail(`[miniprogram] invalid agent skill manifests:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function getPackIgnoreRules() {
  const projectConfig = readJson(path.join(MINI_ROOT, 'project.config.json'));
  const ignore = (projectConfig.packOptions && projectConfig.packOptions.ignore) || [];
  return {
    folders: new Set(
      ignore
        .filter(item => item.type === 'folder')
        .map(item => item.value.replace(/\\/g, '/').replace(/\/$/, ''))
    ),
    regexps: ignore
      .filter(item => item.type === 'regexp')
      .map(item => new RegExp(item.value)),
  };
}

function isPackIgnored(rel, rules) {
  return (
    Array.from(rules.folders).some(folder => rel === folder || rel.startsWith(`${folder}/`)) ||
    rules.regexps.some(pattern => pattern.test(rel))
  );
}

function checkMediaAssetSizes() {
  const issues = [];
  const ignoreRules = getPackIgnoreRules();

  walk(MINI_ROOT, file => {
    const ext = path.extname(file).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) return;

    const rel = path.relative(MINI_ROOT, file).replace(/\\/g, '/');
    if (isPackIgnored(rel, ignoreRules)) return;

    const size = fs.statSync(file).size;
    if (size > MEDIA_SIZE_LIMIT) {
      issues.push(`${rel}: ${(size / 1024).toFixed(1)} KB`);
    }
  });

  if (issues.length) {
    fail(`[miniprogram] media assets must be <= 200 KB:\n${issues.map(item => `  - ${item}`).join('\n')}`);
  }
}

function reportPackageSizes() {
  const ignoreRules = getPackIgnoreRules();

  function sumFiles(dir, excludeSubpackages) {
    let total = 0;
    walk(dir, file => {
      const rel = path.relative(MINI_ROOT, file).replace(/\\/g, '/');
      if (isPackIgnored(rel, ignoreRules)) return;
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
checkAppReleaseConfig();
checkRuntimeConfig();
checkJsonSyntax();
checkJsSyntax();
checkRegisteredPages();
checkTabBarAssets();
checkRelativeRequires();
checkCommonPathMistakes();
checkDemoDataBoundary();
checkWxmlRiskyExpressions();
checkAgentSkillManifests();
checkMediaAssetSizes();
reportPackageSizes();

if (process.exitCode) {
  process.exit(process.exitCode);
}
