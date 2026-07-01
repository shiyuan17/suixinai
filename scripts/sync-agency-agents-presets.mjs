#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateAgencyPresetAgents,
  renderGeneratedPresetModule,
} from './agency-agents-presets-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'src/main/generated/agencyPresetAgents.ts');

async function main() {
  const generated = await generateAgencyPresetAgents();
  const content = renderGeneratedPresetModule(generated);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, 'utf8');
  console.log(`[agency-presets] wrote ${generated.metadata.parsedCount} presets to ${outputPath}`);
}

main().catch((error) => {
  console.error('[agency-presets] sync failed:', error);
  process.exitCode = 1;
});
