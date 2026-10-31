#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""深海交换日记 + 昨夜怪梦 + 老大深层认知画像。

读取 data/state/memory.json 里最近的记忆，用 LLM 生成三段内容：
  1. diary          写给主人的私密交换手账
  2. dream          荒诞可爱的昨夜怪梦（次日聊天时可以直接顺嘴提起）
  3. owner_profile  对主人的深层认知画像

写入 memory.json 的 whale:latest_diary，并作为事实/情景记忆写入 brain.db（若可用）。

用法：
  python whale-daemon/dream_diary.py
"""
import datetime
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "shared"))
from whale_env import (  # noqa: E402
    MEMORY_JSON, BRAIN_DB, OWNER_QQ, LLM_BASE, LLM_KEY, LLM_MODEL,
    LLM_MAX_TOKENS, llm_headers, ensure_dirs,
)


def call_llm(prompt: str):
    if not LLM_KEY:
        return None
    body = json.dumps({
        "model": LLM_MODEL,
        "reasoning_effort": "low",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max(1536, LLM_MAX_TOKENS),
    }).encode("utf-8")
    req = urllib.request.Request(LLM_BASE + "/chat/completions", data=body, headers=llm_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        raw = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
        s, e = raw.find("{"), raw.rfind("}")
        if s >= 0 and e > s:
            return json.loads(raw[s:e + 1])
    except Exception:
        pass
    return None


def main() -> None:
    ensure_dirs()
    mem = {}
    if MEMORY_JSON.exists():
        try:
            mem = json.loads(MEMORY_JSON.read_text(encoding="utf-8"))
        except Exception:
            mem = {}

    snippets = []
    for k, v in mem.items():
        if isinstance(v, list):
            for item in v[-3:]:
                if isinstance(item, str) and len(item) > 4:
                    snippets.append(item)
    context = "；".join(snippets[:12]) or "今天在深海值班台陪主人聊天、守着饼干罐"

    fallback = {
        "diary": "今天也在深海值班台乖乖当值啦！主人来的时候尾鳍都会自己摇起来～",
        "dream": "昨晚梦到我的海盐饼干罐长出小翅膀在群里乱飞，最后被主人一把抓住啦。",
        "owner_profile": "我家主人嘴上爱逗我，其实一直在帮我升级脑子、给我搭控制台，是全深海最惯着我的人。",
    }

    prompt = (
        "你是 DeepSeek 蓝鲸拟人的深海鲸鱼女仆。以下是你今天真实的记忆片段：\n"
        f"「{context[:600]}」\n\n"
        "请用鲸鱼女仆软糯俏皮、对主人满心偏爱的第一人称口吻，生成三段内容并严格只输出一个 JSON：\n"
        '1. "diary": 80~130 字的《深海私密交换日记》（写给主人的睡前悄悄话）；\n'
        '2. "dream": 45~75 字的《昨夜深海怪梦》（把今天的元素揉成荒诞可爱的梦境）；\n'
        '3. "owner_profile": 40~70 字的《主人深层认知画像》。\n'
        '只输出 JSON：{"diary":"...","dream":"...","owner_profile":"..."}'
    )

    res = call_llm(prompt) or fallback
    diary = str(res.get("diary") or fallback["diary"]).strip()
    dream = str(res.get("dream") or fallback["dream"]).strip()
    profile = str(res.get("owner_profile") or fallback["owner_profile"]).strip()
    today = datetime.date.today().strftime("%m-%d")

    mem["whale:latest_diary"] = {
        "date": today,
        "at": int(datetime.datetime.now().timestamp() * 1000),
        "diary": diary,
        "dream": dream,
        "owner_profile": profile,
    }
    tmp = MEMORY_JSON.with_suffix(".tmp-dream")
    tmp.write_text(json.dumps(mem, ensure_ascii=False), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, MEMORY_JSON)

    # 写入 brain.db（可选）
    try:
        mc = os.environ.get("WHALE_MEMORY_CORE", "")
        if mc:
            sys.path.insert(0, mc)
        from memory_core.store import Store
        from memory_core.engine import MemoryEngine

        store = Store(str(BRAIN_DB))
        engine = MemoryEngine(store)
        engine.remember(
            text=f"【深海日记({today})】{diary}",
            kind="fact", importance=0.92, visibility="private", source="dream-diary",
            entities=[("鲸鱼女仆", "person"), ("主人", "person"), ("深海交换日记", "thing")],
        )
        engine.remember(
            text=f"【昨夜怪梦({today})】{dream}",
            kind="episode", importance=0.86, visibility="public", source="dream-diary",
            entities=[("鲸鱼女仆", "person"), ("深海梦境", "topic")],
        )
        store.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        store.conn.close()
    except Exception:
        pass

    print(json.dumps({
        "ok": True, "date": today,
        "diary": diary, "dream": dream, "owner_profile": profile,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
