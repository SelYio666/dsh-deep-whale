#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DeepWhale single-node scheduler.

一个进程内跑完全部后台维护任务，替代原来的「第二台服务器 + crontab」：

  * 每 30 分钟   潜意识提炼（把双边对话压成共同回忆 + 实体关系写进 brain.db）
  * 每 2 小时    热榜抓取（可选，写入 data/rss-digest/hot-live.md）
  * 每天 03:35   深海交换日记 + 昨夜怪梦（写入 memory.json 与 brain.db）
  * 每天 04:00   SQLite WAL 安全截断 + 记忆衰减合并 + 本地快照（保留最近 7 份）
  * 每 60 分钟   临时图卡清理（只删 24h 前的 quote-*.png，绝不碰表情包）

用法：
  python whale-daemon/scheduler.py            # 前台常驻
  python whale-daemon/scheduler.py --once     # 只跑一轮（调试）
  python whale-daemon/scheduler.py --job distill   # 只跑某个任务
"""
import argparse
import datetime
import os
import subprocess
import sys
import tarfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "shared"))
from whale_env import (  # noqa: E402
    DATA_DIR, STATE_DIR, STICKER_DIR, BACKUP_DIR, BRAIN_DB, MEMORY_JSON,
    PYTHON_BIN, ensure_dirs,
)

POLICY_DIR = ROOT / "packages" / "dsh-whale-policy"
DIGEST_DIR = DATA_DIR / "rss-digest"


def log(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        (STATE_DIR / "daemon.log").open("a", encoding="utf-8").write(line + "\n")
    except Exception:
        pass


def run_py(script: Path, args=None, timeout=180) -> str:
    if not script.exists():
        return f"skip missing {script.name}"
    cmd = [PYTHON_BIN, str(script)] + (args or [])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=str(ROOT))
        out = (r.stdout or "").strip() or (r.stderr or "").strip()
        return out[:500]
    except Exception as e:
        return f"error {e}"


# ------------------------------------------------------------------ jobs
def job_distill() -> str:
    return run_py(POLICY_DIR / "distill_memories.py", timeout=300)


def job_dream() -> str:
    return run_py(ROOT / "whale-daemon" / "dream_diary.py", timeout=120)


def job_hot_news() -> str:
    import json
    import urllib.request

    if os.environ.get("WHALE_HOT_NEWS", "1") != "1":
        return "disabled"
    try:
        req = urllib.request.Request(
            "https://api.bilibili.com/x/web-interface/popular?ps=8&pn=1",
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
                "Referer": "https://www.bilibili.com/",
            },
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8", "ignore"))
        now = datetime.datetime.now().strftime("%m-%d %H:%M")
        lines = ["# 今日热榜摘要\n"]
        for row in (data.get("data", {}).get("list") or [])[:6]:
            title = str(row.get("title") or "").replace("\n", " ").strip()
            bvid = str(row.get("bvid") or "").strip()
            if not title or not bvid:
                continue
            lines.append(f"- [{title}](https://www.bilibili.com/video/{bvid}) — B站热门 / {now}")
        if len(lines) <= 1:
            return "empty"
        DIGEST_DIR.mkdir(parents=True, exist_ok=True)
        (DIGEST_DIR / "hot-live.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        return f"items={len(lines) - 1}"
    except Exception as e:
        return f"error {e}"


def job_maintain() -> str:
    """SQLite WAL 截断 + 记忆维护 + 本地快照。"""
    out = []
    try:
        import sqlite3

        if BRAIN_DB.exists():
            c = sqlite3.connect(str(BRAIN_DB))
            c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            c.close()
            out.append("wal-checkpoint-ok")
    except Exception as e:
        out.append(f"wal-error {e}")

    # 快照
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        today = datetime.date.today().strftime("%Y%m%d")
        snap = BACKUP_DIR / f"snapshot-{today}.tgz"
        with tarfile.open(snap, "w:gz") as tar:
            for p in (MEMORY_JSON, BRAIN_DB):
                if p.exists():
                    tar.add(str(p), arcname=p.name)
            for p in (DATA_DIR / "self").glob("*.txt"):
                tar.add(str(p), arcname=f"self/{p.name}")
        out.append(f"snapshot={snap.stat().st_size}B")
        snaps = sorted(BACKUP_DIR.glob("snapshot-*.tgz"))
        for old in snaps[:-7]:
            old.unlink(missing_ok=True)
    except Exception as e:
        out.append(f"snapshot-error {e}")

    # 清理 24h 前的临时图卡（保留全部 gif 与菜单卡）
    try:
        if STICKER_DIR.exists():
            cutoff = time.time() - 24 * 3600
            n = 0
            for f in STICKER_DIR.glob("quote-*.png"):
                if f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
                    n += 1
            out.append(f"cards-removed={n}")
    except Exception as e:
        out.append(f"cleanup-error {e}")
    return " ".join(out)


def job_memory_maintain() -> str:
    """调用 memory-core 的 maintenance 接口（若在运行）。"""
    import json
    import urllib.request

    from whale_env import CFG

    port = (CFG.get("memoryCorePort") or 8780)
    token = os.environ.get("WHALE_MEMORY_TOKEN") or CFG.get("memoryCoreToken") or ""
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/maintenance/run",
            data=b"{}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8")[:300]
    except Exception as e:
        return f"skip ({e})"


# ------------------------------------------------------------------ loop
TASKS = [
    ("distill", 30 * 60, job_distill, "潜意识提炼"),
    ("hot_news", 120 * 60, job_hot_news, "热榜抓取"),
    ("memory_maintain", 24 * 3600, job_memory_maintain, "记忆维护"),
]


def run_due(now: float, last: dict) -> None:
    for name, interval, fn, desc in TASKS:
        if now - last.get(name, 0) >= interval:
            last[name] = now
            log(f"{desc} → {fn()}")

    # 每日定时
    hhmm = datetime.datetime.now().strftime("%H:%M")
    today = datetime.date.today().isoformat()
    if hhmm == "03:35" and last.get("dream_day") != today:
        last["dream_day"] = today
        log(f"深海交换日记 → {job_dream()}")
    if hhmm == "04:00" and last.get("maintain_day") != today:
        last["maintain_day"] = today
        log(f"每日维护 → {job_maintain()}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--job", default="", help="distill | dream | hot_news | maintain | memory_maintain")
    args = ap.parse_args()

    ensure_dirs()
    if args.job:
        table = {
            "distill": job_distill,
            "dream": job_dream,
            "hot_news": job_hot_news,
            "maintain": job_maintain,
            "memory_maintain": job_memory_maintain,
        }
        print(table[args.job]())
        return

    log("DeepWhale scheduler started (single node)")
    last: dict = {}
    if args.once:
        for name, _i, fn, desc in TASKS:
            log(f"{desc} → {fn()}")
        return

    while True:
        try:
            run_due(time.time(), last)
        except Exception as e:
            log(f"loop error: {e}")
        time.sleep(60)


if __name__ == "__main__":
    main()
