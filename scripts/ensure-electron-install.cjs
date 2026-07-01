const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronDir = path.join(projectRoot, 'node_modules', 'electron');
const installScript = path.join(electronDir, 'install.js');
const pathFile = path.join(electronDir, 'path.txt');

function getPlatformPath() {
  switch (process.platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Electron builds are not available on platform: ${process.platform}`);
  }
}

function getElectronBinaryPath() {
  const platformPath = getPlatformPath();

  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, platformPath);
  }

  return path.join(electronDir, 'dist', platformPath);
}

function hasValidElectronInstall() {
  try {
    const platformPath = getPlatformPath();
    const installedPath = fs.readFileSync(pathFile, 'utf8').trim();

    return installedPath === platformPath && fs.existsSync(getElectronBinaryPath());
  } catch {
    return false;
  }
}

function findCachedElectronZip(cacheDir) {
  const entries = fs.readdirSync(cacheDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(cacheDir, entry.name);
    const zipNames = fs.readdirSync(entryPath).filter((name) => name.endsWith('.zip'));

    if (zipNames.length > 0) {
      return path.join(entryPath, zipNames[0]);
    }
  }

  return null;
}

function extractElectronZip(zipPath) {
  fs.rmSync(path.join(electronDir, 'dist'), { recursive: true, force: true });
  fs.mkdirSync(path.join(electronDir, 'dist'), { recursive: true });

  let result;
  if (process.platform === 'win32') {
    result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${path
          .join(electronDir, 'dist')
          .replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    );
  } else {
    result = spawnSync('unzip', ['-q', zipPath, '-d', path.join(electronDir, 'dist')], {
      stdio: 'inherit',
    });
  }

  if (result.status !== 0) {
    throw new Error(`Manual Electron extraction failed with exit code ${result.status ?? 'unknown'}.`);
  }

  fs.writeFileSync(pathFile, getPlatformPath());
}

function ensureElectronInstall() {
  if (!fs.existsSync(installScript)) {
    throw new Error('Electron is not installed. Run npm install first.');
  }

  if (hasValidElectronInstall()) {
    return;
  }

  const localCacheDir = path.join(projectRoot, 'node_modules', '.cache', 'electron');
  fs.mkdirSync(localCacheDir, { recursive: true });

  console.warn('[ElectronInstall] Electron binary is missing or incomplete. Reinstalling it now.');

  fs.rmSync(path.join(electronDir, 'dist'), { recursive: true, force: true });
  fs.rmSync(pathFile, { force: true });

  const result = spawnSync(process.execPath, [installScript], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      electron_config_cache: localCacheDir,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Electron install script failed with exit code ${result.status ?? 'unknown'}.`);
  }

  if (!hasValidElectronInstall()) {
    const cachedZipPath = findCachedElectronZip(localCacheDir);

    if (cachedZipPath) {
      console.warn('[ElectronInstall] Falling back to manual archive extraction.');
      extractElectronZip(cachedZipPath);
    }
  }

  if (!hasValidElectronInstall()) {
    throw new Error('Electron install completed, but the binary is still missing.');
  }

  console.log('[ElectronInstall] Electron binary is ready.');
}

try {
  ensureElectronInstall();
} catch (error) {
  console.error('[ElectronInstall] Failed to prepare Electron:', error);
  process.exit(1);
}
