import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as tar from 'tar';

const AGENCY_AGENTS_ZH_REPO_TARBALL_URL = 'https://codeload.github.com/jnMetaCode/agency-agents-zh/tar.gz/refs/heads/main';

export const PresetAgentOrigin = {
  BuiltIn: 'built-in',
  AgencyAgentsZh: 'agency-agents-zh',
};

export const DIVISION_ICON_BY_SLUG = {
  'built-in': 'brain',
  academic: 'books',
  design: 'artboard',
  engineering: 'code',
  finance: 'data',
  'game-development': 'entertainment',
  gis: 'travel',
  hr: 'heart',
  legal: 'scales',
  marketing: 'creation',
  'paid-media': 'lightning',
  product: 'tag',
  'project-management': 'briefcase',
  sales: 'shopping-cart',
  security: 'scales',
  'spatial-computing': 'experiment',
  specialized: 'folder',
  strategy: 'brain',
  'supply-chain': 'shopping-cart',
  support: 'heart',
  testing: 'repair',
};

export const DIVISION_LABELS = {
  academic: { zh: '学术', en: 'Academic' },
  design: { zh: '设计', en: 'Design' },
  engineering: { zh: '工程', en: 'Engineering' },
  finance: { zh: '金融', en: 'Finance' },
  'game-development': { zh: '游戏开发', en: 'Game Development' },
  gis: { zh: '地理信息', en: 'GIS' },
  hr: { zh: '人力资源', en: 'HR' },
  legal: { zh: '法务', en: 'Legal' },
  marketing: { zh: '营销', en: 'Marketing' },
  'paid-media': { zh: '付费媒体', en: 'Paid Media' },
  product: { zh: '产品', en: 'Product' },
  'project-management': { zh: '项目管理', en: 'Project Management' },
  sales: { zh: '销售', en: 'Sales' },
  security: { zh: '安全', en: 'Security' },
  'spatial-computing': { zh: '空间计算', en: 'Spatial Computing' },
  specialized: { zh: '专项', en: 'Specialized' },
  strategy: { zh: '战略', en: 'Strategy' },
  'supply-chain': { zh: '供应链', en: 'Supply Chain' },
  support: { zh: '支持', en: 'Support' },
  testing: { zh: '测试', en: 'Testing' },
};

const DEFAULT_DIVISION = 'built-in';
const DEFAULT_IDENTITY_PREFIX = '你是';
const DEFAULT_IDENTITY_SUFFIX = '，请严格遵循下列工作方式。';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const H1_PATTERN = /^# .*(?:\r?\n)+/;
const HEADING_PATTERN = /^#+\s/;
const AGENT_FILE_PATTERN = /\.md$/i;
const NON_DIVISION_DIRS = new Set(['assets', 'examples', 'integrations', 'scripts']);
const NON_AGENT_FILES = new Set(['README.md', 'QUICKSTART.md', 'EXECUTIVE-BRIEF.md']);

export function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

export function parseFrontmatter(markdown) {
  const normalized = normalizeLineEndings(markdown);
  const match = normalized.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { data: {}, body: normalized.trim() };
  }

  const data = {};
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    data[key] = value;
  }

  return {
    data,
    body: normalized.slice(match[0].length).trim(),
  };
}

export function extractIdentity(body, name) {
  const withoutTitle = normalizeLineEndings(body).replace(H1_PATTERN, '').trim();
  const sections = withoutTitle
    .split(/\n\s*\n/g)
    .map(section => section.trim())
    .filter(Boolean);

  for (const section of sections) {
    if (!HEADING_PATTERN.test(section)) {
      return section;
    }
  }

  return `${DEFAULT_IDENTITY_PREFIX}${name}${DEFAULT_IDENTITY_SUFFIX}`;
}

export function encodePresetIcon(svg) {
  return `agent-avatar-svg:${svg}`;
}

export function resolveDivisionIcon(division) {
  return encodePresetIcon(DIVISION_ICON_BY_SLUG[division] || DIVISION_ICON_BY_SLUG[DEFAULT_DIVISION]);
}

export function resolveDivisionLabels(division) {
  const labels = DIVISION_LABELS[division];
  if (labels) return labels;

  const fallback = division
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return {
    zh: fallback || division,
    en: fallback || division,
  };
}

