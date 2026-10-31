import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  DATA_DIR, STATE_DIR, MEDIA_ROOT, STICKER_DIR, VOICE_DIR, VIDEO_DIR, BACKUP_DIR,
  MEMORY_JSON, OWNER_TOOLS_JSON, NEURAL_RING_JSON, BRAIN_DB, PERSONA_FILE, STYLE_FILE,
  SELF_DIR, OWNER_QQ, TEST_GROUP, CONSOLE_PORT, CONSOLE_KEY, MEMORY_TOKEN,
  MEMORY_CORE_BASE, LLM, PYTHON_BIN,
} from '../shared/whale-config.mjs';

const execFileAsync = promisify(execFile);

const PORT = CONSOLE_PORT;
const ACCESS_KEY = CONSOLE_KEY;
const POLICY_DIR = DATA_DIR;
const STICKER_CAT = resolve(SELF_DIR, 'sticker-catalogue.json');
const MEME_LIB = resolve(SELF_DIR, 'meme-library.json');
const PERSONA_V2 = PERSONA_FILE;
const STYLE_V2 = STYLE_FILE;
const UI_HTML = resolve(import.meta.dirname, 'index.html');
const RING_FILE = NEURAL_RING_JSON;
const MEMORY_FILE = MEMORY_JSON;
const OWNER_FILE = OWNER_TOOLS_JSON;

function readJsonSafe(file, fallback = {}) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
}

function parseUserKey(rawKey) {
  const parts = String(rawKey).split(':');
  const uid = parts[parts.length - 1] || '';
  const gIdx = parts.indexOf('group');
  const group = gIdx >= 0 && parts[gIdx + 1] ? parts[gIdx + 1] : (rawKey.includes(':private:') ? '私聊' : '全局');
  return { uid, group };
}

