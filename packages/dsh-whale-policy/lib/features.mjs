/**
 * 深海鲸鱼女仆 · Feature Gate（随时开关）
 *
 * 三级覆盖，优先级 用户 > 群 > 全局：
 *   state['whale:flags']                全局（控制台/口令都能改）
 *   state['whale:flags:group:<gid>']    单群
 *   state['whale:flags:user:<qq>']      单人
 * 配置层兜底：whale.config.json 的 features
 *
 * 值语义：true = 开，false = 关，undefined = 继承上级。
 */

/** 功能定义表：key / 中文名 / 分组 / 默认是否开启 / 说明 */
export const FEATURE_DEFS = [
  // ---------- 玩法 ----------
  { key: 'menu', group: '玩法', name: '功能菜单长图', def: true, desc: '菜单/帮助 触发的全功能长图' },
  { key: 'card', group: '玩法', name: '抽卡 / SSR 闪卡', def: true, desc: '生成 UR/SSR 攻防双技能卡' },
  { key: 'duel', group: '玩法', name: '闪卡决斗 PK', def: true, desc: '决斗 @某人，输赢赌饼干' },
  { key: 'cp', group: '玩法', name: '测 CP / 今日搭子', def: true, desc: '相性卡与同步率' },
  { key: 'headline', group: '玩法', name: '深海晚报头条', def: true, desc: '震惊部头版大图' },
  { key: 'fishing', group: '玩法', name: '甩竿钓鱼', def: true, desc: '渔获与黑历史漂流瓶' },
  { key: 'wordcloud', group: '玩法', name: '水群龙王榜 / 词云', def: true, desc: '活跃榜 + 热词云' },
  { key: 'relgraph', group: '玩法', name: '人物八卦关系网', def: true, desc: '环形头像关系图' },
  { key: 'galgame', group: '玩法', name: 'GalGame 立绘框', def: true, desc: '把回复渲染成视觉小说 CG' },
  { key: 'achievement', group: '玩法', name: '隐藏成就奖状', def: true, desc: '黑金成就横幅' },
  { key: 'wish', group: '玩法', name: '邪恶许愿机', def: true, desc: '字面反转的因果律报应' },
  { key: 'theater', group: '玩法', name: '平行宇宙小剧场', def: true, desc: '合并转发剧本' },
  { key: 'anime', group: '玩法', name: '以图搜番', def: true, desc: 'trace.moe 识别番名集数' },
  { key: 'logo', group: '玩法', name: '蔚蓝 Logo 生成', def: true, desc: '斜切光环透明 Logo' },
  { key: 'cookie', group: '玩法', name: '深海饼干铺', def: true, desc: '领/喂/偷/榜' },
  { key: 'stock', group: '玩法', name: '深海股市', def: true, desc: '群友身价行情' },
  { key: 'quote', group: '玩法', name: '入典语录卡', def: true, desc: '逆天发言做成名言卡' },
  { key: 'memo', group: '玩法', name: '成分鉴定卡', def: true, desc: '表面成分/隐藏属性' },

  // ---------- 策略 ----------
  { key: 'emotion', group: '策略', name: '情绪镜像', def: true, desc: '报喜同频 / 低落托底 / 撒娇回应' },
  { key: 'ritual', group: '策略', name: '早晚安仪式', def: true, desc: '每日首次早安 / 晚安' },
  { key: 'drives', group: '策略', name: '五轴心潮驱力', def: true, desc: '思念/嘴硬/玩心/委屈/分享' },
  { key: 'neuro', group: '策略', name: '四维神经荷尔蒙', def: true, desc: '多巴胺/催产素/肾上腺素/血清素' },
  { key: 'pill', group: '策略', name: '风味糖果盒', def: true, desc: '临时性格胶囊（用完即焚）' },
  { key: 'brain', group: '策略', name: '记忆大脑召回', def: true, desc: 'SQLite 五路混合检索' },
  { key: 'ring', group: '策略', name: '神经星环脉冲', def: true, desc: '控制台召回脉冲日志' },
  { key: 'sticker', group: '策略', name: '自动表情包', def: true, desc: '按情绪补发 GIF' },
  { key: 'room', group: '策略', name: '值班室跨次元', def: true, desc: '网页摸头投喂影响 QQ 台词' },
  { key: 'diary', group: '策略', name: '深海日记与怪梦', def: true, desc: '睡前手账 / 昨夜怪梦' },
  { key: 'monologue', group: '策略', name: '读心术内心 OS', def: true, desc: '记录嘴上没说出口的话' },
  { key: 'album', group: '策略', name: '视觉识海相册', def: true, desc: '保存看过的图做缩略图' },

  // ---------- 多模态 ----------
  { key: 'vision', group: '多模态', name: '看图片 / 动图', def: true, desc: '原生多模态 + GIF 抽帧' },
  { key: 'voice', group: '多模态', name: '语音合成', def: true, desc: 'TTS 发语音条' },
  { key: 'video', group: '多模态', name: '视频解析', def: true, desc: 'B站/抖音/快手 转发' },
  { key: 'news', group: '多模态', name: '热榜新闻播报', def: true, desc: '本机摘要 / 实时热榜' },

  // ---------- 主人特权 ----------
  { key: 'ownerPrivilege', group: '主人特权', name: '护主神权（整组）', def: true, desc: '护食反杀/黑哨/UR卡/免@唤醒' },
  { key: 'ownerDecree', group: '主人特权', name: '御令指哪打哪', def: true, desc: '去夸/哄/怼 @某人' },

  // ---------- 系统 ----------
  { key: 'daemon', group: '系统', name: '后台调度器', def: true, desc: '提炼/热榜/梦境/维护' },
  { key: 'dream', group: '系统', name: '每日自动梦境', def: true, desc: '凌晨自动写日记与怪梦' },
  { key: 'hotNews', group: '系统', name: '自动热榜抓取', def: true, desc: '每 2 小时拉 B 站热门' },
];

