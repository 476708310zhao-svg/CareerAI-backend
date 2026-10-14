'use strict';

const fs = require('fs');
const path = require('path');
const automator = require('miniprogram-automator');
const { compareImages } = require('./visual-diff');

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function mergedConfig(manifest, screen) {
  return {
    ...manifest.defaults,
    ...screen,
    crop: { ...manifest.defaults.crop, ...(screen.crop || {}) },
    masks: [...(manifest.defaults.masks || []), ...(screen.masks || [])]
  };
}

async function navigate(miniProgram, config) {
  if (config.navigation === 'switchTab') return miniProgram.switchTab(config.route);
  if (config.navigation === 'navigateTo') return miniProgram.navigateTo(config.route);
  if (config.navigation === 'reLaunch') return miniProgram.reLaunch(config.route);
  throw new Error(`Unsupported navigation method: ${config.navigation}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skillRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(args['project-root'] || process.cwd());
  const manifest = JSON.parse(fs.readFileSync(path.join(skillRoot, 'references', 'screens.json'), 'utf8'));
  const ids = args.screen === 'all' ? Object.keys(manifest.screens) : [args.screen];
  if (!args.screen || ids.some(id => !manifest.screens[id])) {
    throw new Error(`Use --screen with one of: ${Object.keys(manifest.screens).join(', ')}, all`);
  }

  const noCapture = Boolean(args['no-capture']);
  if (noCapture && ids.length !== 1) throw new Error('--no-capture supports one screen at a time');
  if (noCapture && !args.actual) throw new Error('--no-capture requires --actual <png>');

  let miniProgram = null;
  const results = [];
  try {
    if (!noCapture) {
      console.error('[visual-gate] connecting to Developer Tools automation');
      miniProgram = await withTimeout(
        automator.connect({ wsEndpoint: args.ws || 'ws://127.0.0.1:9420' }),
        15000,
        'Developer Tools connection'
      );
      const systemInfo = await withTimeout(miniProgram.systemInfo(), 8000, 'viewport inspection');
      if (systemInfo.windowWidth !== manifest.viewport.width || systemInfo.windowHeight !== manifest.viewport.height) {
        throw new Error(`Viewport must be ${manifest.viewport.width}x${manifest.viewport.height}; received ${systemInfo.windowWidth}x${systemInfo.windowHeight}`);
      }
    }

    for (const id of ids) {
      const config = mergedConfig(manifest, manifest.screens[id]);
      const outputDir = path.join(projectRoot, 'artifacts', 'visual-regression', id);
      fs.mkdirSync(outputDir, { recursive: true });
      const actualPath = noCapture ? path.resolve(args.actual) : path.join(outputDir, 'actual.png');
      if (!noCapture) {
        console.error(`[visual-gate] navigating ${id} -> ${config.route}`);
        const currentPage = await withTimeout(miniProgram.currentPage(), 8000, `${id} current-page inspection`);
        const expectedPath = config.route.split('?')[0].replace(/^\//, '');
        const page = currentPage && currentPage.path === expectedPath
          ? currentPage
          : await withTimeout(navigate(miniProgram, config), 15000, `${id} navigation`);
        await page.waitFor(Number(args.wait || config.waitMs));
        if (config.fixture) {
          console.error(`[visual-gate] applying stable ${id} fixture`);
          const fixtureResult = await withTimeout(
            miniProgram.evaluate(fixture => new Promise(resolve => {
              const pages = getCurrentPages();
              const current = pages[pages.length - 1];
              if (!current) throw new Error('No current page for visual fixture');
              if (current._visualOriginalSetData) current.setData = current._visualOriginalSetData;
              const originalSetData = current.setData;
              const applyData = originalSetData.bind(current);
              current._visualOriginalSetData = originalSetData;
              current._visualOriginalData = Object.keys(fixture).reduce((snapshot, key) => {
                snapshot[key] = current.data[key];
                return snapshot;
              }, {});
              current._visualRuntimeState = { visible: current._visible, unloaded: current._unloaded };
              current._visible = false;
              current._unloaded = true;
              current._todayTaskRequestId = (current._todayTaskRequestId || 0) + 1;
              current._workbenchReportRequestId = (current._workbenchReportRequestId || 0) + 1;
              current._recommendRequestId = (current._recommendRequestId || 0) + 1;
              clearTimeout(current._initialRecommendTimer);
              const scalarFixture = {};
              const arrayReset = {};
              const arrayItems = {};
              Object.entries(fixture).forEach(([key, value]) => {
                if (!Array.isArray(value)) {
                  scalarFixture[key] = value;
                  return;
                }
                arrayReset[key] = [];
                value.forEach((item, index) => {
                  arrayItems[`${key}[${index}]`] = item;
                });
              });
              const finalizeFixture = () => {
                const lockedKeys = new Set(Object.keys(fixture));
                current.setData = (patch, callback) => {
                  const filtered = Object.keys(patch || {}).reduce((result, key) => {
                    const rootKey = key.split(/[.[]/, 1)[0];
                    if (!lockedKeys.has(rootKey)) result[key] = patch[key];
                    return result;
                  }, {});
                  return applyData(filtered, callback);
                };
                resolve({
                  route: current.route,
                  taskCount: (current.data.todaySecondaryTasks || []).length,
                  recommendationCount: (current.data.recommendJobs || []).length
                });
              };
              applyData({ ...scalarFixture, ...arrayReset }, () => {
                if (Object.keys(arrayItems).length) applyData(arrayItems, finalizeFixture);
                else finalizeFixture();
              });
            }), config.fixture),
            8000,
            `${id} fixture`
          );
          console.error(`[visual-gate] fixture state ${JSON.stringify(fixtureResult)}`);
          await page.waitFor(Number(config.fixtureWaitMs || 700));
        }
        console.error(`[visual-gate] capturing ${id} at ${manifest.viewport.width}x${manifest.viewport.height}`);
        await withTimeout(
          miniProgram.screenshot({ path: actualPath }),
          Number(args.screenshotTimeout || 30000),
          `${id} screenshot`
        );
        if (config.fixture) {
          await withTimeout(
            miniProgram.evaluate(() => new Promise(resolve => {
              const pages = getCurrentPages();
              const current = pages[pages.length - 1];
              if (!current || !current._visualOriginalSetData) return resolve(false);
              const originalSetData = current._visualOriginalSetData;
              const originalData = current._visualOriginalData || {};
              const runtimeState = current._visualRuntimeState || {};
              current.setData = originalSetData;
              delete current._visualOriginalSetData;
              delete current._visualOriginalData;
              delete current._visualRuntimeState;
              current._visible = runtimeState.visible;
              current._unloaded = runtimeState.unloaded;
              originalSetData.call(current, originalData, () => resolve(true));
            })),
            8000,
            `${id} fixture restore`
          );
        }
      }
      console.error(`[visual-gate] comparing ${id}`);
      const report = compareImages({
        baselinePath: path.join(skillRoot, config.baseline),
        actualPath,
        outputDir,
        viewport: manifest.viewport,
        baselineCrop: config.crop,
        masks: config.masks,
        pixelThreshold: config.pixelThreshold,
        maxDiffRatio: config.maxDiffRatio,
        maxGlobalShiftPx: config.maxGlobalShiftPx
      });
      results.push({ screen: id, outputDir, ...report });
    }
  } finally {
    if (miniProgram) miniProgram.disconnect();
  }

  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 2;
}

main().catch(error => {
  console.error(`[visual-gate] ${error.message}`);
  process.exit(1);
});
