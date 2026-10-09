'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STATE_KEY = Symbol.for('jobapp.tests.isolated-runtime.v1');
const ROOT_PREFIX = 'jobapp-test-';
const CLOSE_TIMEOUT_MS = 2000;

let runtimeState = null;

function canonical(value) {
  return path.resolve(value);
}

function systemTempRoot() {
  return fs.realpathSync.native(os.tmpdir());
}

function samePath(left, right) {
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function fileIdentity(stat) {
  const hasDevice = typeof stat.dev === 'bigint' ? stat.dev !== 0n
    : typeof stat.dev === 'number' && Number.isSafeInteger(stat.dev) && stat.dev !== 0;
  const hasInode = typeof stat.ino === 'bigint' ? stat.ino !== 0n
    : typeof stat.ino === 'number' && Number.isSafeInteger(stat.ino) && stat.ino !== 0;
  return hasDevice && hasInode ? Object.freeze({ dev: stat.dev, ino: stat.ino }) : null;
}

function createOwnedRoot() {
  const tempRoot = systemTempRoot();
  const root = canonical(fs.mkdtempSync(path.join(tempRoot, ROOT_PREFIX)));
  const rootRealpath = fs.realpathSync.native(root);
  const rootStat = fs.lstatSync(root, { bigint: true });
  const suffix = path.basename(root).slice(ROOT_PREFIX.length);

  if (!samePath(path.dirname(root), tempRoot) || !samePath(path.dirname(rootRealpath), tempRoot)) {
    throw new Error(`Isolated test runtime root is not a direct child of the system temp directory: ${root}`);
  }
  if (!path.basename(root).startsWith(ROOT_PREFIX) || suffix.length === 0) {
    throw new Error(`Isolated test runtime root has an invalid name: ${root}`);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Isolated test runtime root is not a real directory: ${root}`);
  }

  return Object.freeze({
    tempRoot,
    root,
    rootRealpath,
    identity: fileIdentity(rootStat),
  });
}

function validateOwnedRoot(ownership) {
  const currentSystemTemp = systemTempRoot();
  const root = canonical(ownership.root);
  const basename = path.basename(root);
  const suffix = basename.slice(ROOT_PREFIX.length);

  if (!samePath(ownership.tempRoot, currentSystemTemp)) {
    throw new Error('Isolated test runtime temp root no longer matches the system temp directory');
  }
  if (!samePath(path.dirname(root), ownership.tempRoot)) {
    throw new Error(`Isolated test runtime root is not a direct child of the system temp directory: ${root}`);
  }
  if (!basename.startsWith(ROOT_PREFIX) || suffix.length === 0) {
    throw new Error(`Isolated test runtime root has an invalid name: ${root}`);
  }

  let currentStat;
  try {
    currentStat = fs.lstatSync(root, { bigint: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
  if (!currentStat.isDirectory() || currentStat.isSymbolicLink()) {
    throw new Error(`Refusing to remove replaced isolated test runtime root: ${root}`);
  }

  const currentRealpath = fs.realpathSync.native(root);
  if (!samePath(currentRealpath, ownership.rootRealpath)) {
    throw new Error(`Isolated test runtime root realpath changed: ${root}`);
  }

  const currentIdentity = fileIdentity(currentStat);
  if (ownership.identity) {
    if (!currentIdentity
      || ownership.identity.dev !== currentIdentity.dev
      || ownership.identity.ino !== currentIdentity.ino) {
      throw new Error(`Isolated test runtime root identity changed: ${root}`);
    }
  }
  return true;
}

function assertEnvironment(current) {
  const expected = {
    DB_PATH: current.dbPath,
    DATA_DIR: current.dataDir,
    UPLOAD_DIR: current.uploadDir,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (!path.isAbsolute(value) || !canonical(value).startsWith(`${current.ownership.root}${path.sep}`)) {
      throw new Error(`Unsafe isolated test ${name}: ${value}`);
    }
    process.env[name] = value;
  }
  process.env.NODE_ENV = 'test';
  process.env.TEST_DB_ISOLATED = '1';
  process.env.WEB_TEST_ISOLATED = '1';
  process.env.JWT_SECRET = 'test_secret_please_do_not_use_in_production_1234567890';
  process.env.CRON_SECRET = 'smoke_cron_secret_1234567890abcdef';
  process.env.NOTIFY_EXTERNAL_DISABLED = '1';
  process.env.PAYMENT_ENABLED = 'true';
  process.env.PAYMENT_PROVIDER = 'wxpay';
  process.env.ENABLE_MOCK_PAYMENT = 'true';
  process.env.VIRTUAL_PAY_NOTIFY_TOKEN = '';
  process.env.WXPAY_MCH_ID = '';
  process.env.WXPAY_API_KEY = '';
  process.env.WXPAY_APP_ID = '';
  process.env.WXPAY_NOTIFY_URL = '';
}

function createPublicState(current) {
  return Object.freeze(Object.defineProperties({}, {
    root: { enumerable: true, get: () => current.ownership.root },
    tempRoot: { enumerable: true, get: () => current.ownership.tempRoot },
    dbPath: { enumerable: true, get: () => current.dbPath },
    dataDir: { enumerable: true, get: () => current.dataDir },
    uploadDir: { enumerable: true, get: () => current.uploadDir },
    prepared: { enumerable: true, get: () => current.prepared },
  }));
}

function install() {
  if (runtimeState) {
    validateOwnedRoot(runtimeState.ownership);
    assertEnvironment(runtimeState);
    return api;
  }

  const earlyLoadedModules = [
    require.resolve('../../db/database'),
    require.resolve('../../utils/paths'),
  ].filter(modulePath => require.cache[modulePath]);
  if (earlyLoadedModules.length > 0) {
    throw new Error(`Isolated test runtime must be installed before database/path modules: ${earlyLoadedModules.join(', ')}`);
  }

  const ownership = createOwnedRoot();
  const current = {
    ownership,
    dbPath: path.join(ownership.root, 'jobapp.sqlite'),
    dataDir: path.join(ownership.root, 'data'),
    uploadDir: path.join(ownership.root, 'uploads'),
    db: null,
    prepared: false,
    preparing: false,
    cleanupPromise: null,
    servers: new Set(),
    cleanupRegistered: new WeakSet(),
  };
  runtimeState = current;
  globalThis[STATE_KEY] = createPublicState(current);
  assertEnvironment(current);
  fs.mkdirSync(current.dataDir, { recursive: true });
  fs.mkdirSync(current.uploadDir, { recursive: true });

  process.once('exit', () => cleanupSyncBestEffort(current));
  return api;
}

function state() {
  install();
  return runtimeState;
}

function prepare() {
  const current = state();
  if (current.prepared) return current.db;
  if (current.preparing) throw new Error('Recursive isolated test runtime preparation');
  current.preparing = true;
  try {
    // database.js and v4Schema establish the legacy baseline. Every versioned
    // change, including 0007 through 0010, is applied only by the formal runner.
    const db = require('../../db/database');
    current.db = db;
    // These legacy route modules still own baseline tables required by 0001.
    // Loading them mirrors current application bootstrap without replaying any
    // versioned migration SQL outside db/migrate.js.
    require('../../routes/payment');
    require('../../routes/aggregate');
    require('../../routes/oa');
    require('../../db/v4Schema').ensureV4Schema();
    const { applyPendingMigrations, getMigrationStatus } = require('../../db/migrate');
    applyPendingMigrations(db);
    const migrationStatus = getMigrationStatus(db);
    if (migrationStatus.pending.length !== 0 || !migrationStatus.applied.some(item => item.version === '0010')) {
      throw new Error('Isolated test database did not reach migration 0010');
    }

    // Reuse the product's idempotent seed path so HTTP smoke tests see the
    // same public fixtures as a newly initialized local environment. The
    // current seed assigns demo messages/favorites to user 1 even when the
    // checked-in users fixture is empty, so reserve that demo owner first.
    db.prepare(`INSERT OR IGNORE INTO users (id, openid, nickname)
      VALUES (1, 'isolated_seed_owner', 'Isolated seed owner')`).run();
    require('../../db/seed');
    current.prepared = true;
    return db;
  } finally {
    current.preparing = false;
  }
}

function trackServer(server) {
  if (!server || typeof server.close !== 'function') {
    throw new TypeError('trackServer requires a Node HTTP server');
  }
  state().servers.add(server);
  return server;
}

async function closeServer(server) {
  if (!server) return [];
  const errors = [];
  await new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      clearTimeout(doneTimer);
      resolve();
    };
    const forceTimer = setTimeout(() => {
      try {
        server.closeAllConnections?.();
      } catch (error) {
        errors.push(error);
      }
    }, Math.floor(CLOSE_TIMEOUT_MS / 2));
    const doneTimer = setTimeout(() => {
      errors.push(new Error('Timed out while closing isolated test HTTP server'));
      finish();
    }, CLOSE_TIMEOUT_MS);
    try {
      if (!server.listening) {
        finish();
      } else {
        server.close(error => {
          if (error) errors.push(error);
          finish();
        });
      }
    } catch (error) {
      errors.push(error);
      finish();
    }
  });
  return errors;
}

function throwCleanupErrors(errors) {
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Isolated test runtime cleanup failed');
  }
}

async function cleanup() {
  const current = runtimeState;
  if (!current) return;
  if (current.cleanupPromise) return current.cleanupPromise;
  current.cleanupPromise = (async () => {
    const errors = [];
    const serverErrors = await Promise.all([...current.servers].map(closeServer));
    errors.push(...serverErrors.flat());
    current.servers.clear();

    try {
      if (current.db && current.db.open) current.db.close();
    } catch (error) {
      errors.push(error);
    }

    try {
      if (validateOwnedRoot(current.ownership)) {
        fs.rmSync(current.ownership.root, { recursive: true, force: true });
      }
    } catch (error) {
      errors.push(error);
    }

    throwCleanupErrors(errors);
  })();
  return current.cleanupPromise;
}

function cleanupSyncBestEffort(current = runtimeState) {
  if (!current) return;
  for (const server of current.servers) {
    try { server.closeAllConnections?.(); } catch (_) {}
    try { server.close(); } catch (_) {}
  }
  try {
    if (current.db && current.db.open) current.db.close();
  } catch (_) {}
  try {
    if (validateOwnedRoot(current.ownership)) {
      fs.rmSync(current.ownership.root, { recursive: true, force: true });
    }
  } catch (_) {}
}

function registerCleanup(testApi) {
  const current = state();
  if (!testApi || typeof testApi.after !== 'function') {
    throw new TypeError('registerCleanup requires node:test');
  }
  if (!current.cleanupRegistered.has(testApi)) {
    current.cleanupRegistered.add(testApi);
    testApi.after(cleanup);
  }
  return api;
}

function paths() {
  const current = state();
  return Object.freeze({
    root: current.ownership.root,
    dbPath: current.dbPath,
    dataDir: current.dataDir,
    uploadDir: current.uploadDir,
  });
}

const api = Object.freeze({ install, prepare, trackServer, cleanup, registerCleanup, paths });

module.exports = api;
