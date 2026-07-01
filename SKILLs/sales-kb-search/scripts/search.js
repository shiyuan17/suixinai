#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const allowedExtensions = new Set(['.md', '.json', '.txt']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build']);

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function tokenize(query) {
  return query
    .toLowerCase()
    .split(/[\s,.:;!?()[\]{}"']+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreLine(line, tokens) {
  const normalized = line.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += normalized.split(token).length - 1;
    }
  }
  return score;
}

function main() {
  const query = String(process.argv[2] || '').trim();
  const rootArg = String(process.argv[3] || process.env.WHATSAPP_KNOWLEDGE_ROOT || 'sales-kb').trim();
  const knowledgeRoot = path.resolve(process.cwd(), rootArg);

  if (!query) {
    console.error(JSON.stringify({ success: false, error: 'query is required' }));
    process.exit(1);
  }
  if (!fs.existsSync(knowledgeRoot) || !fs.statSync(knowledgeRoot).isDirectory()) {
    console.error(JSON.stringify({ success: false, error: `knowledge root not found: ${knowledgeRoot}` }));
    process.exit(1);
  }

  const tokens = tokenize(query);
  const results = [];

  for (const filePath of walk(knowledgeRoot)) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    const snippets = [];
    let totalScore = 0;

    lines.forEach((line, index) => {
      const score = scoreLine(line, tokens);
      if (score <= 0) return;
      totalScore += score;
      if (snippets.length < 3) {
        snippets.push({
          line: index + 1,
          text: line.trim(),
        });
      }
    });

    if (totalScore > 0) {
      results.push({
        file: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
        score: totalScore,
        snippets,
      });
    }
  }

  results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.file.localeCompare(right.file);
  });

  console.log(JSON.stringify({
    success: true,
    knowledgeRoot: path.relative(process.cwd(), knowledgeRoot).replace(/\\/g, '/'),
    query,
    results: results.slice(0, 5),
  }, null, 2));
}

main();
