#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 memes 拼音 / 首字母索引（离线一次，之后运行时查表 <1ms）。

输入：data/self/meme-knowledge.json   {"entries":[{"meme":"内卷","meaning":"..."}]}
输出：data/state/meme-knowledge-indexed.json

用法：
  pip install pypinyin
  python scripts/build_meme_index.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "shared"))
from whale_env import STATE_DIR, MEME_LIBRARY, ensure_dirs  # noqa: E402


def main() -> None:
    ensure_dirs()
    if not MEME_LIBRARY.exists():
        print(f"missing {MEME_LIBRARY}")
        return
    try:
        from pypinyin import Style, pinyin
    except ImportError:
        print("need: pip install pypinyin")
        return

    data = json.loads(MEME_LIBRARY.read_text(encoding="utf-8"))
    indexed = []
    for entry in data.get("entries") or []:
        meme = str(entry.get("meme") or "").strip()
        if not meme:
            continue
        py = "".join(i[0] for i in pinyin(meme, style=Style.NORMAL))
        abbr = "".join(i[0][0] for i in pinyin(meme, style=Style.FIRST_LETTER))
        entry["pinyin"] = py
        entry["abbr"] = abbr
        indexed.append(entry)

    out = STATE_DIR / "meme-knowledge-indexed.json"
    out.write_text(json.dumps(indexed, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "count": len(indexed), "out": str(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