export const FEATURE_KEYS = new Set(FEATURE_DEFS.map((f) => f.key));
const DEF_MAP = new Map(FEATURE_DEFS.map((f) => [f.key, f.def]));

function pickLayer(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = obj[key];
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * 判断某个功能当前是否开启。
 * @param {object} state  当前 memory.json 状态
 * @param {string} key    功能 key
 * @param {object} [scope] { groupId?, userId? }
 * @param {object} [defaults] config.features（全局配置兜底）
 */
export function isOn(state, key, scope = {}, defaults = {}) {
  if (!FEATURE_KEYS.has(key)) return true; // 未登记的一律放行，避免误伤新功能
  const { groupId, userId } = scope;
  if (userId) {
    const v = pickLayer(state[`whale:flags:user:${userId}`], key);
    if (v !== undefined) return v;
  }
  if (groupId && groupId !== 'private') {
    const v = pickLayer(state[`whale:flags:group:${groupId}`], key);
    if (v !== undefined) return v;
  }
  const g = pickLayer(state['whale:flags'], key);
  if (g !== undefined) return g;
  const c = pickLayer(defaults, key);
  if (c !== undefined) return c;
  return DEF_MAP.get(key) !== false;
}

/** 把功能表 + 当前生效值整理成给控制台用的快照 */
export function snapshot(state, defaults = {}, groups = []) {
  const rows = FEATURE_DEFS.map((f) => ({
    ...f,
    on: isOn(state, f.key, {}, defaults),
    overridden: pickLayer(state['whale:flags'], f.key) !== undefined,
  }));
  const groupRows = {};
  for (const gid of groups) {
    const layer = state[`whale:flags:group:${gid}`] || {};
    const on = {};
    for (const f of FEATURE_DEFS) {
      const v = pickLayer(layer, f.key);
      if (v !== undefined) on[f.key] = v;
    }
    groupRows[gid] = on;
  }
  return { rows, groups: groupRows };
}

/** 解析「关掉抽卡 / 开启抽卡 / 关掉本群抽卡」这类自然指令 */
const ALIAS = new Map();
for (const f of FEATURE_DEFS) {
  ALIAS.set(f.key, f.key);
  ALIAS.set(f.name, f.key);
}
// 常见口语别名
const EXTRA_ALIAS = {
  抽卡: 'card',
  闪卡: 'card',
  决斗: 'duel',
  pk: 'duel',
  测cp: 'cp',
  搭子: 'cp',
  头条: 'headline',
  晚报: 'headline',
  钓鱼: 'fishing',
  词云: 'wordcloud',
  龙王榜: 'wordcloud',
  关系图: 'relgraph',
  关系网: 'relgraph',
  立绘: 'galgame',
  对话框: 'galgame',
  奖状: 'achievement',
  成就: 'achievement',
  许愿: 'wish',
  愿机: 'wish',
  小剧场: 'theater',
  搜番: 'anime',
  logo: 'logo',
  饼干: 'cookie',
  饼干铺: 'cookie',
  股市: 'stock',
  语录: 'quote',
  入典: 'quote',
  鉴定: 'memo',
  成分: 'memo',
  情绪: 'emotion',
  镜像: 'emotion',
  早晚安: 'ritual',
  早安: 'ritual',
  晚安: 'ritual',
  心潮: 'drives',
  荷尔蒙: 'neuro',
  神经递质: 'neuro',
  糖果: 'pill',
  糖果盒: 'pill',
  记忆: 'brain',
  大脑: 'brain',
  星环: 'ring',
  表情: 'sticker',
  表情包: 'sticker',
  值班室: 'room',
  日记: 'diary',
  梦境: 'diary',
  读心: 'monologue',
  读心术: 'monologue',
  相册: 'album',
  看图: 'vision',
  图片: 'vision',
  语音: 'voice',
  视频: 'video',
  新闻: 'news',
  热榜: 'news',
  特权: 'ownerPrivilege',
  御令: 'ownerDecree',
  调度: 'daemon',
  自动梦境: 'dream',
  热榜抓取: 'hotNews',
};
for (const [k, v] of Object.entries(EXTRA_ALIAS)) ALIAS.set(k, v);

const OFF_WORDS = /^(?:关掉|关闭|关|禁用|停用|别用|不要|取消)$/u;
const ON_WORDS = /^(?:开启|打开|开|启用|恢复|打开吧|允许|要)$/u;

/**
 * 解析开关指令。
 * @returns {{ action:'on'|'off'|'list'|'clear', target?:string, scope?:'user'|'group'|'global', raw:string }|null}
 */
export function parseToggle(text) {
  const body = String(text || '').trim();
  if (!body || body.length > 40) return null;
  if (/^(?:功能开关|开关列表|看开关|有什么可关)[！!。~～\s]*$/u.test(body)) {
    return { action: 'list', raw: body };
  }
  const m = body.match(/^(关掉|关闭|禁用|停用|别用|开启|打开|启用|恢复)\s*(本群|这个群|私聊里|对我)?\s*(?:的)?\s*([^\s，。！？!?]{1,12})$/u);
  if (m) {
    const on = ON_WORDS.test(m[1]);
    const scopeHint = m[2] || '';
    const targetRaw = m[3].toLowerCase();
    const key = ALIAS.get(targetRaw) || ALIAS.get(m[3]);
    const scope = /本群|这个群/.test(scopeHint) ? 'group' : (/对我|私聊里/.test(scopeHint) ? 'user' : 'global');
    if (key) return { action: on ? 'on' : 'off', target: key, scope, raw: body };
  }
  const m2 = body.match(/^(恢复默认|重置开关|清除覆盖)\s*([^\s]{0,12})$/u);
  if (m2) {
    const key = ALIAS.get((m2[2] || '').toLowerCase());
    return { action: 'clear', target: key || '', raw: body };
  }
  return null;
}

/** 把开关写入 state（返回是否成功） */
export function applyToggle(state, parsed, scopeIds = {}) {
  if (!parsed || !parsed.action || parsed.action === 'list') return false;
  const { action, target, scope } = parsed;
  if (action === 'clear') {
    const keysToClear = target
      ? [scope === 'user' && scopeIds.userId ? `whale:flags:user:${scopeIds.userId}` : '',
         scope === 'group' && scopeIds.groupId ? `whale:flags:group:${scopeIds.groupId}` : '',
         'whale:flags'].filter(Boolean)
      : ['whale:flags'];
    let touched = false;
    for (const k of keysToClear) {
      if (state[k] && typeof state[k] === 'object') {
        if (!target) { delete state[k]; touched = true; }
        else if (target in state[k]) { delete state[k][target]; touched = true; }
      }
    }
    return touched;
  }
  if (!FEATURE_KEYS.has(target)) return false;
  const on = action === 'on';
  let slot = 'whale:flags';
  if (scope === 'user' && scopeIds.userId) slot = `whale:flags:user:${scopeIds.userId}`;
  else if (scope === 'group' && scopeIds.groupId && scopeIds.groupId !== 'private') {
    slot = `whale:flags:group:${scopeIds.groupId}`;
  }
  if (!state[slot] || typeof state[slot] !== 'object') state[slot] = {};
  state[slot][target] = on;
  return true;
}

/** 生成给模型的「开关状态」提示（只列被关掉的，避免污染 prompt） */
export function offListFor(state, scope = {}, defaults = {}) {
  const off = FEATURE_DEFS.filter((f) => !isOn(state, f.key, scope, defaults));
  if (!off.length) return '';
  return '【当前已关闭的功能（用户明确关掉的，不要主动触发也不要提）】' + off.map((f) => f.name).join('、');
}
