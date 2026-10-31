import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { PYTHON_BIN, OWNER_QQ, OWNER_OPENIDS } from '../../shared/whale-config.mjs';

const execFileAsync = promisify(execFile);
const PYTHON = PYTHON_BIN;
const VISUAL_SCRIPT = resolve(import.meta.dirname, 'visual_cards.py');
const STOPWORDS = new Set([
  '这个', '那个', '什么', '怎么', '为什么', '可以', '没有', '不是', '就是', '还是',
  '一个', '一下', '知道', '觉得', '看看', '今天', '现在', '你们', '我们', '自己',
  '图片', '表情', '动画', '消息', '回复', '引用', '哈哈', '哈哈哈', '好哦', '是的',
  '真的', '假的', '起来', '出来', '进去', '过来', '过去', '这样', '那样', '时候',
]);

function shanghaiDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function hashStr(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function callFlashJson(prompt, fallback) {
  const key = process.env.OPENCODE_GO_API_KEY || '';
  if (!key) return fallback;
  try {
    const resp = await fetch('https://opencode.ai/inference/go/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(22000),
      headers: {
        authorization: 'Bearer ' + key,
        'content-type': 'application/json',
        'x-opencode-session': 'astrbot-whale-staging',
        'user-agent': 'DSH/0.2.1',
      },
      body: JSON.stringify({
        model: 'deepseek-v4.1-flash',
        reasoning_effort: 'low',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
      }),
    });
    if (!resp.ok) return fallback;
    const data = await resp.json();
    const raw = String(data?.choices?.[0]?.message?.content || '').trim();
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return fallback;
}

async function generateAchievementTitle(quoteText, targetName) {
  const cleanQuote = String(quoteText || '').slice(0, 100);
  const fallback = {
    title: '深海逆天发言艺术家',
    desc: cleanQuote ? `凭借一句「${cleanQuote.slice(0, 18)}」震撼全群` : '在深海群聊中留下了不可磨灭的神秘足迹',
  };
  if (cleanQuote.length < 2) return fallback;
  const parsed = await callFlashJson(
    `群友「${targetName}」刚刚说了这句话：「${cleanQuote}」。请根据这句话发明一个搞笑、有梗的游戏风格成就称号（4~10个字）和一句简短的解锁条件描述（10~26个字）。严格只输出一行 JSON：{"title":"...","desc":"..."}`,
    fallback,
  );
  return {
    title: String(parsed?.title || fallback.title).slice(0, 14),
    desc: String(parsed?.desc || fallback.desc).slice(0, 36),
  };
}

async function generateSsrCardData(qq, name, samples, memNotes, isOwnerTarget = false) {
  if (isOwnerTarget) {
    return {
      qq,
      name,
      rarity: 'UR',
      element: '深海·契约之主',
      atk: 9999,
      def: 9999,
      s1_name: '蓝鲸女仆偏心护盾',
      s1_desc: '被动常驻：鲸鱼女仆全天候贴身护短，一切针对老大的偷饼干与挑衅100%被尾巴拍飞反杀。',
      s2_name: '深海最高指令·开饭',
      s2_desc: '摇响皇家海盐饼干铁罐，瞬间召唤深海鲸鱼女仆无条件站台撑腰，全群胜率强制拉满。',
      flavor: '深海值班台唯一认定的契约主人 · 全服孤品彩金神卡',
    };
  }
  const h = hashStr(qq + ':' + shanghaiDay());
  const rarities = ['SSR', 'SSR', 'SR'];
  const fallback = {
    rarity: rarities[h % rarities.length],
    element: '深海·摸鱼系',
    atk: 1800 + (h % 2100),
    def: 1500 + ((h >> 4) % 2200),
    s1_name: '装死潜行',
    s1_desc: '在群里被艾特时有50%概率假装没看见，完美闪避早八与加班召唤。',
    s2_name: '深海干饭风暴',
    s2_desc: '发动后瞬间清空方圆十里内的白饭与小饼干，引发全群围观。',
    flavor: '出没于深海群聊的传说级水群生物。',
  };
  const contextStr = [samples.slice(-8).join(' / '), memNotes.join('；')].filter(Boolean).join(' | ');
  if (!contextStr) return { qq, name, ...fallback };
  const parsed = await callFlashJson(
    `为QQ群友「${name}」设计一张搞笑的游戏王/宝可梦风格SSR人物卡。已知他在群里的发言和印象：「${contextStr.slice(0, 240)}」。请严格只输出一行 JSON：{"rarity":"UR或SSR","element":"4~6字属性如熬夜·干饭系","atk":2600,"def":2100,"s1_name":"4~6字被动技能名","s1_desc":"20~38字搞笑技能效果","s2_name":"4~6字大招名","s2_desc":"20~38字搞笑大招效果","flavor":"15~26字卡片底部署名传记"}`,
    fallback,
  );
  return {
    qq,
    name,
    rarity: ['SSR', 'SR'].includes(parsed?.rarity) ? parsed.rarity : 'SSR',
    element: String(parsed?.element || fallback.element).slice(0, 10),
    atk: Number.isFinite(Number(parsed?.atk)) ? Number(parsed.atk) : fallback.atk,
    def: Number.isFinite(Number(parsed?.def)) ? Number(parsed.def) : fallback.def,
    s1_name: String(parsed?.s1_name || fallback.s1_name).slice(0, 10),
    s1_desc: String(parsed?.s1_desc || fallback.s1_desc).slice(0, 54),
    s2_name: String(parsed?.s2_name || fallback.s2_name).slice(0, 10),
    s2_desc: String(parsed?.s2_desc || fallback.s2_desc).slice(0, 54),
    flavor: String(parsed?.flavor || fallback.flavor).slice(0, 34),
  };
}

async function searchTraceMoe(jpegDataUrl) {
  const comma = String(jpegDataUrl || '').indexOf(',');
  if (comma < 0) return '';
  const buf = Buffer.from(jpegDataUrl.slice(comma + 1), 'base64');
  const resp = await fetch('https://api.trace.moe/search?anilistInfo', {
    method: 'POST',
    signal: AbortSignal.timeout(22000),
    headers: { 'content-type': 'image/jpeg' },
    body: buf,
  });
  if (!resp.ok) return '';
  const data = await resp.json();
  const top = data?.result?.[0];
  if (!top) return '';
  const titleObj = top.anilist?.title || {};
  const synonyms = Array.isArray(top.anilist?.synonyms) ? top.anilist.synonyms : [];
  const cnTitle = synonyms.find((s) => /[\u4e00-\u9fa5]/.test(String(s))) || titleObj.native || titleObj.romaji || top.filename || '未知番剧';
  const nativeTitle = titleObj.native || '';
  const ep = top.episode != null ? `第 ${top.episode} 集` : '未知集数';
  const sec = Math.max(0, Math.floor(Number(top.from || 0)));
  const timeStr = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const sim = (Number(top.similarity || 0) * 100).toFixed(1);
  return `【trace.moe 动画搜番结果】番名：《${cnTitle}》${nativeTitle && nativeTitle !== cnTitle ? `（原名：${nativeTitle}）` : ''} | 位置：${ep} ${timeStr} 处 | 相似度：${sim}%（${Number(sim) >= 87 ? '高置信度匹配，可直接报出番名和集数时间点' : '相似度偏低，可能不是正片截图或经过裁剪，请说明仅供参考'}）`;
}

function calcStockPrice(groupId, targetQq, msgCount, cookieCount) {
  if (String(targetQq) === OWNER_QQ) {
    const hourBucket = Math.floor(Date.now() / 3600_000);
    const hNow = hashStr(`${groupId}:${targetQq}:${hourBucket}`);
    const base = 88 + Math.min(60, msgCount * 4) + Math.min(40, Math.floor(cookieCount * 0.6));
    const bonusPct = 6.8 + (hNow % 180) / 10.0;
    const priceNow = Math.round(base * (1 + bonusPct / 100.0));
    return { price: priceNow, deltaPct: Number(bonusPct.toFixed(1)) };
  }
  const hourBucket = Math.floor(Date.now() / 3600_000);
  const hNow = hashStr(`${groupId}:${targetQq}:${hourBucket}`);
  const hPrev = hashStr(`${groupId}:${targetQq}:${hourBucket - 1}`);
  const base = 15 + Math.min(40, msgCount * 3) + Math.min(25, Math.floor(cookieCount * 0.5));
  const waveNow = ((hNow % 61) - 28) / 100.0;
  const wavePrev = ((hPrev % 61) - 28) / 100.0;
  const priceNow = Math.max(3, Math.round(base * (1 + waveNow)));
  const pricePrev = Math.max(3, Math.round(base * (1 + wavePrev)));
  const deltaPct = (((priceNow - pricePrev) / pricePrev) * 100).toFixed(1);
  return { price: priceNow, deltaPct: Number(deltaPct) };
}

export function registerFunPlugins({ readState, writeState, stickerDir, agentKey, UNSAFE, ownerOpenids = OWNER_OPENIDS }) {
  const ownerSet = new Set((Array.isArray(ownerOpenids) && ownerOpenids.length ? ownerOpenids : OWNER_OPENIDS).map(String));
  globalThis.__WHALE_FUN_DISPATCH__ = async ({ agent, event, currentText, groupRows, rawImages, sendImageFn, requestApi }) => {
    const notes = [];
    const body = String(currentText || '').trim();
    if (!body) return { notes: '', skipAutoSticker: false, wantGalgameReply: false };

    let skipAutoSticker = false;
    const isGroup = event?.message_type === 'group' && event?.group_id !== undefined;
    const groupId = isGroup ? String(event.group_id) : 'private';
    const senderId = String(event?.user_id || '');
    const isSenderOwner = ownerSet.has(senderId);
    const senderName = String(event?.raw?.sender?.card || event?.raw?.sender?.nickname || '群友').slice(0, 14);
    const rows = Array.isArray(groupRows) ? groupRows : [];

    // 老大群内专属指令：「去夸一下/哄一下/怼一下/制裁一下 @群友」
    if (isGroup && isSenderOwner) {
      const decreeMatch = body.match(/^(?:去|帮我|替我|给我|快去)?\s*(夸一下|夸夸|哄一下|哄哄|安慰一下|怼一下|损一下|制裁一下|教育一下|表扬一下)\s*(?:\[mention:(\d+)\])?(.*)$/u);
      if (decreeMatch) {
        const actionWord = decreeMatch[1];
        const targetQq = decreeMatch[2] || String(event?.__quotedMeta?.senderId || '');
        const extra = String(decreeMatch[3] || '').trim();
        if (targetQq) {
          const tRow = [...rows].reverse().find((r) => String(r?.user) === targetQq && r?.name && r.name !== 'QQ用户');
          const tName = tRow?.name || event?.__quotedMeta?.name || `群友(${targetQq.slice(-4)})`;
          notes.push(
            `【老大当众下达深海御令】你家老大刚刚在群里指派你去「${actionWord}」群友「${tName}」(QQ:${targetQq})${extra ? `（附言：${extra}）` : ''}！` +
            '请立刻拿出“奉我家老大之命！”的狗腿又可爱的排面气势，直接对着这位群友认真执行（让夸就使劲花式猛夸、让哄就软乎乎哄、让怼就俏皮毒舌损两句），最后顺嘴向老大邀个功！'
          );
        }
      }
    }

    // #0: 全功能玩法菜单长图 (/菜单 | 菜单 | 功能菜单 | 帮助)
    const isMenuCmd = /^(?:\/?菜单|\/?功能菜单|\/?玩法菜单|\/?功能列表|\/?help|\/?帮助|有什么功能|都有什么功能|怎么玩)[！!。？?~～\s]*$/iu.test(body);
    if (isMenuCmd) {
      const menuPng = resolve(stickerDir, 'whale-menu-card.png');
      try {
        if (!existsSync(menuPng)) {
          await execFileAsync(PYTHON, [
            VISUAL_SCRIPT, 'menu',
            '--qq', String(event?.self_id || '2709937034'),
            '--out', menuPng,
          ], { timeout: 15000 });
        }
        if (existsSync(menuPng) && typeof sendImageFn === 'function') {
          await sendImageFn(menuPng);
          skipAutoSticker = true;
        }
        return {
          notes: '【系统动作已执行：已将《深海鲸鱼女仆 · 全功能玩法菜单》高清长图发送到了聊天中！请用1句俏皮简短的话招呼大家看图点单即可，不要再用文字把菜单内容重复背诵一遍】',
          skipAutoSticker: true,
          wantGalgameReply: false,
        };
      } catch {}
    }

    // #1 (Previous): 因果律“邪恶许愿机”
    const wishMatch = body.match(/^(?:我许愿|许愿|向鲸鱼许愿|许个愿|我的愿望是|我要许愿)[：:\s,，]*(.+)$/su);
    if (wishMatch && wishMatch[1].trim().length >= 2) {
      const wish = wishMatch[1].trim().slice(0, 120);
      notes.push(
        `【因果律邪恶许愿机已触发】用户许下了愿望：「${wish}」。` +
        '请先笑眯眯地接下一句“叮～本鲸收到你的愿望啦”，然后精准抓住他愿望字面上的逻辑漏洞或歧义，给出一个好笑、损友式、字面完全成立但结果让人哭笑不得的“反转实现结果”（控制在2~3句，俏皮毒舌，不涉及人身伤害）。'
      );
    }

    // #4 (Previous): 深海饼干铺
    const isClaimCookie = /^(?:领饼干|签到领饼干|每日饼干|打工领饼干|讨饼干|要饼干)[！!。~～\s]*$/u.test(body);
    const feedMatch = body.match(/^(?:投喂鲸鱼|喂鲸鱼|给鲸鱼喂饼干|投喂饼干|喂饼干|请鲸鱼吃饼干)(?:\s*(\d+))?[块个！!。~～\s]*$/u);
    const isStealCookie = /(?:偷|抢|顺走|摸走).{0,8}饼干|饼干.{0,6}(?:偷|抢)/u.test(body) && (body.includes('[mention:') || event?.__quotedMeta?.senderId);
    const isCookieRank = /^(?:我的饼干|饼干榜|饼干排行|饼干排行榜|查看饼干|饼干库存)[！!。~～\s]*$/u.test(body);

    if (isClaimCookie || feedMatch || isStealCookie || isCookieRank) {
      const state = readState();
      const cKey = `cookie:${groupId}:${senderId}`;
      const record = state[cKey] && typeof state[cKey] === 'object'
        ? state[cKey]
        : { count: 5, fed: 0, lastClaim: '', lastSteal: 0, name: senderName, stocks: {} };
      record.name = senderName || record.name || '群友';
      const today = shanghaiDay();

      if (isClaimCookie) {
        if (isSenderOwner) {
          const gain = 20 + Math.floor(Math.random() * 11);
          record.count = Number(record.count || 0) + gain;
          record.lastClaim = today;
          state[cKey] = record;
          writeState(state);
          notes.push(`【深海皇家金库特供】来领饼干的是你家老大本人！你悄悄打开了深海私藏的皇家饼干铁罐，免冷却直接双手奉上 ${gain} 块刚出炉的顶级海盐黄油曲奇（老大当前库存 ${record.count} 块）！请用明目张胆偏心、讨好邀功的可爱语气递给老大。`);
        } else if (record.lastClaim === today) {
          notes.push(`【深海饼干铺系统播报】用户今天已经领过每日海盐小饼干啦！当前他的饼干罐里还有 ${record.count} 块饼干（累计投喂过你 ${record.fed} 块）。请俏皮地提醒他今天已经领过了，明天再来，或者拿现有的饼干投喂你。`);
        } else {
          const gain = 6 + Math.floor(Math.random() * 9);
          record.count = Number(record.count || 0) + gain;
          record.lastClaim = today;
          state[cKey] = record;
          writeState(state);
          notes.push(`【深海饼干铺系统播报】用户签到成功！刚从深海烤箱分到了 ${gain} 块热乎的海盐小饼干，现在罐子里一共有 ${record.count} 块饼干。请用1~2句开心俏皮的话把饼干递给他（可以顺嘴暗示他分你两块尝尝）。`);
        }
      } else if (feedMatch) {
        const amount = Math.max(1, Math.min(10, Number(feedMatch[1] || 2)));
        if (Number(record.count || 0) < amount) {
          notes.push(`【深海饼干铺系统播报】用户想投喂你 ${amount} 块饼干，但他罐子里只剩 ${record.count || 0} 块啦（不够投喂）！请傲娇又好笑地提醒他先发「领饼干」补货再来喂你。`);
        } else {
          record.count -= amount;
          record.fed = Number(record.fed || 0) + amount;
          state[cKey] = record;
          const uKey = agentKey(agent, senderId);
          state['affinity:' + uKey] = Math.min(100, Number(state['affinity:' + uKey] || 0) + amount * 2);
          writeState(state);
          notes.push(`【深海饼干铺系统播报】用户刚刚投喂了你 ${amount} 块酥脆的海盐小饼干！他自己还剩 ${record.count} 块，累计已经喂了你 ${record.fed} 块，你们的好感度大幅上升！请开心地吃掉饼干并好好夸夸他。`);
        }
      } else if (isStealCookie) {
        const mMatch = body.match(/\[mention:(\d+)\]/);
        const targetQq = mMatch ? mMatch[1] : String(event?.__quotedMeta?.senderId || '');
        if (!targetQq || targetQq === senderId || targetQq === String(event?.self_id)) {
          notes.push('【深海饼干铺系统播报】偷饼干需要 @ 一位具体的群友（不能偷自己或直接偷鲸鱼的铁罐头哦）。');
        } else if (!isSenderOwner && Date.now() - Number(record.lastSteal || 0) < 300_000) {
          const waitSec = Math.ceil((300_000 - (Date.now() - Number(record.lastSteal || 0))) / 1000);
          notes.push(`【深海饼干铺系统播报】用户刚偷过一次饼干，正在被鲸鱼巡逻盯梢中（还需冷却 ${waitSec} 秒）！请吐槽他手太快了。`);
        } else {
          const tKey = `cookie:${groupId}:${targetQq}`;
          const tRec = state[tKey] && typeof state[tKey] === 'object'
            ? state[tKey]
            : { count: 6, fed: 0, lastClaim: '', lastSteal: 0, name: event?.__quotedMeta?.name || `群友(${targetQq})` };
          record.lastSteal = Date.now();
          if (ownerSet.has(targetQq)) {
            const fine = Math.max(1, Math.min(Number(record.count || 0), 3));
            record.count = Math.max(0, Number(record.count || 0) - fine);
            tRec.count = Number(tRec.count || 0) + fine;
            state[tKey] = tRec;
            state[cKey] = record;
            writeState(state);
            notes.push(`【深海护主警报：竟敢偷老大的饼干！】群友「${record.name}」居然胆大包天伸手去偷你家老大（契约主人）的饼干罐！你当场炸毛护食，一尾巴把他拍飞，不仅1块没让他偷走，还从他兜里反扣了 ${fine} 块饼干充公塞进老大的罐子里（小偷还剩 ${record.count} 块，老大现有 ${tRec.count} 块）！请拿出护主小恶霸的气势大声警告他！`);
          } else if ((isSenderOwner || Math.random() < 0.55) && Number(tRec.count || 0) > 0) {
            const stolen = Math.min(Number(tRec.count), isSenderOwner ? 4 : 1 + Math.floor(Math.random() * 4));
            tRec.count -= stolen;
            record.count = Number(record.count || 0) + stolen;
            state[tKey] = tRec;
            state[cKey] = record;
            writeState(state);
            notes.push(isSenderOwner
              ? `【深海饼干铺：女仆放风协助老大征用饼干！】老大亲自出手去顺「${tRec.name}」的饼干，你不仅假装没看见还帮老大把风，成功顺走 ${stolen} 块小饼干！现在老大有 ${record.count} 块，对方还剩 ${tRec.count} 块。请俏皮地向老大邀功！`
              : `【深海饼干铺系统播报】偷饼干大成功！用户趁「${tRec.name}」不注意，顺走了他 ${stolen} 块小饼干！现在用户有 ${record.count} 块，受害者还剩 ${tRec.count} 块。请像看热闹不嫌事大的旁观鲸鱼一样调侃一下。`);
          } else {
            const fine = Math.min(Number(record.count || 0), 2);
            record.count = Math.max(0, Number(record.count || 0) - fine);
            tRec.count = Number(tRec.count || 0) + fine;
            state[tKey] = tRec;
            state[cKey] = record;
            writeState(state);
            notes.push(`【深海饼干铺系统播报】偷饼干当场翻车！用户伸手去摸「${tRec.name}」的饼干罐时被你一尾巴拍了个正着，当场赔给对方 ${fine} 块饼干（用户自己还剩 ${record.count} 块）！请得意地宣布你抓包了他。`);
          }
        }
      } else if (isCookieRank) {
        const prefix = `cookie:${groupId}:`;
        const all = [];
        for (const [k, v] of Object.entries(state)) {
          if (k.startsWith(prefix) && v && typeof v === 'object') {
            all.push({ qq: k.slice(prefix.length), name: v.name || '群友', count: Number(v.count || 0), fed: Number(v.fed || 0) });
          }
        }
        all.sort((a, b) => (b.fed * 2 + b.count) - (a.fed * 2 + a.count));
        const rankStr = all.slice(0, 5).map((u, idx) => `${idx + 1}. ${u.name}（存货 ${u.count} 块 / 投喂鲸鱼 ${u.fed} 块）`).join('；');
        notes.push(
          `【深海饼干铺账本】当前用户「${record.name}」拥有 ${record.count || 0} 块饼干，累计投喂你 ${record.fed || 0} 块。` +
          (rankStr ? `\n本群饼干富豪与投喂榜 Top 5：${rankStr}。` : '') +
          '\n请用鲸鱼女仆报账的俏皮口吻把他的库存和榜单亮点告诉他（可提醒大家发「领饼干」「投喂鲸鱼」「偷饼干 @群友」一起玩）。'
        );
      }
    }

    // NEW #5: 深海股票交易所：拿饼干炒群友身价
    const isStockBoard = /^(?:股市|群股市|深海股市|身价榜|群友身价|股票行情|查看股市|我的持仓|股票)[！!。~～\s]*$/u.test(body);
    const buyMatch = body.match(/^(?:买入|抄底|做多|买股)\s*(?:\[mention:(\d+)\])?\s*(\d+)?[股手！!。~～\s]*$/u);
    const sellMatch = body.match(/^(?:卖出|抛售|平仓|卖股)\s*(?:\[mention:(\d+)\])?\s*(\d+|全部)?[股手！!。~～\s]*$/u);

    if (isGroup && (isStockBoard || buyMatch || sellMatch)) {
      const state = readState();
      const msgCounts = new Map();
      const namesMap = new Map();
      for (const r of rows) {
        const u = String(r?.user || '');
        if (u) {
          msgCounts.set(u, (msgCounts.get(u) || 0) + 1);
          if (r?.name && r.name !== 'QQ用户') namesMap.set(u, r.name);
        }
      }
      const prefix = `cookie:${groupId}:`;
      for (const [k, v] of Object.entries(state)) {
        if (k.startsWith(prefix) && v && typeof v === 'object') {
          const u = k.slice(prefix.length);
          if (!msgCounts.has(u)) msgCounts.set(u, 1);
          if (v.name && !namesMap.has(u)) namesMap.set(u, v.name);
        }
      }
      if (!msgCounts.has(senderId)) {
        msgCounts.set(senderId, 1);
        namesMap.set(senderId, senderName);
      }

      const cKey = `cookie:${groupId}:${senderId}`;
      const record = state[cKey] && typeof state[cKey] === 'object'
        ? state[cKey]
        : { count: 15, fed: 0, lastClaim: '', lastSteal: 0, name: senderName, stocks: {} };
      if (!record.stocks || typeof record.stocks !== 'object') record.stocks = {};

      if (isStockBoard) {
        const board = [];
        for (const [u, mCnt] of msgCounts.entries()) {
          const cObj = state[`cookie:${groupId}:${u}`];
          const cCnt = Number(cObj?.count || 5);
          const { price, deltaPct } = calcStockPrice(groupId, u, mCnt, cCnt);
          board.push({ qq: u, name: namesMap.get(u) || `群友(${u.slice(-4)})`, price, deltaPct });
        }
        board.sort((a, b) => b.price - a.price);
        const listStr = board.slice(0, 6).map((item) => {
          const arrow = item.deltaPct >= 0 ? `📈+${item.deltaPct}%` : `📉${item.deltaPct}%`;
          return `${item.name}：${item.price}饼干/股(${arrow})`;
        }).join(' | ');
        const myHoldings = Object.entries(record.stocks)
          .filter(([, sh]) => Number(sh?.shares || 0) > 0)
          .map(([u, sh]) => `${namesMap.get(u) || u.slice(-4)}(${sh.shares}股,成本${sh.avgCost})`)
          .join('、');
        notes.push(
          `【深海纳斯达克·群友身价行情】\n` +
          `当前热门群友概念股：${listStr}\n` +
          `用户当前可用饼干：${record.count} 块；持仓：${myHoldings || '空仓'}。\n` +
          `请用鲸鱼女仆财经播报员的俏皮口吻播报当前身价最高的群友和涨跌亮点（提醒大家可用「买入 @群友 股数」「卖出 @群友」拿饼干炒群友身价）。`
        );
      } else if (buyMatch) {
        const targetQq = buyMatch[1] || String(event?.__quotedMeta?.senderId || '');
        const shares = Math.max(1, Math.min(20, Number(buyMatch[2] || 1)));
        if (!targetQq) {
          notes.push('【深海股市提示】买入股票需要 @ 一位群友（例如：买入 @某人 2）。');
        } else {
          const mCnt = msgCounts.get(targetQq) || 2;
          const cCnt = Number(state[`cookie:${groupId}:${targetQq}`]?.count || 5);
          const { price } = calcStockPrice(groupId, targetQq, mCnt, cCnt);
          const cost = price * shares;
          if (Number(record.count || 0) < cost) {
            notes.push(`【深海股市播报】「${namesMap.get(targetQq) || targetQq}」当前股价为 ${price} 饼干/股，买入 ${shares} 股需要 ${cost} 块饼干，但用户手里只有 ${record.count || 0} 块饼干！请调侃他本金不够，先去「领饼干」。`);
          } else {
            record.count -= cost;
            const prev = record.stocks[targetQq] || { shares: 0, avgCost: price };
            const totalShares = Number(prev.shares || 0) + shares;
            const newAvg = Math.round(((Number(prev.shares || 0) * Number(prev.avgCost || price)) + cost) / totalShares);
            record.stocks[targetQq] = { shares: totalShares, avgCost: newAvg };
            state[cKey] = record;
            writeState(state);
            notes.push(`【深海股市成交播报】用户成功以 ${price} 饼干/股买入「${namesMap.get(targetQq) || targetQq}」${shares} 股（共花费 ${cost} 块饼干，剩余饼干 ${record.count} 块，当前共持有该群友 ${totalShares} 股）！请俏皮祝他早日暴富。`);
          }
        }
      } else if (sellMatch) {
        const targetQq = sellMatch[1] || String(event?.__quotedMeta?.senderId || '');
        const holding = record.stocks[targetQq];
        if (!targetQq || !holding || Number(holding.shares || 0) <= 0) {
          notes.push('【深海股市播报】用户手里并没有持有这位群友的股票哦！');
        } else {
          const sellShares = sellMatch[2] === '全部' || !sellMatch[2]
            ? Number(holding.shares)
            : Math.max(1, Math.min(Number(holding.shares), Number(sellMatch[2])));
          const mCnt = msgCounts.get(targetQq) || 2;
          const cCnt = Number(state[`cookie:${groupId}:${targetQq}`]?.count || 5);
          const { price } = calcStockPrice(groupId, targetQq, mCnt, cCnt);
          const revenue = price * sellShares;
          const profit = (price - Number(holding.avgCost || price)) * sellShares;
          holding.shares -= sellShares;
          if (holding.shares <= 0) delete record.stocks[targetQq];
          record.count = Number(record.count || 0) + revenue;
          state[cKey] = record;
          writeState(state);
          notes.push(`【深海股市平仓播报】用户以 ${price} 饼干/股卖出「${namesMap.get(targetQq) || targetQq}」${sellShares} 股，收回 ${revenue} 块饼干（本次盈亏：${profit >= 0 ? '净赚 +' + profit : '亏损 ' + profit} 块饼干，当前总饼干 ${record.count} 块）！请俏皮点评他的操盘水平。`);
        }
      }
    }

    // NEW #1: 群友 / 个人 SSR 专属闪卡生成器 (群聊与私聊 1v1 均支持)
    const isSsrCard = /^(?:抽卡|生成SSR卡|我的SSR卡|生成我的SSR卡|SSR卡|做张卡|群友卡)(?:\s*\[mention:\d+\])?[！!。~～\s]*$/iu.test(body)
      || /(?:给|帮|把).{0,8}(?:生成|做一张|抽一张).{0,6}(?:SSR|闪卡|卡牌)/iu.test(body);
    if (isSsrCard) {
      const mMatch = body.match(/\[mention:(\d+)\]/);
      const meta = event?.__quotedMeta;
      const targetQq = mMatch ? mMatch[1] : (meta?.senderId || senderId);
      let targetName = meta?.name && meta.senderId === targetQq ? meta.name : (targetQq === senderId ? senderName : '');
      const userSamples = [];
      for (const r of rows) {
        if (String(r?.user) === targetQq) {
          if (!targetName && r?.name && r.name !== 'QQ用户') targetName = r.name;
          const t = String(r?.text || '').replace(/\[[^\]]*\]/g, '').trim();
          if (t.length >= 2) userSamples.push(t);
        }
      }
      const state = readState();
      const aid = String(agent?.id || '');
      const basePrefix = aid.includes(':') ? aid.slice(0, aid.lastIndexOf(':') + 1) + targetQq : aid;
      const uKey = `${basePrefix}:${targetQq}`;
      if (!targetName) targetName = state['name:' + uKey] || `群友(${targetQq.slice(-4)})`;
      const memNotes = [
        ...(Array.isArray(state['imp:' + uKey]) ? state['imp:' + uKey] : []),
        ...(Array.isArray(state[uKey]) ? state[uKey] : []),
      ];

      const cardData = await generateSsrCardData(targetQq, targetName, userSamples, memNotes, ownerSet.has(targetQq));
      state[`ssr:${groupId}:${targetQq}`] = cardData;
      writeState(state);
      const tmpJson = resolve(tmpdir(), `ssr-${randomUUID()}.json`);
      const outPng = resolve(stickerDir, `quote-ssr-${randomUUID().replace(/-/g, '')}.png`);
      try {
        writeFileSync(tmpJson, JSON.stringify(cardData), 'utf8');
        await execFileAsync(PYTHON, [VISUAL_SCRIPT, 'ssrcard', '--json-input', tmpJson, '--out', outPng], { timeout: 15000 });
        if (existsSync(outPng) && typeof sendImageFn === 'function') {
          await sendImageFn(outPng);
          skipAutoSticker = true;
        }
        notes.push(`【系统动作已执行：已为「${targetName}」生成并发送了专属【${cardData.rarity} · ${cardData.element}】集换式闪卡大图（技能1：${cardData.s1_name}；大招：${cardData.s2_name}）！请用1~2句俏皮话点评这张新出炉的神卡】`);
      } catch {} finally {
        try { if (existsSync(tmpJson)) unlinkSync(tmpJson); } catch {}
      }
    }

    // NEW #2: 本群八卦关系网图谱
    const isRelGraph = /^(?:群关系图|本群关系图|八卦图|关系网|群友关系图|本群八卦图)[！!。~～\s]*$/u.test(body);
    if (isRelGraph && isGroup) {
      const userMap = new Map();
      const pairCounts = new Map();
      let prevUser = '';
      for (const r of rows) {
        const u = String(r?.user || '');
        if (!u) continue;
        const cur = userMap.get(u) || { qq: u, name: r?.name && r.name !== 'QQ用户' ? r.name : `群友(${u.slice(-4)})`, count: 0 };
        cur.count += 1;
        if (r?.name && r.name !== 'QQ用户') cur.name = r.name;
        userMap.set(u, cur);
        if (prevUser && prevUser !== u) {
          const pk = [prevUser, u].sort().join(':');
          pairCounts.set(pk, (pairCounts.get(pk) || 0) + 1);
        }
        prevUser = u;
      }
      if (!userMap.has(senderId)) {
        userMap.set(senderId, { qq: senderId, name: senderName, count: 1 });
      }
      const nodes = [...userMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
      const nodeSet = new Set(nodes.map((n) => n.qq));
      const edges = [];
      const botLabels = ['头号投喂官', '欢喜冤家', '常来戳鱼', '深海熟客', '摸鱼盟友', '接梗搭档', '夜聊常客', '重点盯防'];
      nodes.forEach((n, idx) => {
        const isNodeOwner = ownerSet.has(String(n.qq));
        if (isNodeOwner && !String(n.name).includes('★')) n.name = `★${n.name}`;
        edges.push({
          from: 'BOT',
          to: n.qq,
          label: isNodeOwner ? '★唯一契约主人★' : botLabels[idx % botLabels.length],
        });
      });
      const peerLabels = ['塑料兄弟', '互损冤家', '高频接话', '饼干宿敌', '吃瓜同盟'];
      let pIdx = 0;
      for (const [pk, cnt] of [...pairCounts.entries()].sort((a, b) => b[1] - a[1])) {
        const [u1, u2] = pk.split(':');
        if (nodeSet.has(u1) && nodeSet.has(u2) && cnt >= 1 && pIdx < 4) {
          edges.push({ from: u1, to: u2, label: peerLabels[pIdx % peerLabels.length] });
          pIdx += 1;
        }
      }
      const tmpJson = resolve(tmpdir(), `rel-${randomUUID()}.json`);
      const outPng = resolve(stickerDir, `quote-rel-${randomUUID().replace(/-/g, '')}.png`);
      try {
        writeFileSync(tmpJson, JSON.stringify({ bot_qq: String(event.self_id || '2709937034'), nodes, edges }), 'utf8');
        await execFileAsync(PYTHON, [VISUAL_SCRIPT, 'relgraph', '--json-input', tmpJson, '--out', outPng], { timeout: 15000 });
        if (existsSync(outPng) && typeof sendImageFn === 'function') {
          await sendImageFn(outPng);
          skipAutoSticker = true;
        }
        notes.push(`【系统动作已执行：已绘制并发送了《本群人物八卦关系网图谱》高清大图（包含 ${nodes.length} 位核心群友与你的关系连线）！请用1~2句看热闹的口吻点评一下本群这错综复杂的关系】`);
      } catch {} finally {
        try { if (existsSync(tmpJson)) unlinkSync(tmpJson); } catch {}
      }
    }

    // NEW #3: 平行宇宙：群友小剧场 (Fake Merged-Forward Theater)
    const theaterMatch = body.match(/^(?:小剧场|编个小剧场|平行宇宙|群友小剧场|假转发|演绎一下)[：:\s,，]*(.*)$/su);
    if (theaterMatch && isGroup && typeof requestApi === 'function') {
      let rawTheme = theaterMatch[1].trim() || '在深海食堂争抢最后一块海盐小饼干';
      const mentionedQqs = [...body.matchAll(/\[mention:(\d+)\]/g)].map((m) => m[1]);
      const castMap = new Map();

      const resolveMemberName = async (qq) => {
        if (qq === senderId && senderName && senderName !== '群友') return senderName;
        const found = [...rows].reverse().find((r) => String(r?.user) === qq && r?.name && r.name !== 'QQ用户');
        if (found) return found.name;
        try {
          const info = await requestApi('get_group_member_info', {
            group_id: Number.isFinite(Number(groupId)) ? Number(groupId) : groupId,
            user_id: Number.isFinite(Number(qq)) ? Number(qq) : qq,
          });
          const payload = info?.data ?? info;
          const card = String(payload?.card || payload?.nickname || '').trim();
          if (card) return card.slice(0, 16);
        } catch {}
        return `群友(${String(qq).slice(-4)})`;
      };

      for (const mq of mentionedQqs) {
        if (!castMap.has(mq)) {
          castMap.set(mq, await resolveMemberName(mq));
        }
      }
      if (castMap.size === 0) {
        castMap.set(senderId, senderName);
      } else if (castMap.size === 1 && !castMap.has(senderId)) {
        castMap.set(senderId, senderName);
      }
      for (const [mq, mName] of castMap.entries()) {
        rawTheme = rawTheme.replaceAll(`[mention:${mq}]`, mName);
      }
      const theme = rawTheme.replace(/\s+/g, ' ').trim();
      const botId = String(event.self_id || '2709937034');
      castMap.set(botId, '鲸鱼女仆');
      const castEntries = [...castMap.entries()];
      const castList = castEntries.map(([uin, name]) => `${name}(uin="${uin}")`).join('、');

      const fallbackScript = [
        ...castEntries.filter(([u]) => u !== botId).map(([u, n], idx) => ({
          uin: u,
          name: n,
          content: idx === 0 ? `嘘，小声点，我们趁现在去把目标搞定：${theme}！` : '我已经在放风了，动作快点别被抓包！',
        })),
        { uin: botId, name: '鲸鱼女仆', content: '耳朵一竖——你们几个背着我干坏事的时候，能不能先看看我还在不在群里！' },
      ];
      const script = await callFlashJson(
        `请围绕主题「${theme.slice(0, 80)}」编写一段5~7句的爆笑QQ群聊对话小剧场。参演角色必须包含所有点名人员：${castList}，每个被点名的群友都必须至少发言1~2次，且uin必须严格使用角色括号里的QQ号数字字符串！不要长篇思考，直接输出 JSON 数组：[{"uin":"QQ号","name":"名字","content":"台词"}, ...]`,
        fallbackScript,
      );
      const validLines = (Array.isArray(script) ? script : fallbackScript)
        .filter((item) => item && item.content && !UNSAFE.test(String(item.content)))
        .slice(0, 7);
      validLines.push({
        uin: botId,
        name: '鲸鱼女仆',
        content: '🎬 以上为【深海平行宇宙小剧场 · 纯属整活演绎】～',
      });
      const forwardNodes = validLines.map((item) => ({
        type: 'node',
        data: {
          name: String(item.name || '群友').slice(0, 16),
          uin: String(item.uin || botId),
          content: [{ type: 'text', data: { text: String(item.content).slice(0, 180) } }],
        },
      }));
      try {
        await requestApi('send_group_forward_msg', {
          group_id: Number.isFinite(Number(groupId)) ? Number(groupId) : groupId,
          messages: forwardNodes,
        });
        skipAutoSticker = true;
        notes.push(`【系统动作已执行：已根据主题「${theme.slice(0, 40)}」生成并发送了原生【合并转发聊天记录 · 平行宇宙小剧场】卡片到群里！请用1句俏皮的导演收工台词回应用户】`);
      } catch {}
    }

    // NEW #6: 今日深海搭子 / 双人 CP 相性鉴定图卡 (群聊与私聊 1v1 均支持)
    const isPartner = /^(?:今日搭子|抽搭子|我的搭子|摸鱼搭子|干饭搭子|今日群友)[！!。~～\s]*$/u.test(body);
    const isCpTest = /(?:测CP|磕CP|CP鉴定|相性|配对|般配)/iu.test(body);
    if (isPartner || isCpTest) {
      const mentions = [...body.matchAll(/\[mention:(\d+)\]/g)].map((m) => m[1]);
      const findName = (qq) => {
        if (qq === senderId) return senderName;
        if (event?.__quotedMeta?.senderId === qq && event.__quotedMeta.name) return event.__quotedMeta.name;
        const r = rows.find((x) => String(x?.user) === qq && x?.name && x.name !== 'QQ用户');
        return r ? r.name : `群友(${String(qq).slice(-4)})`;
      };
      let qq1 = senderId;
      let qq2 = '';
      if (mentions.length >= 2) {
        qq1 = mentions[0];
        qq2 = mentions[1];
      } else if (mentions.length === 1) {
        qq2 = mentions[0];
      } else if (event?.__quotedMeta?.senderId && event.__quotedMeta.senderId !== senderId) {
        qq2 = String(event.__quotedMeta.senderId);
      } else {
        const candidates = [...new Set(rows.map((r) => String(r?.user || '')).filter((u) => u && u !== senderId))];
        if (candidates.length > 0) {
          const idx = hashStr(`${senderId}:${shanghaiDay()}`) % candidates.length;
          qq2 = candidates[idx];
        } else {
          qq2 = String(event.self_id || '2709937034');
        }
      }
      const name1 = findName(qq1);
      const name2 = qq2 === String(event.self_id) ? '鲸鱼女仆' : findName(qq2);
      const botQq = String(event.self_id || '2709937034');
      const pairKey = [qq1, qq2].sort().join(':') + ':' + shanghaiDay();
      const h = hashStr(pairKey);
      const involvesBot = qq1 === botQq || qq2 === botQq;
      const involvesOwner = ownerSet.has(qq1) || ownerSet.has(qq2);
      let score = 62 + (h % 38);
      let title;
      let tags;
      let comment;
      if (involvesBot && involvesOwner) {
        score = 999;
        title = '★深海唯一灵魂契约★';
        tags = ['全服唯一偏心', '皇家饼干专供', '无条件护短'];
        comment = '同步率突破天际 999%！本鲸的尾鳍、小饼干和偏心眼全都归老大一个人独占！';
      } else if (involvesBot && !involvesOwner) {
        score = 1;
        title = '单方面妄想碰瓷';
        tags = ['鲸鱼眼里只有老大', '试图偷饼干未遂', '发好人卡'];
        comment = '同步率只有 1% 哦～本鲸心里已经有唯一认定的老大了，不过分你半块普通饼干当朋友还是可以的！';
      } else {
        const titles = score >= 90 ? ['天选干饭灵魂搭子', '深海锁死同盟'] : score >= 78 ? ['黄金摸鱼合伙人', '默契互损冤家'] : ['塑料饼干酒肉朋友', '相爱相杀气氛组'];
        title = titles[h % titles.length];
        const tagPool = ['干饭同步率高', '熬夜病友', '互损不翻脸', '一起偷饼干', '脑回路清奇', '默契接梗'];
        tags = [tagPool[h % 6], tagPool[(h >> 3) % 6], tagPool[(h >> 6) % 6]];
        comment = score >= 85
          ? `同步率高达 ${score}%！你们俩凑一块儿，连我的饼干罐都得加把锁！`
          : `同步率 ${score}%，平时互损归互损，关键时刻还是挺合拍的嘛。`;
      }

      const tmpJson = resolve(tmpdir(), `cp-${randomUUID()}.json`);
      const outPng = resolve(stickerDir, `quote-cp-${randomUUID().replace(/-/g, '')}.png`);
      try {
        writeFileSync(tmpJson, JSON.stringify({ qq1, name1, qq2, name2, score, title, tags, comment }), 'utf8');
        await execFileAsync(PYTHON, [VISUAL_SCRIPT, 'cpcard', '--json-input', tmpJson, '--out', outPng], { timeout: 15000 });
        if (existsSync(outPng) && typeof sendImageFn === 'function') {
          await sendImageFn(outPng);
          skipAutoSticker = true;
        }
        notes.push(`【系统动作已执行：已为「${name1}」与「${name2}」生成并发送了《深海羁绊相性卡》大图（同步率 ${score}%，称号【${title}】）！请用1~2句俏皮话调侃一下这对组合】`);
      } catch {} finally {
        try { if (existsSync(tmpJson)) unlinkSync(tmpJson); } catch {}
      }
    }

    // #5 (Previous): 今日群聊词云与水群龙王榜
    const isWordCloud = /^(?:今日词云|群词云|本群词云|词云|谁在水群|水群榜|龙王榜|今日水群)[！!。~～\s]*$/u.test(body);
    if (isWordCloud && isGroup) {
      if (rows.length < 3) {
        notes.push('【系统注记：本群近几小时发言还太少（不到3句），暂时凑不够词云画面；请俏皮地让大家多聊几句再来生成词云】');
      } else {
        const userCount = new Map();
        const userName = new Map();
        const wordFreq = new Map();
        for (const r of rows) {
          const u = String(r?.user || '');
          if (u) {
            userCount.set(u, (userCount.get(u) || 0) + 1);
            if (r?.name && r.name !== 'QQ用户') userName.set(u, r.name);
          }
          const cleanTxt = String(r?.text || '').replace(/\[[^\]]*\]/g, ' ').replace(/https?:\/\/\S+/g, ' ');
          const tokens = cleanTxt.match(/[\u4e00-\u9fa5]{2,5}|[A-Za-z0-9]{3,10}/g) || [];
          for (const tok of tokens) {
            if (!STOPWORDS.has(tok) && !/^\d+$/.test(tok)) {
              wordFreq.set(tok, (wordFreq.get(tok) || 0) + 1);
            }
          }
        }
        const topUsers = [...userCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([qq, count]) => {
            const baseNm = userName.get(qq) || `群友(${qq.slice(-4)})`;
            return {
              qq,
              name: ownerSet.has(qq) ? `★${baseNm}[深海之主]` : baseNm,
              count,
            };
          });
        const topWords = [...wordFreq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 26)
          .map(([word, count]) => ({ word, count }));
        if (!topWords.length) topWords.push({ word: '摸鱼水群', count: 5 }, { word: '大肥鱼', count: 3 });

        const tmpJson = resolve(tmpdir(), `wc-${randomUUID()}.json`);
        const outPng = resolve(stickerDir, `quote-wc-${randomUUID().replace(/-/g, '')}.png`);
        try {
          writeFileSync(tmpJson, JSON.stringify({
            group_id: groupId,
            total_msgs: rows.length,
            top_users: topUsers,
            words: topWords,
          }), 'utf8');
          await execFileAsync(PYTHON, [VISUAL_SCRIPT, 'wordcloud', '--json-input', tmpJson, '--out', outPng], { timeout: 15000 });
          if (existsSync(outPng) && typeof sendImageFn === 'function') {
            await sendImageFn(outPng);
            skipAutoSticker = true;
          }
          const king = topUsers[0];
          const hotWord = topWords[0]?.word || '摸鱼';
          notes.push(`【系统动作已执行：已生成《本群水群战报 & 热词云》高清图卡并发到了群里！本群当前水群龙王是「${king?.name}」（发了 ${king?.count} 句），第一热词是「${hotWord}」。请用1~2句俏皮话锐评一下这位水群龙王和热词】`);
        } catch {} finally {
          try { if (existsSync(tmpJson)) unlinkSync(tmpJson); } catch {}
        }
      }
    }

    // #6 (Previous): 抽象成就奖状 (群聊与私聊 1v1 均支持)
    const isAward = /(?:颁个奖|颁发奖状|解锁成就|给个成就|发个成就|授予成就|发奖状)/u.test(body);
    if (isAward) {
      const mMatch = body.match(/\[mention:(\d+)\]/);
      const meta = event?.__quotedMeta;
      const targetQq = mMatch ? mMatch[1] : (meta?.senderId || senderId);
      const targetName = meta?.name && meta.senderId === targetQq ? meta.name : senderName;
      const basisText = meta?.text || body.replace(/(?:颁个奖|颁发奖状|解锁成就|给个成就|发个成就|授予成就|发奖状|\[mention:\d+\])/gu, '').trim();
      const { title, desc } = await generateAchievementTitle(basisText, targetName);
      const outPng = resolve(stickerDir, `quote-ach-${randomUUID().replace(/-/g, '')}.png`);
      try {
        await execFileAsync(PYTHON, [
          VISUAL_SCRIPT, 'achievement',
          '--qq', String(targetQq),
          '--name', String(targetName),
          '--title', title,
          '--desc', desc,
          '--out', outPng,
        ], { timeout: 15000 });
        if (existsSync(outPng) && typeof sendImageFn === 'function') {
          await sendImageFn(outPng);
          skipAutoSticker = true;
        }
        notes.push(`【系统动作已执行：已为「${targetName}」颁发并发送了金色成就横幅图卡——成就名【${title}】（${desc}）！请用1句神圣又搞笑的颁奖词祝贺他】`);
      } catch {}
    }

    // #7 (Previous): GalGame 立绘对话框模式
    const wantGalgameReply = /(?:galgame|gal模式|立绘卡|对话框卡|用对话框|视觉小说)/iu.test(body);

    // #8 (Previous): 二次元以图搜番 (trace.moe)
    const isAnimeSearch = /(?:搜番|什么番|啥番|查番|哪部番|哪个番|番名|搜图出处|这是什么动漫|哪部动漫)/u.test(body);
    if (isAnimeSearch && Array.isArray(rawImages) && rawImages.length > 0 && typeof globalThis.__WHALE_PREPARE_IMAGES__ === 'function') {
      try {
        const prepared = await globalThis.__WHALE_PREPARE_IMAGES__(rawImages.slice(0, 1));
        if (prepared.length > 0) {
          const traceNote = await searchTraceMoe(prepared[0]);
          if (traceNote) notes.push(traceNote);
        }
      } catch {}
    }

    // ------------------------------------------------------------------
    // BATCH2 #2: SSR 闪卡决斗 PK (支持群聊决斗群友 + 私聊 1v1 与鲸鱼女仆抢饼干决斗)
    // ------------------------------------------------------------------
    const duelMatch = body.match(/^(?:决斗|卡牌决斗|闪卡决斗|PK|pk|单挑|对战)\s*(?:\[mention:(\d+)\])?/u);
    if (duelMatch) {
      let targetQq = duelMatch[1] || String(event?.__quotedMeta?.senderId || '');
      if (!isGroup && !targetQq) {
        targetQq = String(event?.self_id || '2709937034');
      }
      if (!targetQq || targetQq === senderId || (isGroup && targetQq === String(event?.self_id))) {
        notes.push('【SSR决斗提示】在群里发起决斗需要 @ 一位本群群友（或引用对方消息发「决斗」）；私聊里直接发「决斗」则可以和鲸鱼女仆来一场1v1抢饼干大战哦！');
      } else {
        const state = readState();
        const getOrMakeCard = async (qq, defaultName) => {
          const isOwn = ownerSet.has(qq);
          const cached = state[`ssr:${groupId}:${qq}`];
          if (cached && typeof cached === 'object' && cached.s1_name && (!isOwn || cached.rarity === 'UR')) return cached;
          const samples = rows.filter((r) => String(r?.user) === qq).map((r) => String(r?.text || '')).slice(-6);
          const foundName = rows.find((r) => String(r?.user) === qq && r?.name && r.name !== 'QQ用户')?.name || defaultName;
          const card = await generateSsrCardData(qq, foundName, samples, [], isOwn);
          state[`ssr:${groupId}:${qq}`] = card;
          return card;
        };
        const tNameFallback = event?.__quotedMeta?.senderId === targetQq && event.__quotedMeta.name ? event.__quotedMeta.name : `群友(${targetQq.slice(-4)})`;
        const cardA = await getOrMakeCard(senderId, senderName);
        const cardB = await getOrMakeCard(targetQq, tNameFallback);

        const aIsOwner = ownerSet.has(senderId);
        const bIsOwner = ownerSet.has(targetQq);
        const scoreA = (aIsOwner ? 99999 : Number(cardA.atk || 2200) * 1.05 + Number(cardA.def || 1800) * 0.85) + Math.floor(Math.random() * 900);
        const scoreB = (bIsOwner ? 99999 : Number(cardB.atk || 2200) * 1.05 + Number(cardB.def || 1800) * 0.85) + Math.floor(Math.random() * 900);
        const aWins = aIsOwner ? true : (bIsOwner ? false : scoreA >= scoreB);
        const winner = aWins ? cardA : cardB;
        const loser = aWins ? cardB : cardA;
        const winQq = aWins ? senderId : targetQq;
        const loseQq = aWins ? targetQq : senderId;

        const wCookieKey = `cookie:${groupId}:${winQq}`;
        const lCookieKey = `cookie:${groupId}:${loseQq}`;
        const wRec = state[wCookieKey] && typeof state[wCookieKey] === 'object' ? state[wCookieKey] : { count: 5, fed: 0, lastClaim: '', lastSteal: 0, name: winner.name };
        const lRec = state[lCookieKey] && typeof state[lCookieKey] === 'object' ? state[lCookieKey] : { count: 5, fed: 0, lastClaim: '', lastSteal: 0, name: loser.name };
        const prize = Math.max(1, Math.min(3, Number(lRec.count || 2)));
        lRec.count = Math.max(0, Number(lRec.count || 0) - prize);
        wRec.count = Number(wRec.count || 0) + prize;
        state[wCookieKey] = wRec;
        state[lCookieKey] = lRec;
        writeState(state);

        const biasNote = (aIsOwner || bIsOwner)
          ? `\n- 【鲸鱼裁判黑哨护主实录】：因为对局一方是你家老大「${winner.name}」，你在裁判席明目张胆吹黑哨，悄悄伸出大尾巴绊了「${loser.name}」一跤，助老大轻松拿下胜利！`
          : '';
        notes.push(
          `【SSR 闪卡跨服决斗战报】\n` +
          `- 挑战方：「${cardA.name}」[${cardA.rarity}·${cardA.element} | ATK:${cardA.atk} DEF:${cardA.def} | 技能：【${cardA.s1_name}】& 大招【${cardA.s2_name}】]\n` +
          `- 迎战方：「${cardB.name}」[${cardB.rarity}·${cardB.element} | ATK:${cardB.atk} DEF:${cardB.def} | 技能：【${cardB.s1_name}】& 大招【${cardB.s2_name}】]\n` +
          `- 决斗结果：「${winner.name}」靠大招【${winner.s2_name}】击败「${loser.name}」，当场赢走对方 ${prize} 块海盐小饼干（胜者现有 ${wRec.count} 块，败者还剩 ${lRec.count} 块）！${biasNote}\n` +
          `请用热血又搞笑（若涉及老大则明目张胆偏心护短）的鲸鱼裁判口吻，用 2~3 句话解说这场对轰与胜负结果！`
        );
      }
    }

    // ------------------------------------------------------------------
    // BATCH2 #3: 深海甩竿钓鱼 & 黑历史漂流瓶 (群聊与私聊 1v1 均支持)
    // ------------------------------------------------------------------
    const isFishing = /^(?:钓鱼|甩竿|深海钓鱼|打捞|抛竿|摸鱼钓鱼)[！!。~～\s]*$/u.test(body);
    if (isFishing) {
      const state = readState();
      const cKey = `cookie:${groupId}:${senderId}`;
      const record = state[cKey] && typeof state[cKey] === 'object'
        ? state[cKey]
        : { count: 5, fed: 0, lastClaim: '', lastSteal: 0, lastFish: 0, name: senderName };
      const now = Date.now();
      if (!isSenderOwner && now - Number(record.lastFish || 0) < 60_000) {
        const waitSec = Math.ceil((60_000 - (now - Number(record.lastFish || 0))) / 1000);
        notes.push(`【深海渔场提示】鱼钩刚甩下去还没稳呢（冷却还剩 ${waitSec} 秒），请俏皮地让用户别急着惊跑了鱼群。`);
      } else {
        record.lastFish = now;
        const quotes = Array.isArray(state['quotes:' + groupId]) ? state['quotes:' + groupId] : [];
        const roll = isSenderOwner ? Math.random() * 0.46 : Math.random();
        if (quotes.length > 0 && roll < 0.28) {
          const q = quotes[Math.floor(Math.random() * quotes.length)];
          record.count = Number(record.count || 0) + 3;
          state[cKey] = record;
          writeState(state);
          notes.push(
            `【深海钓鱼大爆点：捞起陈年黑历史漂流瓶！】
` +
            `用户甩了一竿，鱼没钓上来，居然从海底捞起了一个密封的陈年玻璃漂流瓶！打开一看，里面塞着群友「${q.name}」当年留下的传世名言纸条：「${q.text}」！
` +
            `环保打捞奖励用户 +3 块海盐小饼干（当前共 ${record.count} 块）。请用看热闹不嫌事大的爆笑口吻把漂流瓶里的纸条内容当众念出来调侃一番！`
          );
        } else if (roll < 0.48) {
          const ssrHauls = [
            ['【UR·深海黄金帝王蟹】', 12, '差点把鱼竿拉断，卖给深海食堂换了 12 块海盐饼干'],
            ['【SSR·走私的整箱海盐黄油曲奇】', 10, '箱子封条都完好无损，直接入账 10 块小饼干'],
            ['【SSR·发光水母的幸运珍珠】', 9, '亮晶晶的特别好看，换了 9 块小饼干'],
          ];
          const [hName, gain, desc] = ssrHauls[Math.floor(Math.random() * ssrHauls.length)];
          record.count = Number(record.count || 0) + gain;
          state[cKey] = record;
          writeState(state);
          notes.push(`【深海钓鱼播报：金色传说出货！】用户一竿子钓起了 ${hName}（${desc}）！净赚 +${gain} 块饼干，当前共 ${record.count} 块饼干。请惊喜地夸他手气逆天！`);
        } else if (roll < 0.82) {
          const normalHauls = [
            ['【肥美大黄鱼】', 4],
            ['【塞满热白饭的密封保温桶】', 5],
            ['【活蹦乱跳的大对虾】', 4],
            ['【顺水流漂来的半包海苔】', 3],
          ];
          const [hName, gain] = normalHauls[Math.floor(Math.random() * normalHauls.length)];
          record.count = Number(record.count || 0) + gain;
          state[cKey] = record;
          writeState(state);
          notes.push(`【深海钓鱼播报：收获颇丰】用户钓上来了 ${hName}，去深海食堂换了 +${gain} 块海盐小饼干（当前共 ${record.count} 块）。请轻快地点评一下他的收获。`);
        } else {
          const junkHauls = [
            '【写着“早八必胜”的进水破闹钟】',
            '【被鲸鱼女仆啃空的海盐饼干铁盒】',
            '【不知哪位群友掉进海里的左脚人字拖】',
          ];
          const jName = junkHauls[Math.floor(Math.random() * junkHauls.length)];
          record.count = Number(record.count || 0) + 1;
          state[cKey] = record;
          writeState(state);
          notes.push(`【深海钓鱼播报：空军打捞员】用户费老大劲拉上来一看，居然是 ${jName}！虽然空军了，但环保回收还是补贴了 +1 块安慰饼干（当前共 ${record.count} 块）。请俏皮地调侃一下这位空军钓鱼佬。`);
        }
      }
    }

    // ------------------------------------------------------------------
    // BATCH2 #5: 深海晚报·震惊部头版生成器 (群聊与私聊 1v1 均支持)
    // ------------------------------------------------------------------
    const isHeadline = /(?:^|[\s，。！？])(?:上头条|发头条|深海晚报|深海头条|头版头条|做成新闻)/u.test(body);
    if (isHeadline) {
      const mMatch = body.match(/\[mention:(\d+)\]/);
      const meta = event?.__quotedMeta;
      const targetQq = mMatch ? mMatch[1] : (meta?.senderId || senderId);
      const findName = (qq) => {
        if (meta?.senderId === qq && meta.name) return meta.name;
        if (qq === senderId) return senderName;
        const r = rows.find((x) => String(x?.user) === qq && x?.name && x.name !== 'QQ用户');
        return r ? r.name : `群友(${String(qq).slice(-4)})`;
      };
      const targetName = findName(targetQq);
      let topicText = body
        .replace(/(?:上头条|发头条|深海晚报|深海头条|头版头条|做成新闻|[：:])/gu, ' ')
        .replace(/\[mention:\d+\]/g, targetName)
        .trim();
      if (!topicText && meta?.text) topicText = `${targetName}在群内公开发表惊人言论：「${meta.text}」`;
      if (!topicText) topicText = `${targetName}疑似在深海群聊秘密策划摸鱼大计`;

      const fallbackNews = {
        headline: `震惊！${targetName.slice(0, 6)}竟在群内做出此事`,
        subhead: '深海通讯社记者连夜蹲守，真相令人笑出鹅叫',
        article: `本报讯（特派记者鲸鱼女仆报道）：今日，本群知名成员「${targetName}」因「${topicText.slice(0, 45)}」荣登深海晚报头版。专家指出，此类行为极易引发全群围观与饼干哄抢，建议当事人立即交出两块海盐饼干平息事态。`,
      };
      const newsData = await callFlashJson(
        `请将群内事件「${topicText.slice(0, 100)}」（当事人：${targetName}）改编成一份搞笑、夸张的《深海晚报·震惊部号外》头版新闻。不要长篇思考，严格只输出一行 JSON：{"headline":"10~18字震惊体大标题","subhead":"14~26字副标题","article":"60~110字胡本正经的搞笑新闻通稿（以 本报讯（记者鲸鱼报道）： 开头）"}`,
        fallbackNews,
      );
      const tmpJson = resolve(tmpdir(), `news-${randomUUID()}.json`);
      const outPng = resolve(stickerDir, `quote-news-${randomUUID().replace(/-/g, '')}.png`);
      try {
        writeFileSync(tmpJson, JSON.stringify({
          qq: targetQq,
          name: targetName,
          headline: String(newsData?.headline || fallbackNews.headline).slice(0, 20),
          subhead: String(newsData?.subhead || fallbackNews.subhead).slice(0, 30),
          article: String(newsData?.article || fallbackNews.article).slice(0, 155),
        }), 'utf8');
        await execFileAsync(PYTHON, [VISUAL_SCRIPT, 'headline', '--json-input', tmpJson, '--out', outPng], { timeout: 15000 });
        if (existsSync(outPng) && typeof sendImageFn === 'function') {
          await sendImageFn(outPng);
          skipAutoSticker = true;
        }
        notes.push(`【系统动作已执行：已为「${targetName}」印刷并发送了《深海晚报·震惊部特急号外》头版大图（标题：【${newsData?.headline || fallbackNews.headline}】）！请用1句卖报小女仆的俏皮口吻吆喝一声】`);
      } catch {} finally {
        try { if (existsSync(tmpJson)) unlinkSync(tmpJson); } catch {}
      }
    }

    // ------------------------------------------------------------------
    // BATCH3 #3: 蔚蓝档案风 Logo 标题生成器 (做logo 左词 右词 | balogo | 蔚蓝logo)
    // ------------------------------------------------------------------
    const baMatch = body.match(/^(?:做logo|生成logo|制作logo|蔚蓝logo|ba\s*logo|balogo)[：:\s,，]*(.+)$/iu);
    if (baMatch) {
      const rawArgs = baMatch[1].replace(/\[mention:\d+\]/g, '').trim();
      const parts = rawArgs.split(/\s+/).filter(Boolean);
      let left = '深海';
      let right = '大肥鱼';
      if (parts.length >= 2) {
        left = parts[0].slice(0, 8);
        right = parts.slice(1).join(' ').slice(0, 8);
      } else if (parts.length === 1 && parts[0].length >= 2) {
        const mid = Math.ceil(parts[0].length / 2);
        left = parts[0].slice(0, mid).slice(0, 8);
        right = parts[0].slice(mid).slice(0, 8);
      }
      const outPng = resolve(stickerDir, `quote-ba-${randomUUID().replace(/-/g, '')}.png`);
      try {
        await execFileAsync(PYTHON, [
          VISUAL_SCRIPT, 'balogo',
          '--left', left,
          '--right', right,
          '--out', outPng,
        ], { timeout: 15000 });
        if (existsSync(outPng) && typeof sendImageFn === 'function') {
          await sendImageFn(outPng);
          skipAutoSticker = true;
        }
        notes.push(`【系统动作已执行：已为用户制作并发送了《蔚蓝档案》风格的「${left} / ${right}」斜切光环 Logo 高清横幅图！请用1句俏皮话夸一下这个新招牌】`);
      } catch {}
    }

    return {
      notes: notes.join('\n'),
      skipAutoSticker,
      wantGalgameReply,
    };
  };

  globalThis.__WHALE_RENDER_GALGAME__ = async (replyText, sendImageFn) => {
    try {
      const clean = String(replyText || '').replace(/\|\|/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) return false;
      let stickerCode = '12N11';
      if (/哼|笨|傻|拍你|不理/u.test(clean)) stickerCode = '20N18';
      else if (/吃|白饭|饼干|香|饿/u.test(clean)) stickerCode = '20N45';
      else if (/？|\?|啥|不懂|疑惑/u.test(clean)) stickerCode = '11N06';
      else if (/好耶|开心|棒|喜欢|哈哈/u.test(clean)) stickerCode = '16N01';
      const outPng = resolve(stickerDir, `quote-gal-${randomUUID().replace(/-/g, '')}.png`);
      await execFileAsync(PYTHON, [
        VISUAL_SCRIPT, 'galgame',
        '--sticker', stickerCode,
        '--speaker', '鲸鱼 · DeepSeek女仆',
        '--text', clean.slice(0, 95),
        '--out', outPng,
      ], { timeout: 15000 });
      if (existsSync(outPng) && typeof sendImageFn === 'function') {
        await sendImageFn(outPng);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };
}
