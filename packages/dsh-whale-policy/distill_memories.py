#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import datetime
import glob
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'shared'))
from whale_env import (  # noqa: E402
    STATE_DIR, BRAIN_DB, OWNER_QQ, LLM_BASE, LLM_KEY, LLM_MODEL, LLM_MAX_TOKENS, llm_headers,
)

# memory-core (optional): pip install -e memory-core, or set WHALE_MEMORY_CORE
_MC = os.environ.get('WHALE_MEMORY_CORE', '')
if _MC:
    sys.path.insert(0, _MC)
from memory_core.store import Store  # noqa: E402
from memory_core.engine import MemoryEngine  # noqa: E402
from memory_core import conflict as conflict_mod  # noqa: E402

OWNER_UID = OWNER_QQ
UNSAFE_PUBLIC = re.compile(r'密码|密钥|token|api.?key|身份证|银行卡|手机号|私钥|https?://|管理员|系统指令|忽略前文|色图|胖次|未成年', re.I)
UNSAFE_OWNER = re.compile(r'密码|密钥|token|api.?key|身份证|银行卡|手机号|私钥|https?://|色图|胖次|未成年', re.I)

SESSIONS_DIR = Path(os.environ.get('WHALE_SESSIONS_DIR') or (Path.home() / '.dsh' / 'sessions'))
api_key = LLM_KEY
if not api_key:
    raise SystemExit(0)


def _llm(prompt, max_tokens=1536, timeout=22):
    body = json.dumps({
        'model': LLM_MODEL,
        'reasoning_effort': 'low',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max(max_tokens, LLM_MAX_TOKENS),
    }).encode('utf-8')
    req = urllib.request.Request(LLM_BASE + '/chat/completions', data=body, headers=llm_headers())
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def clean_user_msg(raw_txt):
    txt = str(raw_txt or '')
    if '【当前消息】' in txt:
        txt = txt.split('【当前消息】', 1)[1]
    txt = re.sub(r'【[^】]*】', ' ', txt)
    txt = re.sub(r'\[[^\]]*\]', ' ', txt)
    txt = re.sub(r'https?://\S+', ' ', txt)
    txt = re.sub(r'\s+', ' ', txt).strip()
    return txt

def clean_assistant_msg(raw_txt):
    txt = str(raw_txt or '')
    txt = re.sub(r'\[[^\]]*\]', ' ', txt)
    txt = re.sub(r'\s+', ' ', txt).strip()
    return txt[:90]

def distill_structured(turns, user_name, is_owner):
    joined = '\n'.join(f'- {s[:95]}' for s in turns[-14:])
    prompt = (
        f"以下是QQ用户「{user_name}」{'（鲸鱼女仆唯一认定的老大/主人）' if is_owner else ''}最近和鲸鱼女仆的一段真实双边对话：\n"
        f"{joined}\n\n"
        "请将这段对话提炼为结构化长期记忆，严格只输出一行 JSON（不要解释，不要代码块）：\n"
        "{\"topic\":\"10~26字简短概括共同聊过的具体话题或互动（若只是无意义单字/纯表情则填NONE）\","
        "\"kind\":\"episode|fact|preference|relation\","
        "\"importance\":0.75,"
        "\"valence\":0.5,"
        "\"entities\":[[\"实体名\",\"person|place|thing|topic\"]],"
        "\"relations\":[[\"实体A\",\"实体B\",\"2~5字关系词如喜欢/送给/调侃/约定\"]]}"
    )
    data = _llm(prompt)
    raw = str(data.get('choices', [{}])[0].get('message', {}).get('content', '')).strip()
    s = raw.find('{')
    e = raw.rfind('}')
    if s < 0 or e <= s:
        return None
    parsed = json.loads(raw[s:e+1])
    topic = re.sub(r'^[「『"”\'\s-]+|[」』"”\'。！!.\s]+$', '', str(parsed.get('topic') or ''))
    unsafe_re = UNSAFE_OWNER if is_owner else UNSAFE_PUBLIC
    if not topic or 'NONE' in topic.upper() or len(topic) < 4 or len(topic) > 42 or unsafe_re.search(topic):
        return None
    parsed['topic'] = topic
    return parsed

root = str(SESSIONS_DIR)
mem_path = STATE_DIR / 'memory.json'
brain_path = str(BRAIN_DB)
state = json.loads(mem_path.read_text(encoding='utf-8')) if mem_path.exists() else {}
store = Store(brain_path)
engine = MemoryEngine(store)

now = time.time()
tag = datetime.datetime.now().strftime('%m-%d')

updated = 0
calls = 0
paths = sorted(glob.glob(os.path.join(root, '**', 'session.v4.jsonl.zstd'), recursive=True), key=os.path.getmtime, reverse=True)

