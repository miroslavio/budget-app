import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesDirectory = path.resolve(__dirname, '../../config/tax-rules');

export function listTaxYears() {
  return fs
    .readdirSync(rulesDirectory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace('.json', ''))
    .sort();
}

export function loadTaxRules(taxYear) {
  if (!/^\d{4}-\d{4}$/.test(taxYear || '')) {
    throw new Error('Tax year is invalid.');
  }
  const filePath = path.join(rulesDirectory, `${taxYear}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No tax rules configured for ${taxYear}.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function latestTaxYear() {
  const years = listTaxYears();
  return years[years.length - 1];
}
