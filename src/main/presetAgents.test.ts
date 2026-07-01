import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getAppPath: () => '/mock' },
}));

import BetterSqlite3 from 'better-sqlite3';

import { AgentManager } from './agentManager';
import { CoworkStore } from './coworkStore';
import { setLanguage } from './i18n';
import { ALL_PRESET_AGENTS, PRESET_AGENTS, presetToCreateRequest } from './presetAgents';

let db: BetterSqlite3.Database;
let store: CoworkStore;
let agentManager: AgentManager;

function setupDb(): void {
  db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cowork_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      claude_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      pinned INTEGER NOT NULL DEFAULT 0,
      pin_order INTEGER,
      cwd TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      model_override TEXT NOT NULL DEFAULT '',
      execution_mode TEXT NOT NULL DEFAULT 'local',
      active_skill_ids TEXT,
      agent_id TEXT DEFAULT 'main',
      parent_session_id TEXT,
      forked_from_message_id TEXT,
      forked_at INTEGER,
      fork_mode TEXT NOT NULL DEFAULT 'none',
      fork_workspace_path TEXT,
      fork_git_branch TEXT,
      fork_git_base_ref TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cowork_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      sequence INTEGER,
      FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cowork_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      identity TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      working_directory TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      skill_ids TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0,
      pin_order INTEGER,
      is_default INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'custom',
      preset_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_memories (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.75,
      is_explicit INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'created',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
  `);
  store = new CoworkStore(db);
  agentManager = new AgentManager(store);
}

beforeEach(() => {
  setupDb();
  setLanguage('zh');
});

describe('preset agent aggregation', () => {
  test('keeps built-in presets and generated presets together', () => {
    expect(ALL_PRESET_AGENTS.length).toBeGreaterThan(PRESET_AGENTS.length);
    expect(ALL_PRESET_AGENTS.some(agent => agent.origin === 'built-in')).toBe(true);
    expect(ALL_PRESET_AGENTS.some(agent => agent.origin === 'agency-agents-zh')).toBe(true);
  });

  test('returns only uninstalled presets from getPresetAgents', () => {
    const preset = ALL_PRESET_AGENTS.find(agent => agent.origin === 'agency-agents-zh');
    expect(preset).toBeTruthy();

    store.createAgent({
      ...presetToCreateRequest(preset!),
      model: '',
      workingDirectory: '',
    });

    const availablePresets = agentManager.getPresetAgents();
    expect(availablePresets.some(agent => agent.id === preset!.id)).toBe(false);
  });

  test('returns installed state in getAllPresetAgents', () => {
    const preset = ALL_PRESET_AGENTS.find(agent => agent.origin === 'agency-agents-zh');
    expect(preset).toBeTruthy();

    store.createAgent({
      ...presetToCreateRequest(preset!),
      model: '',
      workingDirectory: '',
    });

    const templates = agentManager.getAllPresetAgents();
    expect(templates.find(agent => agent.id === preset!.id)?.installed).toBe(true);
  });
});
