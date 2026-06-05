import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const settingsPath = process.env.APP_SETTINGS_PATH || path.join(projectRoot, 'data', 'app-settings.json');
const THEME_MODES = new Set(['system', 'light', 'dark']);

export function readAppSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return normaliseSettings(parsed);
  } catch {
    return defaultSettings();
  }
}

export function updateAppSettings(settings) {
  const next = normaliseSettings({ ...readAppSettings(), ...settings });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function effectiveAppTheme() {
  const envTheme = normaliseTheme(process.env.APP_THEME || '');
  if (envTheme && envTheme !== 'system') return envTheme;
  return readAppSettings().theme;
}

function defaultSettings() {
  return { theme: 'system' };
}

function normaliseSettings(settings = {}) {
  return {
    theme: normaliseTheme(settings.theme) || 'system'
  };
}

function normaliseTheme(value) {
  const theme = String(value || '').toLowerCase();
  return THEME_MODES.has(theme) ? theme : '';
}