export function parseAgencyAgentFile({ division, fileName, markdown }) {
  const { data, body } = parseFrontmatter(markdown);
  const name = data.name?.trim() || fileName.replace(/\.md$/i, '');
  const description = data.description?.trim() || '';
  const systemPrompt = body.trim();
  const identity = extractIdentity(systemPrompt, name);
  const id = fileName.replace(/\.md$/i, '');
  const divisionLabels = resolveDivisionLabels(division);

  return {
    id,
    name,
    nameEn: name,
    description,
    descriptionEn: description,
    identity,
    identityEn: identity,
    systemPrompt,
    systemPromptEn: systemPrompt,
    icon: resolveDivisionIcon(division),
    skillIds: [],
    division,
    divisionLabel: divisionLabels.zh,
    divisionLabelEn: divisionLabels.en,
    origin: PresetAgentOrigin.AgencyAgentsZh,
  };
}

async function downloadAndExtractRepo() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agency-agents-zh-'));
  const archivePath = path.join(tempDir, 'agency-agents-zh.tar.gz');
  const response = await fetch(AGENCY_AGENTS_ZH_REPO_TARBALL_URL);
  if (!response.ok) {
    throw new Error(`Failed to download repository archive: HTTP ${response.status}`);
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(archivePath, archiveBuffer);
  await tar.x({
    file: archivePath,
    cwd: tempDir,
  });

  const entries = await fs.readdir(tempDir, { withFileTypes: true });
  const extracted = entries.find(entry => entry.isDirectory() && entry.name.startsWith('agency-agents-zh-'));
  if (!extracted) {
    throw new Error('Failed to locate extracted repository directory');
  }

  return {
    tempDir,
    repoRoot: path.join(tempDir, extracted.name),
  };
}

async function collectDivisionDirectories(repoRoot) {
  const entries = await fs.readdir(repoRoot, { withFileTypes: true });
  const divisions = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || NON_DIVISION_DIRS.has(entry.name)) continue;
    const divisionPath = path.join(repoRoot, entry.name);
    const files = await fs.readdir(divisionPath, { withFileTypes: true });
    const hasAgentFiles = files.some(file => file.isFile() && AGENT_FILE_PATTERN.test(file.name) && !NON_AGENT_FILES.has(file.name));
    if (hasAgentFiles) {
      divisions.push(entry.name);
    }
  }

  return divisions.sort();
}

async function readDivisionMetadata(repoRoot) {
  const divisionsJsonPath = path.join(repoRoot, 'divisions.json');
  try {
    const raw = await fs.readFile(divisionsJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.divisions && typeof parsed.divisions === 'object' ? parsed.divisions : null;
  } catch {
    return null;
  }
}

async function readAgencyReadmeMetadata(repoRoot) {
  const readmePath = path.join(repoRoot, 'README.md');
  const readme = await fs.readFile(readmePath, 'utf8');
  const match = readme.match(/\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/);
  return {
    readme,
    agentCountFromReadme: match ? Number.parseInt(match[1], 10) : null,
  };
}

async function readDivisionAgentFiles(repoRoot, division) {
  const divisionPath = path.join(repoRoot, division);
  const entries = await fs.readdir(divisionPath, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile() && AGENT_FILE_PATTERN.test(entry.name) && !NON_AGENT_FILES.has(entry.name))
    .map(entry => entry.name)
    .sort();

  const result = [];
  for (const fileName of files) {
    const markdown = await fs.readFile(path.join(divisionPath, fileName), 'utf8');
    result.push({ division, fileName, markdown });
  }
  return result;
}

export async function generateAgencyPresetAgents() {
  const { tempDir, repoRoot } = await downloadAndExtractRepo();

  try {
    const divisionMetadata = await readDivisionMetadata(repoRoot);
    const { readme, agentCountFromReadme } = await readAgencyReadmeMetadata(repoRoot);
    const divisions = divisionMetadata ? Object.keys(divisionMetadata).sort() : await collectDivisionDirectories(repoRoot);

    const presets = [];
    for (const division of divisions) {
      const files = await readDivisionAgentFiles(repoRoot, division);
      for (const file of files) {
        presets.push(parseAgencyAgentFile(file));
      }
    }

    presets.sort((a, b) => {
      if (a.division !== b.division) return a.division.localeCompare(b.division);
      return a.id.localeCompare(b.id);
    });

    return {
      presets,
      metadata: {
        readme,
        agentCountFromReadme,
        parsedCount: presets.length,
        divisions,
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function renderGeneratedPresetModule({ presets, metadata }) {
  const serialized = JSON.stringify(presets, null, 2);
  const readmeCountComment = metadata.agentCountFromReadme == null
    ? 'README count unavailable'
    : `README count: ${metadata.agentCountFromReadme}`;

  return `import type { PresetAgent } from '../presetAgents';

// Generated by scripts/sync-agency-agents-presets.mjs
// Source: jnMetaCode/agency-agents-zh
// ${readmeCountComment}
// Parsed count: ${metadata.parsedCount}

export const AGENCY_AGENTS_ZH_PRESET_AGENTS: PresetAgent[] = ${serialized};
`;
}
