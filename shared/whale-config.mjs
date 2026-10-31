/**
 * 深海鲸鱼女仆 · 统一配置加载器（单机开源版）
 *
 * 所有路径、QQ 号、端口、LLM 接口都从这里读取：
 *   1) 仓库根目录 whale.config.json
 *   2) 环境变量（优先级更高，覆盖 json）
 *
 * 仓库里不再有写死的个人 QQ、服务器 IP 或绝对路径。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  ownerQq: '1000000001',
  testGroupId: '100000001',
  botQq: '1000000002',
  dataDir: './data',
  pythonBin: '',
  consolePort: 31888,
  consoleKey: 'change-me',
  memoryCorePort: 8780,
  memoryCoreToken: 'change-me',
  llm: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    visionModel: 'deepseek-chat',
    maxTokens: 2048,
  },
};

function loadFile() {
  const p = resolve(REPO_ROOT, 'whale.config.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

const fileCfg = loadFile();
const raw = {
  ...DEFAULTS,
  ...fileCfg,
  llm: { ...DEFAULTS.llm, ...(fileCfg.llm || {}) },
};

function absData(p) {
  const v = String(p || './data');
  return resolve(REPO_ROOT, v);
}

export const DATA_DIR = absData(process.env.WHALE_DATA_DIR || raw.dataDir);
export const STATE_DIR = resolve(DATA_DIR, 'state');
export const MEDIA_ROOT = resolve(DATA_DIR, 'media');
export const STICKER_DIR = resolve(MEDIA_ROOT, 'whale-stickers');
export const VIDEO_DIR = resolve(MEDIA_ROOT, 'whale-video');
export const VOICE_DIR = resolve(DATA_DIR, 'voice');
export const BACKUP_DIR = resolve(DATA_DIR, 'backups');
export const SELF_DIR = resolve(DATA_DIR, 'self');
export const PERSONA_FILE = resolve(SELF_DIR, 'persona.txt');
export const STYLE_FILE = resolve(SELF_DIR, 'style.txt');
export const MEMORY_JSON = resolve(STATE_DIR, 'memory.json');
export const OWNER_TOOLS_JSON = resolve(STATE_DIR, 'owner-tools.json');
export const BRAIN_DB = resolve(STATE_DIR, 'brain.db');
export const NEURAL_RING_JSON = resolve(STATE_DIR, 'neural-ring.json');
export const GROUP_HISTORY_JSON = resolve(STATE_DIR, 'group-history-cache.json');

export const OWNER_QQ = String(process.env.WHALE_OWNER_QQ || raw.ownerQq || DEFAULTS.ownerQq);
export const OWNER_OPENIDS = [OWNER_QQ];
export const TEST_GROUP = String(process.env.WHALE_TEST_GROUP || raw.testGroupId || DEFAULTS.testGroupId);
export const BOT_QQ = String(process.env.WHALE_BOT_QQ || raw.botQq || DEFAULTS.botQq);

export const CONSOLE_PORT = Number(process.env.WHALE_CONSOLE_PORT || raw.consolePort || 31888);
export const CONSOLE_KEY = String(process.env.WHALE_CONSOLE_KEY || raw.consoleKey || 'change-me');
export const MEMORY_PORT = Number(process.env.WHALE_MEMORY_PORT || raw.memoryCorePort || 8780);
export const MEMORY_TOKEN = String(process.env.WHALE_MEMORY_TOKEN || raw.memoryCoreToken || 'change-me');
export const MEMORY_CORE_BASE = `http://127.0.0.1:${MEMORY_PORT}`;

const llm = raw.llm || {};
export const LLM = {
  baseUrl: String(process.env.WHALE_LLM_BASE || llm.baseUrl || DEFAULTS.llm.baseUrl).replace(/\/+$/, ''),
  apiKey: String(process.env.WHALE_LLM_KEY || llm.apiKey || ''),
  model: String(process.env.WHALE_LLM_MODEL || llm.model || DEFAULTS.llm.model),
  visionModel: String(process.env.WHALE_LLM_VISION_MODEL || llm.visionModel || llm.model || DEFAULTS.llm.model),
  maxTokens: Number(process.env.WHALE_LLM_MAX_TOKENS || llm.maxTokens || DEFAULTS.llm.maxTokens),
};

function detectPython() {
  const explicit = process.env.WHALE_PYTHON || raw.pythonBin;
  if (explicit) return explicit;
  const list = [
    resolve(REPO_ROOT, '.venv', 'bin', 'python'),
    resolve(REPO_ROOT, '.venv', 'Scripts', 'python.exe'),
    '/usr/bin/python3',
    '/usr/local/bin/python3',
  ];
  for (const c of list) {
    if (existsSync(c)) return c;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}
export const PYTHON_BIN = detectPython();

/** 给 Python 脚本用的环境变量集合（保持单一配置源） */
export function pythonEnv() {
  return {
    ...process.env,
    WHALE_DATA_DIR: DATA_DIR,
    WHALE_OWNER_QQ: OWNER_QQ,
    WHALE_LLM_BASE: LLM.baseUrl,
    WHALE_LLM_KEY: LLM.apiKey,
    WHALE_LLM_MODEL: LLM.model,
    WHALE_PYTHON: PYTHON_BIN,
  };
}