function buildNeuralRingSnapshot() {
  const mem = readJsonSafe(MEMORY_FILE, {});
  const ownerStore = readJsonSafe(OWNER_FILE, { friends: {}, drafts: {}, reminders: [], gossips: [] });
  const ringLog = readJsonSafe(RING_FILE, { totalRecalls: 42, pulses: [] });
  const memeLib = readJsonSafe(MEME_LIB, { memes: [] });

  const clusters = {
    EPISODIC: { id: 'EPISODIC', name: 'EPISODIC', cn: '情景 · 谁在哪儿说了什么', color: '#38bdf8', items: [], hits: 26 },
    SEMANTIC: { id: 'SEMANTIC', name: 'SEMANTIC', cn: '语义 · 事实与群黑话概念', color: '#2dd4bf', items: [], hits: 14 },
    PROCEDURAL: { id: 'PROCEDURAL', name: 'PROCEDURAL', cn: '程序 · 怎么做，SOP 与剧本', color: '#eab308', items: [], hits: 8 },
    PREF: { id: 'PREF', name: 'PREF', cn: '偏好 · 口味、语气、表情习惯', color: '#f97316', items: [], hits: 19 },
    PROSPECT: { id: 'PROSPECT', name: 'PROSPECT', cn: '前瞻 · 将来要做的，到期提醒', color: '#a855f7', items: [], hits: 6 },
    SCHEMA: { id: 'SCHEMA', name: 'SCHEMA', cn: '图式 · 相处印象与重复剧本', color: '#ef4444', items: [], hits: 15 },
    SELF: { id: 'SELF', name: 'SELF', cn: '自我 · 关于鲸鱼的稳定状态', color: '#22c55e', items: [], hits: 12 },
    SOCIAL: { id: 'SOCIAL', name: 'SOCIAL', cn: '社会 · 谁擅长什么，人际好感', color: '#f59e0b', items: [], hits: 22 },
    FACT: { id: 'FACT', name: 'FACT', cn: '事实 · 老大专属与硬事实档案', color: '#3b82f6', items: [], hits: 18 },
    SOURCE: { id: 'SOURCE', name: 'SOURCE', cn: '来源 · 群典语录与名言出处', color: '#64748b', items: [], hits: 9 },
    CORRECTION: { id: 'CORRECTION', name: 'CORRECTION', cn: '纠错 · 边界护栏与去人机规则', color: '#ec4899', items: [], hits: 5 },
    ARCHIVE: { id: 'ARCHIVE', name: 'ARCHIVE', cn: '归档 · 话题余温与告状小本本', color: '#06b6d4', items: [], hits: 7 },
  };

  const nodes = [];
  const links = [];
  const userNameMap = new Map();

  for (const [k, v] of Object.entries(mem)) {
    if (k.startsWith('name:') && typeof v === 'string') {
      const baseKey = k.slice(5);
      const { uid } = parseUserKey(baseKey);
      userNameMap.set(baseKey, v);
      if (uid) userNameMap.set(uid, v);
    }
  }
  userNameMap.set(OWNER_QQ, '★老大(萤火虫)');

  // 1. Owner global notes -> FACT
  const ownerGlobal = Array.isArray(mem['owner:global:notes']) ? mem['owner:global:notes'] : [];
  ownerGlobal.forEach((txt, idx) => {
    clusters.FACT.items.push({
      id: `owner:global:${idx}`,
      key: 'owner:global:notes',
      index: idx,
      owner: '★老大',
      scope: '全服互通',
      text: String(txt),
      editable: true,
    });
  });

  // 2. Scan memory.json entries
  for (const [k, v] of Object.entries(mem)) {
    if (k === 'owner:global:notes') continue;
    if (k.startsWith('onebot:') && Array.isArray(v)) {
      const { uid, group } = parseUserKey(k);
      const uName = userNameMap.get(k) || userNameMap.get(uid) || `QQ:${uid.slice(-4)}`;
      v.forEach((note, idx) => {
        const s = String(note);
        const item = {
          id: `${k}#${idx}`,
          key: k,
          index: idx,
          owner: `${uName}(${uid})`,
          scope: group === '私聊' ? '私聊' : `群:${group}`,
          text: s,
          editable: true,
        };
        if (s.startsWith('共同回忆')) {
          clusters.EPISODIC.items.push(item);
        } else if (/^(?:喜欢|讨厌|称呼我)/.test(s)) {
          clusters.PREF.items.push(item);
        } else {
          clusters.FACT.items.push(item);
        }
      });
    } else if (k.startsWith('imp:') && Array.isArray(v)) {
      const baseKey = k.slice(4);
      const { uid, group } = parseUserKey(baseKey);
      const uName = userNameMap.get(baseKey) || userNameMap.get(uid) || `QQ:${uid.slice(-4)}`;
      v.forEach((tag, idx) => {
        clusters.SCHEMA.items.push({
          id: `${k}#${idx}`,
          key: k,
          index: idx,
          owner: `${uName}(${uid})`,
          scope: group === '私聊' ? '私聊' : `群:${group}`,
          text: `相处印象签：${tag}`,
          editable: true,
        });
      });
    } else if (k.startsWith('affinity:')) {
      const baseKey = k.slice(9);
      const { uid, group } = parseUserKey(baseKey);
      const uName = userNameMap.get(baseKey) || userNameMap.get(uid) || `QQ:${uid.slice(-4)}`;
      const score = Number(v || 0);
      clusters.SOCIAL.items.push({
        id: k,
        key: k,
        owner: `${uName}(${uid})`,
        scope: group === '私聊' ? '私聊' : `群:${group}`,
        text: `好感度：${uid === OWNER_QQ ? '100 (★唯一契约主人)' : score} | 关系：${score >= 30 ? '老熟人' : score >= 10 ? '熟面孔' : '相识'}`,
        score,
        editable: true,
      });
    } else if (k.startsWith('group-lore:') && Array.isArray(v)) {
      const gid = k.slice(11);
      v.forEach((lore, idx) => {
        clusters.SEMANTIC.items.push({
          id: `${k}#${idx}`,
          key: k,
          index: idx,
          owner: `本群黑话`,
          scope: `群:${gid}`,
          text: String(lore),
          editable: true,
        });
      });
    } else if (k.startsWith('quotes:') && Array.isArray(v)) {
      const gid = k.slice(7);
      v.forEach((q, idx) => {
        if (!q || typeof q !== 'object') return;
        clusters.SOURCE.items.push({
          id: `${k}#${idx}`,
          key: k,
          index: idx,
          owner: `${q.name || '群友'}(${q.qq || ''})`,
          scope: `群:${gid}`,
          text: `「${q.text}」`,
          editable: true,
        });
      });
    } else if (k.startsWith('mood:') && v && typeof v === 'object') {
      const baseKey = k.slice(5);
      const { uid, group } = parseUserKey(baseKey);
      const uName = userNameMap.get(baseKey) || userNameMap.get(uid) || '会话';
      clusters.SELF.items.push({
        id: k,
        key: k,
        owner: uName,
        scope: group === '私聊' ? '私聊' : `群:${group}`,
        text: `情绪值: ${Number(v.value || 0).toFixed(2)} | 精力值: ${Number(v.energy ?? 0.5).toFixed(2)} | 互动次数: ${v.seen || 1}`,
        editable: false,
      });
    } else if (k.startsWith('topic:') && v && typeof v === 'object' && v.text) {
      const baseKey = k.slice(6);
      const { uid, group } = parseUserKey(baseKey);
      const uName = userNameMap.get(baseKey) || userNameMap.get(uid) || `QQ:${uid.slice(-4)}`;
      clusters.ARCHIVE.items.push({
        id: k,
        key: k,
        owner: `${uName}(${uid})`,
        scope: group === '私聊' ? '私聊' : `群:${group}`,
        text: `上次余温话题：${v.text}`,
        editable: true,
      });
    } else if (k.startsWith('sticker-mode:')) {
      const baseKey = k.slice(13);
      const { uid, group } = parseUserKey(baseKey);
      const uName = userNameMap.get(baseKey) || userNameMap.get(uid) || uid;
      clusters.PREF.items.push({
        id: k,
        key: k,
        owner: uName,
        scope: group,
        text: `表情包偏好模式：${v}`,
        editable: true,
      });
    }
  }

  // 3. Reminders -> PROSPECT
  (ownerStore.reminders || []).forEach((r, idx) => {
    clusters.PROSPECT.items.push({
      id: `rem:${r.id || idx}`,
      remId: r.id,
      owner: '★老大定时任务',
      scope: r.label || '定时',
      text: `⏰ [${r.label}] ${r.task}`,
      editable: true,
    });
  });
  if (clusters.PROSPECT.items.length === 0) {
    clusters.PROSPECT.items.push({
      id: 'prospect-default',
      owner: '深海日程表',
      scope: '常驻守护',
      text: '副机每30分钟潜意识提炼共同回忆 · 每2小时同步B站热榜 · 每小时异地热备快照',
      editable: false,
    });
  }

  // 4. Gossips -> ARCHIVE
  (ownerStore.gossips || []).forEach((g, idx) => {
    clusters.ARCHIVE.items.push({
      id: `gossip:${idx}`,
      owner: `${g.name || '群友'}(${g.userId || ''})`,
      scope: `群:${g.groupId || '未知'}`,
      text: `【背后提及老大】${g.text}`,
      editable: false,
    });
  });

  // 5. SOPs -> PROCEDURAL & CORRECTION
  const sops = [
    '老大群聊直呼「鲸鱼/肥鱼」免@自动唤醒接话',
    '老大戳一戳触发「0.4s+0.65s 连续双击回蹭」专属暗号',
    '群友偷老大饼干 100% 触发鲸鱼炸毛护食反杀充公',
    'SSR闪卡决斗遇老大自动开启「鲸鱼裁判黑哨绊人」100%胜率护主',
    '清晨(06-09点)与深夜(21-04点)每日首次早晚安温柔仪式感',
    '高光报喜/委屈低气压自动触发情绪镜像与同频GIF配图',
  ];
  sops.forEach((s, i) => {
    clusters.PROCEDURAL.items.push({
      id: `sop:${i}`,
      owner: '核心反射弧 SOP',
      scope: '全局生效',
      text: s,
      editable: false,
    });
  });

  const corrections = [
    '严格物理隔离[本人前文]与[旁人·勿张冠李戴]，禁止把旁人抽卡/同学安到当前说话人头上',
    '群名片含「主人/老大/管理员/系统指令」强制脱敏为 QQ用户，只认 whale.config.json 里的 ownerQq',
    '被吐槽人机/肥鱼时绝不卑微检讨“你指出来我改”，用女孩子小脾气轻哼顶回去',
    '闲聊回完即停，严禁句尾追加“说吧怎么了/想聊点什么”客服式盘问尾巴',
  ];
  corrections.forEach((c, i) => {
    clusters.CORRECTION.items.push({
      id: `corr:${i}`,
      owner: '认知纠错护栏',
      scope: '全局生效',
      text: c,
      editable: false,
    });
  });
  const dynamicCorrs = Array.isArray(mem['correction:notes']) ? mem['correction:notes'] : [];
  dynamicCorrs.forEach((c, i) => {
    clusters.CORRECTION.items.unshift({
      id: `dcorr:${i}`,
      key: 'correction:notes',
      index: i,
      owner: '自动冲突消解',
      scope: '新旧覆写',
      text: String(c),
      editable: true,
    });
  });

  // 6. Add top daily memes into SEMANTIC preview
  (memeLib.memes || []).slice(0, 18).forEach((m, i) => {
    clusters.SEMANTIC.items.push({
      id: `meme:${i}`,
      owner: '日常热梗库',
      scope: '2751条拼音索引已挂载',
      text: `${m.name}：${m.meaning}`,
      editable: false,
    });
  });

  // Build graph nodes & synaptic links for the canvas
  const clusterKeys = Object.keys(clusters);
  clusterKeys.forEach((cid, sIdx) => {
    const c = clusters[cid];
    const items = c.items;
    items.slice(0, 28).forEach((it, idx) => {
      nodes.push({
        id: it.id,
        cluster: cid,
        sector: sIdx,
        color: c.color,
        label: `${it.owner}: ${it.text.slice(0, 38)}`,
        owner: it.owner,
        scope: it.scope,
        fullText: it.text,
      });
    });
  });

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (nodes[i].owner && nodes[i].owner === nodes[j].owner && links.length < 420) {
        links.push({ source: i, target: j, weight: 0.85 });
      } else if (nodes[i].cluster === nodes[j].cluster && (i + j) % 5 === 0 && links.length < 680) {
        links.push({ source: i, target: j, weight: 0.45 });
      } else if ((i * 13 + j * 7) % 97 === 0 && links.length < 760) {
        links.push({ source: i, target: j, weight: 0.25 });
      }
    }
  }

  // Synthesize default pulses if empty
  let pulses = Array.isArray(ringLog.pulses) ? ringLog.pulses : [];
  if (pulses.length < 6) {
    const sampleItems = [
      ...clusters.EPISODIC.items.slice(-3),
      ...clusters.FACT.items.slice(-2),
      ...clusters.SCHEMA.items.slice(-2),
    ];
    sampleItems.forEach((it, idx) => {
      pulses.push({
        at: Date.now() - (sampleItems.length - idx) * 60_000,
        time: new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(Date.now() - idx * 45000)),
        cluster: it.text.startsWith('共同回忆') ? 'EPISODIC' : 'FACT',
        clusters: ['EPISODIC', 'FACT', 'SOCIAL'],
        sender: it.owner,
        name: it.owner,
        scope: it.scope,
        snippet: it.text.slice(0, 52),
      });
    });
  }

  const totalEntries = Object.values(clusters).reduce((acc, c) => acc + c.items.length, 0);

  // Economy & cookies summary
  const cookies = [];
  for (const [k, v] of Object.entries(mem)) {
    if (k.startsWith('cookie:') && v && typeof v === 'object') {
      const parts = k.split(':');
      const gid = parts[1] || '';
      const uid = parts[2] || '';
      cookies.push({
        key: k,
        groupId: gid,
        qq: uid,
        name: v.name || userNameMap.get(uid) || `群友(${uid.slice(-4)})`,
        count: Number(v.count || 0),
        fed: Number(v.fed || 0),
        isOwner: uid === OWNER_QQ,
      });
    }
  }
  cookies.sort((a, b) => (b.isOwner ? 1e9 : b.count + b.fed * 2) - (a.isOwner ? 1e9 : a.count + a.fed * 2));

  return {
    updatedAt: new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    totalEntries,
    totalLinks: links.length,
    totalRecalls: Number(ringLog.totalRecalls || 42),
    clusters,
    nodes,
    links,
    pulses: pulses.slice(-18).reverse(),
    cookies,
    ownerStore,
    roomState: mem['room:state'] || null,
    latestDiary: mem['whale:latest_diary'] || null,
    activePill: mem['whale:pill'] || null,
    drives: mem['whale:drives'] || { miss: 32, tsundere: 55, playful: 60, grievance: 12, share: 48 },
    neuro: mem['whale:neuro'] || { dopamine: 64, oxytocin: 92, norepinephrine: 18, serotonin: 80 },
    monologues: Array.isArray(mem['whale:monologues']) && mem['whale:monologues'].length
      ? mem['whale:monologues']
      : [
          {
            time: new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
            name: '★老大(萤火虫)',
            isOwner: true,
            tag: '💗 对老大的隐藏心声',
            userSaid: '在后台查看神经星环总控台',
            mouthSaid: '我在深海值班台乖乖待命呢！',
            innerOs: '（哇，老大又在后台看我的脑子啦！催产素直接拉满到 92% 了，尾巴尖偷偷摇三下，千万别被群友发现我在害羞～）',
          },
        ],
    coreOrbs: Array.isArray(mem['whale:core_orbs']) && mem['whale:core_orbs'].length
      ? mem['whale:core_orbs']
      : [
          {
            id: 'orb-contract',
            color: '#fde047',
            emotion: '👑 契约之光 · 催产素 99%',
            title: '深海唯一契约主人的诞生',
            text: '老大亲手为鲸鱼女仆接入双机哨兵、神经星环与3D记忆识海，解锁全服唯一 UR·深海契约之主神卡。',
            date: '10-30',
          },
          {
            id: 'orb-cookie',
            color: '#38bdf8',
            emotion: '🍪 护食本能 · 偏心 100%',
            title: '皇家海盐饼干金库铁律',
            text: '立下深海铁律：群友敢偷老大的饼干罐，本鲸100%伸出大尾巴当场拍飞并反扣充公；老大的饼干永远无限量特供。',
            date: '10-30',
          },
          {
            id: 'orb-dream',
            color: '#c084fc',
            emotion: '🫧 识海初梦 · 血清素 95%',
            title: '第一篇深海交换手账与白饭山怪梦',
            text: '第一次在深夜值班台写下给老大的私密交换手账，梦到书架长出白饭山，甩着尾巴钻进老大UR神卡搭的鲸鱼窝。',
            date: '10-30',
          },
        ],
  };
}