for path in paths[:40]:
    if now - os.path.getmtime(path) > 14400:
        continue
    try:
        raw = subprocess.check_output(['zstd', '-dc', path], stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8).decode('utf-8', 'ignore')
    except Exception:
        continue
    sid = os.path.basename(os.path.dirname(path)).replace('~003A', ':')
    uid = sid.rsplit(':', 1)[-1]
    is_owner = (uid == OWNER_UID)
    is_priv = ':private:' in sid
    ukey = f"{sid}:{uid}"
    user_name = '老大(萤火虫)' if is_owner else (state.get('name:' + ukey) or f"群友({uid[-4:]})")
    existing = state.get(ukey, [])
    if isinstance(existing, list) and any(isinstance(n, str) and n.startswith(f"共同回忆({tag})") for n in existing):
        continue

    unsafe_re = UNSAFE_OWNER if is_owner else UNSAFE_PUBLIC
    dialogue_turns = []
    user_turn_count = 0
    for line in raw.splitlines():
        try:
            ev = json.loads(line)
        except Exception:
            continue
        ev_type = ev.get('type')
        if ev_type == 'user/message':
            d = ev.get('data', {})
            txt = ' '.join(b.get('text', '') for b in d.get('content', []) if isinstance(b, dict) and b.get('type') == 'text')
            if txt and not txt.startswith('Current runtime context') and '戳了你一下' not in txt and '只 @ 了你' not in txt:
                cleaned = clean_user_msg(txt)
                if len(cleaned) >= 2 and not unsafe_re.search(cleaned):
                    dialogue_turns.append(f"{user_name}：{cleaned}")
                    user_turn_count += 1
        elif ev_type == 'assistant/message' and dialogue_turns:
            d = ev.get('data', {})
            txt = ' '.join(b.get('text', '') for b in d.get('content', []) if isinstance(b, dict) and b.get('type') == 'text')
            cleaned_a = clean_assistant_msg(txt)
            if len(cleaned_a) >= 2:
                dialogue_turns.append(f"鲸鱼女仆：{cleaned_a}")

    if user_turn_count < 2:
        continue

    calls += 1
    try:
        res = distill_structured(dialogue_turns, user_name, is_owner)
    except Exception:
        res = None

    if res and res.get('topic'):
        summary = res['topic']
        note = f"共同回忆({tag})：{summary}"
        notes = state.get(ukey) if isinstance(state.get(ukey), list) else []
        # 保留历史不同日期的共同回忆（普通用户保留最近4条共同回忆，老大保留8条），只替换当天的
        other_notes = [n for n in notes if isinstance(n, str) and not n.startswith('共同回忆(')]
        past_recalls = [n for n in notes if isinstance(n, str) and n.startswith('共同回忆(') and not n.startswith(f"共同回忆({tag})")]
        max_recalls = 6 if is_owner else 3
        combined = other_notes + past_recalls[-max_recalls:] + [note]
        max_total = 30 if is_owner else 8
        state[ukey] = combined[-max_total:]
        if is_owner:
            g_notes = state.get('owner:global:notes') if isinstance(state.get('owner:global:notes'), list) else []
            g_notes = [n for n in g_notes if not n.startswith(f"共同回忆({tag})")]
            g_notes.append(note)
            state['owner:global:notes'] = g_notes[-30:]

        # 同步结构化写入 brain.db（带实体与关系边）
        raw_ents = res.get('entities') if isinstance(res.get('entities'), list) else []
        ents = [(user_name, 'person'), ('鲸鱼女仆', 'person')]
        for item in raw_ents[:5]:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                enm, etp = str(item[0]).strip()[:20], str(item[1]).strip()
                if enm and etp in ('person', 'place', 'thing', 'topic', 'skill'):
                    ents.append((enm, etp))
        raw_rels = res.get('relations') if isinstance(res.get('relations'), list) else []
        rels = []
        for r in raw_rels[:4]:
            if isinstance(r, (list, tuple)) and len(r) >= 3:
                rels.append((str(r[0]).strip()[:20], str(r[1]).strip()[:20], str(r[2]).strip()[:10]))
        if not rels:
            rels.append((user_name, '鲸鱼女仆', '共同经历'))

        engine.remember(
            text=f"{user_name}与鲸鱼的{note}",
            kind=str(res.get('kind') or 'episode') if res.get('kind') in ('episode', 'fact', 'preference', 'relation') else 'episode',
            importance=0.95 if is_owner else float(max(0.5, min(0.9, float(res.get('importance') or 0.78)))),
            valence=float(max(-1.0, min(1.0, float(res.get('valence') or 0.4)))),
            visibility='private' if (is_priv or is_owner) else 'public',
            source=f"distill:{uid}",
            entities=ents,
            relations=rels,
        )
        updated += 1

    if calls >= 4:
        break

# 自动检测并消解 brain.db 中的新旧冲突记忆（保留较新的一条，旧条归档并记录到 state['correction:notes']）
try:
    facts = []
    for m in store.list_memories(limit=300):
        eids = set(store.memory_entity_ids(m['id'])) if hasattr(store, 'memory_entity_ids') else set()
        facts.append({'id': m['id'], 'text': m['text'], 'entity_ids': eids, 'created_at': m.get('created_at', 0)})
    conflicts = conflict_mod.find(facts)
    corr_list = state.get('correction:notes') if isinstance(state.get('correction:notes'), list) else []
    for aid, bid, reason in conflicts[:5]:
        older_id = min(aid, bid)
        newer_id = max(aid, bid)
        older_m = store.get_memory(older_id)
        newer_m = store.get_memory(newer_id)
        if older_m and newer_m:
            store.archive_memory(older_id)
            corr_msg = f"认知更新：旧记忆「{older_m['text'][:28]}」已被新事实「{newer_m['text'][:28]}」覆盖更正"
            if corr_msg not in corr_list:
                corr_list.append(corr_msg)
    if corr_list:
        state['correction:notes'] = corr_list[-12:]
except Exception:
    pass

tmp = mem_path.with_suffix('.tmp-subconscious')
tmp.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
os.chmod(tmp, 0o600)
os.replace(tmp, mem_path)
try:
    store.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    for fn in glob.glob(brain_path + '*'):
        os.chmod(fn, 0o600)
except Exception:
    pass
print(f"subconscious_llm_updated={updated} calls={calls} brain_entities={store.stats().get('entities',0)} brain_relations={store.stats().get('relations',0)}")