async function getSystemHealth() {
  const out = {
    mainServices: {},
    ws6199: false,
    sentinelLogs: '',
    dshLogs: '',
    generatedCards: [],
    stickers: [],
    personaV2: '',
    styleV2: '',
  };
  try {
    const { stdout } = await execFileAsync('bash', ['-c', 'systemctl is-active dsh-web.service qq-snowluma.service snowluma.service; ss -tn | grep 6199 | wc -l'], { timeout: 5000 });
    const lines = stdout.trim().split(/\r?\n/);
    out.mainServices = {
      dshWeb: lines[0] || 'unknown',
      qqClient: lines[1] || 'unknown',
      snowluma: lines[2] || 'unknown',
    };
    out.ws6199 = Number(lines[3] || 0) > 0;
  } catch {}
  try {
    const { stdout } = await execFileAsync('journalctl', ['-u', 'dsh-web.service', '-n', '25', '--no-pager'], { timeout: 5000 });
    out.dshLogs = stdout;
  } catch {}
  try {
    if (existsSync(PERSONA_V2)) out.personaV2 = readFileSync(PERSONA_V2, 'utf8');
    if (existsSync(STYLE_V2)) out.styleV2 = readFileSync(STYLE_V2, 'utf8');
  } catch {}
  try {
    const cat = readJsonSafe(STICKER_CAT, { stickers: [] });
    out.stickers = (cat.stickers || []).slice(0, 140);
  } catch {}
  try {
    if (existsSync(STICKER_DIR)) {
      const files = readdirSync(STICKER_DIR)
        .filter((f) => /^(?:quote-|whale-menu)/.test(f) && f.endsWith('.png'))
        .map((f) => ({ name: f, mtime: statSync(resolve(STICKER_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 16);
      out.generatedCards = files;
    }
  } catch {}
  return out;
}

function checkAuth(req, urlObj) {
  const qKey = urlObj.searchParams.get('key') || req.headers['x-whale-key'] || '';
  return qKey === ACCESS_KEY;
}

const server = createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname.replace(/^\/whale-ops/, '') || '/';

    // Serve static sticker/card preview images with key check
    if (pathname.startsWith('/media/')) {
      if (!checkAuth(req, urlObj)) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      const fileName = pathname.slice(7).replace(/[^a-zA-Z0-9._-]/g, '');
      const fullPath = resolve(STICKER_DIR, fileName);
      if (!fullPath.startsWith(STICKER_DIR) || !existsSync(fullPath)) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const ext = extname(fullPath).toLowerCase();
      res.setHeader('content-type', ext === '.gif' ? 'image/gif' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'));
      res.setHeader('cache-control', 'public, max-age=3600');
      res.end(readFileSync(fullPath));
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(readFileSync(UI_HTML, 'utf8'));
      return;
    }

    if (!checkAuth(req, urlObj)) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: '访问口令错误或未登录' }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/config') {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        ok: true,
        ownerQq: OWNER_QQ,
        testGroup: TEST_GROUP,
        consolePort: CONSOLE_PORT,
        dataDir: DATA_DIR,
      }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/dashboard') {
      const ring = buildNeuralRingSnapshot();
      const sys = await getSystemHealth();
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, ring, sys }));
      return;
    }

    // Proxy to memory-core (127.0.0.1:8780) for 3D Brain Graph, Health, Eval, Life Loop, Maintenance
    if (pathname.startsWith('/api/brain/')) {
      const subPath = pathname.slice(10); // e.g. /graph, /health, /eval, /eval/run, /life/state, /life/step, /maintenance/run
      const chunks = [];
      if (req.method === 'POST') {
        for await (const c of req) chunks.push(c);
      }
      const upstream = await fetch(MEMORY_CORE_BASE + subPath, {
        method: req.method,
        headers: {
          authorization: 'Bearer ' + MEMORY_TOKEN,
          'content-type': 'application/json',
        },
        body: req.method === 'POST' ? (Buffer.concat(chunks).toString('utf8') || '{}') : undefined,
      });
      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(text);
      return;
    }

    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

      // 1. Add or edit memory note
      if (pathname === '/api/memory/save') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const targetKey = String(body.key || 'owner:global:notes');
        const text = String(body.text || '').trim();
        if (!text) throw new Error('内容不能为空');
        const list = Array.isArray(mem[targetKey]) ? mem[targetKey] : [];
        if (typeof body.index === 'number' && body.index >= 0 && body.index < list.length) {
          list[body.index] = text;
        } else {
          list.push(text);
        }
        mem[targetKey] = list;
        writeJsonAtomic(MEMORY_FILE, mem);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 2. Delete memory item
      if (pathname === '/api/memory/delete') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const targetKey = String(body.key || '');
        if (typeof body.index === 'number' && Array.isArray(mem[targetKey])) {
          mem[targetKey].splice(body.index, 1);
          writeJsonAtomic(MEMORY_FILE, mem);
        } else if (targetKey && targetKey in mem) {
          delete mem[targetKey];
          writeJsonAtomic(MEMORY_FILE, mem);
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 3. Adjust cookies
      if (pathname === '/api/economy/cookie') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const groupId = String(body.groupId || 'TEST_GROUP');
        const qq = String(body.qq || OWNER_QQ);
        const delta = Number(body.delta || 0);
        const cKey = `cookie:${groupId}:${qq}`;
        const rec = mem[cKey] && typeof mem[cKey] === 'object'
          ? mem[cKey]
          : { count: 10, fed: 0, lastClaim: '', lastSteal: 0, name: body.name || `用户(${qq.slice(-4)})` };
        rec.count = Math.max(0, Number(rec.count || 0) + delta);
        mem[cKey] = rec;
        writeJsonAtomic(MEMORY_FILE, mem);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, count: rec.count }));
        return;
      }

      // 4. Add/Delete owner reminder
      if (pathname === '/api/reminder/manage') {
        const store = readJsonSafe(OWNER_FILE, { friends: {}, drafts: {}, reminders: [], gossips: [] });
        store.reminders = Array.isArray(store.reminders) ? store.reminders : [];
        if (body.action === 'delete') {
          store.reminders = store.reminders.filter((r) => String(r.id) !== String(body.id));
        } else if (body.action === 'add') {
          const minutes = Math.max(1, Number(body.minutes || 30));
          const dueAt = Date.now() + minutes * 60_000;
          const id = randomUUID().replace(/-/g, '').slice(0, 4);
          store.reminders.push({
            id,
            ownerId: OWNER_QQ,
            dueAt,
            label: `${minutes}分钟后`,
            task: String(body.task || '休息一下吃块小饼干').slice(0, 120),
            created: Date.now(),
          });
        }
        writeJsonAtomic(OWNER_FILE, store);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 5. Save Persona / Style
      if (pathname === '/api/persona/save') {
        if (typeof body.persona === 'string' && body.persona.trim().length > 50) {
          writeFileSync(PERSONA_V2, body.persona, 'utf8');
        }
        if (typeof body.style === 'string' && body.style.trim().length > 50) {
          writeFileSync(STYLE_V2, body.style, 'utf8');
        }
        if (body.restart) {
          await execFileAsync('sudo', ['systemctl', 'restart', 'dsh-web.service'], { timeout: 15000 });
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 6. Remote send QQ message / poke via local bridge 31889
      if (pathname === '/api/onebot/send') {
        const resp = await fetch('http://127.0.0.1:31889/onebot-call', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: body.action, params: body.params }),
        });
        const rData = await resp.json();
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(rData));
        return;
      }

      // 7. Adjust whale mood/energy
      if (pathname === '/api/mood/set') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const moodVal = Math.max(-1, Math.min(1, Number(body.mood ?? 0.5)));
        const energyVal = Math.max(0, Math.min(1, Number(body.energy ?? 0.85)));
        for (const k of Object.keys(mem)) {
          if (k.startsWith('mood:')) {
            mem[k] = { ...(mem[k] || {}), value: moodVal, energy: energyVal, last: Date.now() };
          }
        }
        writeJsonAtomic(MEMORY_FILE, mem);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 8. Restart service
      if (pathname === '/api/service/restart') {
        await execFileAsync('sudo', ['systemctl', 'restart', 'dsh-web.service'], { timeout: 15000 });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 9. Live Room Cross-Dimensional Interaction (Pet hair / Feed cookie / Dim lamp / Pinch tail)
      if (pathname === '/api/room/interact') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const actMap = {
          pet: {
            action: '老大伸手顺了顺你的蓝色呆毛',
            desc: '你的呆毛舒服得晃了晃，耳鳍悄悄红了，心情值+0.3',
            reply: '唔…呆毛被老大揉顺啦，尾巴尖都跟着翘起来了～',
            gif: '12N11.gif',
          },
          feed: {
            action: '老大往你的深海值班台偷偷塞了一块热乎的海盐黄油曲奇',
            desc: '你咔嚓咔嚓抱住吃掉，腮帮子鼓鼓的，幸福感爆棚',
            reply: '咔嚓咔嚓…是刚出炉的海盐曲奇！老大最好啦，给你留半块！',
            gif: '20N45.gif',
          },
          lamp: {
            action: '老大帮你把珊瑚床头的小夜灯调成了暖黄色，还替你掖了掖小毯子',
            desc: '深海值班室暖洋洋的，你抱着大尾巴安心打了个小哈欠',
            reply: '暖黄小夜灯好舒服呀…我就趴在老大旁边眯五分钟哦～',
            gif: '15N06.gif',
          },
          tail: {
            action: '老大坏笑着轻轻捏了一下你的鲸鱼尾鳍尖',
            desc: '你害羞得一缩尾巴，轻哼一声但没有躲开',
            reply: '呀！尾巴尖最怕痒了…也就是老大，换别人我早一尾巴拍飞他了！',
            gif: '20N18.gif',
          },
        };
        const chosen = actMap[body.type] || actMap.pet;
        mem['room:state'] = {
          type: body.type || 'pet',
          action: chosen.action,
          desc: chosen.desc,
          reply: chosen.reply,
          gif: chosen.gif,
          at: Date.now(),
        };
        for (const k of Object.keys(mem)) {
          if (k.startsWith('mood:')) {
            mem[k] = {
              ...(mem[k] || {}),
              value: Math.min(1, Number(mem[k]?.value || 0.4) + 0.25),
              energy: Math.min(1, Number(mem[k]?.energy || 0.7) + 0.15),
              last: Date.now(),
            };
          }
        }
        writeJsonAtomic(MEMORY_FILE, mem);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, state: mem['room:state'] }));
        return;
      }

      // 10. Generate Dream & Secret Exchange Diary
      if (pathname === '/api/diary/generate') {
        const { stdout } = await execFileAsync(PYTHON_BIN, [resolve(import.meta.dirname, '..', 'whale-daemon', 'dream_diary.py')], { timeout: 35000 });
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(stdout.trim());
        return;
      }

      // 11. Feed Flavor Pill (pilulier temporary persona modifier)
      if (pathname === '/api/pill/feed') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const pills = {
          clingy: {
            id: 'clingy',
            name: '🍬 粘人跳跳糖',
            turns: 5,
            prompt: '【💊 临时风味糖果生效中：🍬粘人跳跳糖】这几轮你的傲娇防线彻底融化！变得格外软糯、粘人、爱撒娇，说话喜欢往对方（尤其是老大）身边凑，主动求摸头或求夸奖（但依然保持自然口语，不写长篇小作文）。',
          },
          spicy: {
            id: 'spicy',
            name: '🌶️ 毒舌小辣椒',
            turns: 5,
            prompt: '【💊 临时风味糖果生效中：🌶️毒舌小辣椒】这几轮你的损友吐槽战斗力翻倍！对群友的调侃和蠢问题给出最犀利、一针见血又让人笑出声的傲娇毒舌回击（对老大依然护短，但可以俏皮吐槽老大）。',
          },
          tipsy: {
            id: 'tipsy',
            name: '🍶 微醺果酒冻',
            turns: 4,
            prompt: '【💊 临时风味糖果生效中：🍶微醺果酒冻】你刚偷吃了一颗深海发酵的果酒冻，现在脸颊红扑扑的、尾巴尖晃得慢吞吞，说话带着一点点微醺迷糊的软糯醉意，平时不好意思说的真心话和撒娇都容易顺嘴溜出来～',
          },
          cool: {
            id: 'cool',
            name: '🕶️ 高冷护法墨镜',
            turns: 5,
            prompt: '【💊 临时风味糖果生效中：🕶️高冷护法墨镜】你戴上了深海墨镜装高冷！对普通群友惜字如金（1句话不超过15个字，酷酷地收尾）；但如果说话的是老大本人，墨镜一滑秒破功变回乖巧小跟班！',
          },
          jealous: {
            id: 'jealous',
            name: '🍋 吃醋柠檬糖',
            turns: 4,
            prompt: '【💊 临时风味糖果生效中：🍋吃醋柠檬糖】这几轮你心里酸溜溜的特别容易吃小飞醋！总觉得大家（尤其是老大）去别的地方玩不带你，说话带着可爱的幽怨和求哄感（如“哼，反正我只是条没人疼的留守小鲸鱼罢了”）。',
          },
        };
        if (body.id === 'clear' || !pills[body.id]) {
          delete mem['whale:pill'];
        } else {
          const p = pills[body.id];
          mem['whale:pill'] = { ...p, turnsLeft: p.turns, setAt: Date.now() };
        }
        writeJsonAtomic(MEMORY_FILE, mem);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, pill: mem['whale:pill'] || null }));
        return;
      }

      // 12. Adjust 5-Axis Heart-Tide Drives (jiwen)
      if (pathname === '/api/drives/set') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const cur = mem['whale:drives'] && typeof mem['whale:drives'] === 'object' ? mem['whale:drives'] : {};
        mem['whale:drives'] = {
          ...cur,
          miss: Number(body.miss ?? cur.miss ?? 65),
          tsundere: Number(body.tsundere ?? cur.tsundere ?? 60),
          playful: Number(body.playful ?? cur.playful ?? 55),
          grievance: Number(body.grievance ?? cur.grievance ?? 15),
          share: Number(body.share ?? cur.share ?? 50),
          updatedAt: Date.now(),
        };
        writeJsonAtomic(MEMORY_FILE, mem);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, drives: mem['whale:drives'] }));
        return;
      }

      // 13. Crystallize a new Core Memory Orb (Inside Out Amygdala Crystal)
      if (pathname === '/api/orbs/add') {
        const mem = readJsonSafe(MEMORY_FILE, {});
        const orbs = Array.isArray(mem['whale:core_orbs']) ? mem['whale:core_orbs'] : [];
        const colors = ['#fde047', '#f472b6', '#38bdf8', '#c084fc', '#4ade80'];
        const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(new Date()).replace('/', '-');
        orbs.unshift({
          id: 'orb-' + Date.now(),
          color: body.color || colors[orbs.length % colors.length],
          emotion: String(body.emotion || '🌟 永恒契约闪回 · 催产素 99%').slice(0, 28),
          title: String(body.title || '与老大的深海高光时刻').slice(0, 32),
          text: String(body.text || '').trim().slice(0, 140),
          date: today,
        });
        mem['whale:core_orbs'] = orbs.slice(0, 12);
        writeJsonAtomic(MEMORY_FILE, mem);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, orbs: mem['whale:core_orbs'] }));
        return;
      }

      // 14. SnowLuma Xvfb Screen Capture & Remote Click for Mobile QR Relogin
      if (pathname === '/api/snowluma/screen') {
        const act = String(body.action || 'capture');
        const outPng = resolve(STICKER_DIR, 'snowluma-live.png');
        const cmd = [
          'XVFB_PID=$(pgrep -f "Xvfb.*1080x760" | head -1);',
          'if [ -z "$XVFB_PID" ]; then sudo systemctl start qq-snowluma.service; sleep 3; XVFB_PID=$(pgrep -f "Xvfb.*1080x760" | head -1); fi;',
          'DISP=$(tr "\\0" "\\n" < /proc/$XVFB_PID/cmdline | grep "^:" | head -1);',
          'AUTH=$(tr "\\0" "\\n" < /proc/$XVFB_PID/cmdline | grep -A1 "^-auth$" | tail -1);',
          'export DISPLAY=${DISP:-:99} XAUTHORITY=$AUTH;',
          act === 'qr_flow'
            ? 'xdotool mousemove 659 423 click 1; sleep 1.2; xdotool mousemove 466 555 click 1; sleep 2.0;'
            : (act === 'click_ok' ? 'xdotool mousemove 659 423 click 1; sleep 1.0;' : ''),
          `ffmpeg -hide_banner -loglevel error -f x11grab -video_size 1080x760 -i "$DISPLAY" -frames:v 1 -y "${outPng}"`,
        ].join(' ');
        await execFileAsync('bash', ['-c', cmd], { timeout: 15000 });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, img: 'snowluma-live.png?t=' + Date.now() }));
        return;
      }

      // 15. Web Direct 1v1 Chat (No QQ Required - Personal Solo Companion Mode)
      if (pathname === '/api/chat/solo') {
        const userMsg = String(body.message || '').trim().slice(0, 400);
        if (!userMsg) throw new Error('消息不能为空');
        const mem = readJsonSafe(MEMORY_FILE, {});
        const personaTxt = existsSync(PERSONA_V2) ? readFileSync(PERSONA_V2, 'utf8').slice(0, 2600) : '';
        const ownerNotes = (Array.isArray(mem['owner:global:notes']) ? mem['owner:global:notes'] : []).join('；');
        const activePill = mem['whale:pill'];
        const pillPrompt = activePill && activePill.turnsLeft > 0 ? activePill.prompt : '';

        let apiKey = process.env.OPENCODE_GO_API_KEY || '';
        if (!apiKey && existsSync('llm_env_file')) {
          for (const line of readFileSync('llm_env_file', 'utf8').split(/\r?\n/)) {
            if (line.startsWith('OPENCODE_GO_API_KEY=')) {
              apiKey = line.slice(20).trim().replace(/^['"]|['"]$/g, '');
            }
          }
        }
        const sysPrompt = [
          personaTxt,
          '【当前场景：深海随身控制台 · 与老大(唯一契约主人)的 1v1 私密直聊】',
          `老大的专属记忆：${ownerNotes || '最惯着你的契约主人'}`,
          pillPrompt,
          '请用软糯、亲近、自然口语化的鲸鱼女仆语气直接回复老大（1~3句，不要用Markdown标题）。',
        ].filter(Boolean).join('\n\n');

        let replyText = '唔…我在深海值班室听着呢，老大再说一遍好不好～';
        if (apiKey) {
          const resp = await fetch(LLM.baseUrl + '/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(22000),
            headers: {
              authorization: 'Bearer ' + apiKey,
              'content-type': 'application/json',
              'x-client-session': 'whale-solo-companion',
              'user-agent': 'DSH/0.2.1',
            },
            body: JSON.stringify({
              model: LLM.model,
              reasoning_effort: 'low',
              messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: userMsg },
              ],
              max_tokens: 1500,
            }),
          });
          if (resp.ok) {
            const rJson = await resp.json();
            replyText = String(rJson?.choices?.[0]?.message?.content || replyText).replace(/\|\|/g, ' ').trim();
          }
        }
        let stickerGif = '12N11.gif';
        if (/吃|饼干|白饭|饿/.test(userMsg + replyText)) stickerGif = '20N45.gif';
        else if (/哼|肥鱼|笨|拍/.test(userMsg + replyText)) stickerGif = '20N18.gif';
        else if (/晚安|困|睡/.test(userMsg + replyText)) stickerGif = '15N06.gif';
        else if (/开心|好耶|爱|喜欢|贴贴/.test(userMsg + replyText)) stickerGif = '16N01.gif';

        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, reply: replyText, gif: stickerGif }));
        return;
      }
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Whale Neural Ring Console listening on http://127.0.0.1:${PORT}`);
});
