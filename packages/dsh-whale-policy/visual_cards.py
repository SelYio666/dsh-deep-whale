#!/usr/bin/env python3
"""
Visual Card Renderer for Whale Maid Bot:
  1. achievement : Steam/Genshin style Golden Achievement Unlocked Banner
  2. galgame     : Visual Novel CG Dialogue Box with Whale Maid Portrait
  3. wordcloud   : Group Chat WordCloud + Top 5 Talker Leaderboard Infographic
"""
import argparse
import datetime
import io
import sys
import json
import math
import random
import time
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "/System/Library/Fonts/PingFang.ttc",
]
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "shared"))
from whale_env import STICKER_DIR, AUDIO_CACHE  # noqa: E402

AVATAR_CACHE = AUDIO_CACHE / "avatars"


def load_font(size: int):
    for fp in FONT_CANDIDATES:
        if Path(fp).exists():
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                continue
    return ImageFont.load_default()


def fetch_avatar(qq: str, size: int = 128) -> Image.Image:
    AVATAR_CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
    cache_file = AVATAR_CACHE / f"{qq}.png"
    raw_bytes = None
    if cache_file.exists() and (time.time() - cache_file.stat().st_mtime < 7 * 86400):
        try:
            raw_bytes = cache_file.read_bytes()
        except Exception:
            raw_bytes = None
    if not raw_bytes and str(qq).isdigit():
        url = f"https://q1.qlogo.cn/g?b=qq&nk={qq}&s=640"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                raw_bytes = resp.read()
            if raw_bytes:
                cache_file.write_bytes(raw_bytes)
        except Exception:
            if cache_file.exists():
                try:
                    raw_bytes = cache_file.read_bytes()
                except Exception:
                    raw_bytes = None

    img = None
    if raw_bytes:
        try:
            img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        except Exception:
            img = None
    if img is None:
        img = Image.new("RGBA", (size, size), (45, 95, 160, 255))

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def wrap_text(text: str, font, max_w: int, draw: ImageDraw.ImageDraw, max_lines: int = 4):
    text = " ".join(str(text or "").split())
    lines = []
    cur = ""
    for ch in text:
        test = cur + ch
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = ch
            if len(lines) >= max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines and len("".join(lines)) < len(text):
        lines[-1] = lines[-1][:-1] + "…"
    return lines or ["…"]


def render_achievement(qq: str, name: str, title: str, desc: str, out_path: Path):
    w, h = 880, 250
    canvas = Image.new("RGBA", (w, h), (16, 20, 32, 255))
    draw = ImageDraw.Draw(canvas)

    for y in range(h):
        r = int(18 + 12 * (y / h))
        g = int(22 + 16 * (y / h))
        b = int(38 + 24 * (y / h))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # Golden achievement frame
    draw.rounded_rectangle((10, 10, w - 11, h - 11), radius=24, outline=(245, 158, 11, 210), width=3)
    draw.rounded_rectangle((18, 18, w - 19, h - 19), radius=18, outline=(253, 224, 71, 110), width=1)

    # Left avatar + trophy ring
    av_size = 136
    ax, ay = 52, (h - av_size) // 2
    draw.ellipse((ax - 6, ay - 6, ax + av_size + 6, ay + av_size + 6), fill=(245, 158, 11, 45), outline=(251, 191, 36, 230), width=3)
    avatar = fetch_avatar(qq, av_size)
    canvas.paste(avatar, (ax, ay), avatar)

    f_badge = load_font(19)
    f_title = load_font(36)
    f_desc = load_font(23)
    f_meta = load_font(17)

    rx = 225
    draw.rounded_rectangle((rx, 34, rx + 275, 66), radius=10, fill=(245, 158, 11, 45), outline=(251, 191, 36, 160), width=1)
    draw.text((rx + 14, 39), "★ 隐藏成就已解锁 · 鲸鱼认证", font=f_badge, fill=(253, 224, 71, 255))

    draw.text((rx, 80), f"【{title[:16]}】", font=f_title, fill=(255, 251, 235, 255))

    desc_lines = wrap_text(desc, f_desc, 600, draw, max_lines=2)
    ty = 134
    for line in desc_lines:
        draw.text((rx, ty), line, font=f_desc, fill=(203, 213, 225, 255))
        ty += 31

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    draw.text((rx, h - 46), f"获得者：{name[:16]}   |   解锁时间：{now_str}", font=f_meta, fill=(148, 163, 184, 210))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)


def render_galgame(sticker_code: str, speaker: str, text: str, out_path: Path):
    w, h = 960, 540
    canvas = Image.new("RGBA", (w, h), (11, 24, 48, 255))
    draw = ImageDraw.Draw(canvas)

    # Deep sea starry background gradient + bokeh bubbles
    for y in range(h):
        r = int(10 + 18 * (y / h))
        g = int(24 + 42 * (y / h))
        b = int(52 + 68 * (y / h))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    rng = random.Random(42)
    for _ in range(28):
        bx = rng.randint(20, w - 20)
        by = rng.randint(20, h - 180)
        br = rng.randint(6, 36)
        alpha = rng.randint(18, 52)
        overlay = Image.new("RGBA", (br * 2, br * 2), (0, 0, 0, 0))
        ImageDraw.Draw(overlay).ellipse((0, 0, br * 2 - 1, br * 2 - 1), fill=(125, 211, 252, alpha))
        canvas.alpha_composite(overlay, (bx - br, by - br))

    # Load whale sticker portrait (first frame of GIF)
    sticker_path = STICKER_DIR / f"{sticker_code}.gif"
    if not sticker_path.exists():
        sticker_path = STICKER_DIR / "12N11.gif"
    if sticker_path.exists():
        try:
            sp = Image.open(sticker_path)
            sp.seek(0)
            sp_rgba = sp.convert("RGBA")
            target_h = 340
            target_w = int(sp_rgba.width * (target_h / max(1, sp_rgba.height)))
            sp_rgba = sp_rgba.resize((target_w, target_h), Image.Resampling.LANCZOS)
            px = (w - target_w) // 2
            py = 24
            canvas.alpha_composite(sp_rgba, (px, py))
        except Exception:
            pass

    # GalGame bottom translucent dialogue box
    box_overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(box_overlay)
    bx1, by1, bx2, by2 = 36, 338, w - 36, 512
    bdraw.rounded_rectangle((bx1, by1, bx2, by2), radius=20, fill=(12, 22, 42, 222), outline=(125, 211, 252, 210), width=3)
    bdraw.rounded_rectangle((bx1 + 6, by1 + 6, bx2 - 6, by2 - 6), radius=16, outline=(251, 191, 36, 110), width=1)

    # Speaker nameplate tab
    bdraw.rounded_rectangle((bx1 + 28, by1 - 24, bx1 + 290, by1 + 20), radius=12, fill=(30, 58, 110, 245), outline=(125, 211, 252, 230), width=2)
    canvas.alpha_composite(box_overlay)

    draw = ImageDraw.Draw(canvas)
    f_name = load_font(23)
    f_text = load_font(29)
    f_ui = load_font(16)

    draw.text((bx1 + 48, by1 - 16), f"★ {speaker[:12]} ★", font=f_name, fill=(253, 224, 71, 255))

    # Top right GalGame menu buttons
    draw.text((bx2 - 260, by1 + 14), "AUTO    SKIP    LOG    SAVE", font=f_ui, fill=(148, 163, 184, 190))

    lines = wrap_text(f"「{text}」", f_text, bx2 - bx1 - 76, draw, max_lines=3)
    ty = by1 + 42
    for line in lines:
        draw.text((bx1 + 38, ty), line, font=f_text, fill=(248, 250, 252, 255))
        ty += 42

    draw.text((bx2 - 44, by2 - 36), "▼", font=load_font(22), fill=(125, 211, 252, 240))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)


def render_wordcloud(data_path: Path, out_path: Path):
    payload = json.loads(data_path.read_text(encoding="utf-8"))
    w, h = 980, 600
    canvas = Image.new("RGBA", (w, h), (12, 21, 38, 255))
    draw = ImageDraw.Draw(canvas)

    for y in range(h):
        r = int(12 + 12 * (y / h))
        g = int(22 + 24 * (y / h))
        b = int(40 + 40 * (y / h))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    draw.rounded_rectangle((14, 14, w - 15, h - 15), radius=22, outline=(56, 189, 248, 140), width=2)

    f_header = load_font(28)
    f_sub = load_font(18)
    f_user = load_font(21)
    f_cnt = load_font(18)

    total_msgs = payload.get("total_msgs", 0)
    draw.text((38, 32), "★ 深海观测站 · 本群今日水群战报 & 热词云 ★", font=f_header, fill=(253, 224, 71, 255))
    draw.text((w - 295, 40), f"近6小时采样：{total_msgs} 条发言", font=f_sub, fill=(148, 163, 184, 220))
    draw.line([(36, 78), (w - 36, 78)], fill=(56, 189, 248, 70), width=1)

    # Left panel: Top 5 Talkers
    draw.text((42, 96), "◆ 水群龙王榜 Top 5", font=load_font(23), fill=(125, 211, 252, 255))
    top_users = payload.get("top_users", [])[:5]
    max_u = max([u.get("count", 1) for u in top_users] + [1])
    badges = ["★ 深海大水怪", "☆ 摸鱼永动机", "☆ 键盘冒火星", "◇ 活跃小肥鱼", "○ 冒泡积极分子"]

    uy = 142
    for idx, u in enumerate(top_users):
        qq = str(u.get("qq", ""))
        name = str(u.get("name", "群友"))[:10]
        cnt = int(u.get("count", 0))
        av = fetch_avatar(qq, 58)
        canvas.paste(av, (44, uy), av)
        draw.ellipse((43, uy - 1, 103, uy + 59), outline=(251, 191, 36, 180) if idx == 0 else (56, 189, 248, 120), width=2)

        badge = badges[idx] if idx < len(badges) else "群友"
        draw.text((116, uy + 2), f"{name}  [{badge}]", font=f_user, fill=(248, 250, 252, 255))

        bar_max_w = 210
        bar_w = max(18, int(bar_max_w * (cnt / max_u)))
        draw.rounded_rectangle((116, uy + 34, 116 + bar_w, uy + 52), radius=6, fill=(56, 189, 248, 210) if idx > 0 else (251, 191, 36, 230))
        draw.text((124 + bar_w, uy + 31), f"{cnt} 句", font=f_cnt, fill=(203, 213, 225, 240))
        uy += 84

    # Vertical divider
    draw.line([(435, 96), (435, h - 36)], fill=(56, 189, 248, 60), width=1)

    # Right panel: Word Cloud spiral placement
    draw.text((462, 96), "◆ 本群高频热词云", font=load_font(23), fill=(125, 211, 252, 255))
    words = payload.get("words", [])[:26]
    max_w_cnt = max([item.get("count", 1) for item in words] + [1])

    palette = [
        (253, 224, 71, 255),
        (125, 211, 252, 255),
        (244, 114, 182, 255),
        (167, 243, 208, 255),
        (196, 181, 253, 255),
        (251, 146, 60, 255),
        (248, 250, 252, 245),
    ]
    placed_boxes = []
    cx, cy = 700, 345
    rx_min, ry_min, rx_max, ry_max = 455, 140, w - 35, h - 35

    for idx, item in enumerate(words):
        word = str(item.get("word", ""))[:8]
        cnt = int(item.get("count", 1))
        if not word:
            continue
        ratio = cnt / max_w_cnt
        fsize = int(20 + 30 * (ratio ** 0.7)) if idx > 0 else 50
        font = load_font(fsize)
        bbox = draw.textbbox((0, 0), word, font=font)
        tw, th = bbox[2] - bbox[0] + 12, bbox[3] - bbox[1] + 10

        color = palette[idx % len(palette)]
        for step in range(360):
            angle = 0.35 * step
            radius = 3.2 * step
            px = int(cx + radius * math.cos(angle) * 1.15 - tw // 2)
            py = int(cy + radius * math.sin(angle) * 0.85 - th // 2)
            if px < rx_min or py < ry_min or px + tw > rx_max or py + th > ry_max:
                continue
            box = (px, py, px + tw, py + th)
            if not any(not (box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3]) for b in placed_boxes):
                placed_boxes.append(box)
                draw.text((px + 6, py + 4), word, font=font, fill=color)
                break

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)




def render_ssrcard(data_path: Path, out_path: Path):
    d = json.loads(data_path.read_text(encoding="utf-8"))
    qq = str(d.get("qq", "10000"))
    name = str(d.get("name", "群友"))[:12]
    rarity = str(d.get("rarity", "SSR"))
    elem = str(d.get("element", "深海·摸鱼系"))[:10]
    atk = int(d.get("atk", 2500))
    dfn = int(d.get("def", 2100))
    s1_name = str(d.get("s1_name", "装死潜行"))[:10]
    s1_desc = str(d.get("s1_desc", "在群里被艾特时有50%概率假装没看见，免疫早八召唤。"))[:56]
    s2_name = str(d.get("s2_name", "深海干饭风暴"))[:10]
    s2_desc = str(d.get("s2_desc", "发动后瞬间清空方圆十里内的白饭与小饼干，全群仇恨值+100%。"))[:56]
    flavor = str(d.get("flavor", "传说中出没于深海群聊的稀有生物。"))[:36]

    w, h = 680, 960
    canvas = Image.new("RGBA", (w, h), (14, 18, 32, 255))
    draw = ImageDraw.Draw(canvas)

    # Rich dark-gold / holographic gradient
    for y in range(h):
        r = int(16 + 22 * (y / h))
        g = int(20 + 18 * (y / h))
        b = int(38 + 30 * (y / h))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # Outer & inner ornate borders
    gold = (251, 191, 36, 240) if rarity in ("UR", "SSR") else (56, 189, 248, 230)
    sub_col = (244, 114, 182, 180) if rarity == "UR" else (125, 211, 252, 170)
    draw.rounded_rectangle((14, 14, w - 15, h - 15), radius=28, outline=gold, width=4)
    draw.rounded_rectangle((24, 24, w - 25, h - 25), radius=22, outline=sub_col, width=2)

    # Top title bar
    draw.rounded_rectangle((42, 42, w - 42, 112), radius=14, fill=(24, 34, 62, 235), outline=gold, width=2)
    f_rar = load_font(34)
    f_name = load_font(30)
    f_elem = load_font(19)
    draw.text((58, 56), f"★ {rarity}", font=f_rar, fill=(253, 224, 71, 255))
    draw.text((195, 59), name, font=f_name, fill=(248, 250, 252, 255))
    ebbox = draw.textbbox((0, 0), f"[{elem}]", font=f_elem)
    draw.text((w - 58 - (ebbox[2] - ebbox[0]), 66), f"[{elem}]", font=f_elem, fill=(125, 211, 252, 255))

    # Star rating row
    stars = "★ " * (6 if rarity == "UR" else 5 if rarity == "SSR" else 4)
    draw.text((54, 122), stars, font=load_font(22), fill=(251, 191, 36, 255))

    # Main avatar frame
    av_size = 330
    ax = (w - av_size) // 2
    ay = 160
    draw.rounded_rectangle((ax - 10, ay - 10, ax + av_size + 10, ay + av_size + 10), radius=180, fill=(30, 45, 78, 220), outline=gold, width=4)
    av = fetch_avatar(qq, av_size)
    canvas.paste(av, (ax, ay), av)

    # ATK / DEF stat bar
    sy = 515
    draw.rounded_rectangle((48, sy, w - 48, sy + 54), radius=12, fill=(28, 40, 70, 230), outline=sub_col, width=1)
    f_stat = load_font(23)
    draw.text((74, sy + 13), f"◆ 攻击力 ATK：{atk}", font=f_stat, fill=(252, 165, 165, 255))
    draw.text((370, sy + 13), f"◆ 防御力 DEF：{dfn}", font=f_stat, fill=(147, 197, 253, 255))

    # Skill Box
    bx_y = 588
    draw.rounded_rectangle((42, bx_y, w - 42, h - 78), radius=16, fill=(18, 26, 48, 240), outline=gold, width=2)
    f_sk_t = load_font(23)
    f_sk_d = load_font(20)

    draw.text((62, bx_y + 20), f"◆ 被动技 · 【{s1_name}】", font=f_sk_t, fill=(253, 224, 71, 255))
    ty = bx_y + 54
    for line in wrap_text(s1_desc, f_sk_d, w - 128, draw, max_lines=2):
        draw.text((68, ty), line, font=f_sk_d, fill=(226, 232, 240, 255))
        ty += 28

    ty += 16
    draw.line([(62, ty - 6), (w - 62, ty - 6)], fill=(56, 189, 248, 60), width=1)
    draw.text((62, ty + 4), f"★ 终极技 · 【{s2_name}】", font=f_sk_t, fill=(244, 114, 182, 255))
    ty += 38
    for line in wrap_text(s2_desc, f_sk_d, w - 128, draw, max_lines=2):
        draw.text((68, ty), line, font=f_sk_d, fill=(226, 232, 240, 255))
        ty += 28

    f_foot = load_font(17)
    draw.text((62, h - 114), f"“{flavor}”", font=f_foot, fill=(148, 163, 184, 210))
    draw.text((48, h - 58), f"DEEPSEA TCG · 2026 鲸鱼女仆典藏馆制  |  NO.{qq[-5:]}", font=f_foot, fill=(100, 116, 139, 220))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)


def render_relgraph(data_path: Path, out_path: Path):
    d = json.loads(data_path.read_text(encoding="utf-8"))
    bot_qq = str(d.get("bot_qq", "2709937034"))
    nodes = d.get("nodes", [])[:8]
    edges = d.get("edges", [])

    w, h = 980, 680
    canvas = Image.new("RGBA", (w, h), (11, 20, 38, 255))
    draw = ImageDraw.Draw(canvas)

    for y in range(h):
        draw.line([(0, y), (w, y)], fill=(int(11 + 12 * y / h), int(20 + 22 * y / h), int(38 + 35 * y / h), 255))

    draw.rounded_rectangle((14, 14, w - 15, h - 15), radius=22, outline=(56, 189, 248, 140), width=2)
    draw.text((38, 30), "★ 深海观测站 · 本群人物八卦关系网图谱 ★", font=load_font(28), fill=(253, 224, 71, 255))
    draw.line([(36, 74), (w - 36, 74)], fill=(56, 189, 248, 70), width=1)

    cx, cy = w // 2, h // 2 + 28
    positions = {"BOT": (cx, cy)}
    n_cnt = max(1, len(nodes))
    rx, ry = 330, 215
    for idx, node in enumerate(nodes):
        ang = -math.pi / 2 + (2 * math.pi * idx) / n_cnt
        nx = int(cx + rx * math.cos(ang))
        ny = int(cy + ry * math.sin(ang))
        positions[str(node["qq"])] = (nx, ny)

    f_edge = load_font(16)
    # Draw edges first
    for edge in edges:
        u1 = str(edge.get("from", ""))
        u2 = str(edge.get("to", ""))
        label = str(edge.get("label", ""))[:10]
        if u1 not in positions or u2 not in positions:
            continue
        x1, y1 = positions[u1]
        x2, y2 = positions[u2]
        col = (251, 191, 36, 175) if "BOT" in (u1, u2) else (244, 114, 182, 185)
        draw.line([(x1, y1), (x2, y2)], fill=col, width=3)
        if label:
            mx, my = (x1 + x2) // 2, (y1 + y2) // 2
            tb = draw.textbbox((0, 0), label, font=f_edge)
            tw, th = tb[2] - tb[0] + 12, tb[3] - tb[1] + 6
            draw.rounded_rectangle((mx - tw // 2, my - th // 2, mx + tw // 2, my + th // 2), radius=8, fill=(15, 28, 52, 235), outline=col, width=1)
            draw.text((mx - tw // 2 + 6, my - th // 2 + 2), label, font=f_edge, fill=(248, 250, 252, 255))

    # Draw center bot node
    b_av = fetch_avatar(bot_qq, 92)
    draw.ellipse((cx - 50, cy - 50, cx + 50, cy + 50), fill=(30, 58, 110, 255), outline=(253, 224, 71, 250), width=4)
    canvas.paste(b_av, (cx - 46, cy - 46), b_av)
    draw.rounded_rectangle((cx - 58, cy + 48, cx + 58, cy + 74), radius=8, fill=(251, 191, 36, 240))
    draw.text((cx - 46, cy + 51), "★ 鲸鱼女仆", font=load_font(17), fill=(15, 23, 42, 255))

    # Draw user nodes
    f_uname = load_font(17)
    for node in nodes:
        qq = str(node["qq"])
        name = str(node.get("name", "群友"))[:8]
        nx, ny = positions[qq]
        u_av = fetch_avatar(qq, 72)
        draw.ellipse((nx - 40, ny - 40, nx + 40, ny + 40), fill=(20, 35, 65, 255), outline=(125, 211, 252, 235), width=3)
        canvas.paste(u_av, (nx - 36, ny - 36), u_av)
        tb = draw.textbbox((0, 0), name, font=f_uname)
        tw = tb[2] - tb[0] + 16
        draw.rounded_rectangle((nx - tw // 2, ny + 38, nx + tw // 2, ny + 62), radius=7, fill=(18, 32, 58, 240), outline=(56, 189, 248, 160), width=1)
        draw.text((nx - tw // 2 + 8, ny + 40), name, font=f_uname, fill=(248, 250, 252, 255))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)


def render_cpcard(data_path: Path, out_path: Path):
    d = json.loads(data_path.read_text(encoding="utf-8"))
    qq1, name1 = str(d.get("qq1", "")), str(d.get("name1", "群友A"))[:10]
    qq2, name2 = str(d.get("qq2", "")), str(d.get("name2", "群友B"))[:10]
    score = int(d.get("score", 88))
    title = str(d.get("title", "天选干饭搭子"))[:12]
    tags = d.get("tags", ["默契拉满", "欢喜冤家", "深海同盟"])[:3]
    comment = str(d.get("comment", "你们俩凑一块儿，连我的饼干罐都得看紧点！"))[:64]

    w, h = 880, 420
    canvas = Image.new("RGBA", (w, h), (18, 20, 38, 255))
    draw = ImageDraw.Draw(canvas)

    for y in range(h):
        draw.line([(0, y), (w, y)], fill=(int(22 + 18 * y / h), int(18 + 14 * y / h), int(42 + 28 * y / h), 255))

    draw.rounded_rectangle((14, 14, w - 15, h - 15), radius=24, outline=(244, 114, 182, 210), width=3)
    draw.rounded_rectangle((22, 22, w - 23, h - 23), radius=18, outline=(253, 224, 71, 110), width=1)

    draw.text((275, 32), "★ 深海羁绊观测所 · 搭子/CP相性卡 ★", font=load_font(22), fill=(253, 224, 71, 255))

    # Left & Right avatars
    av1 = fetch_avatar(qq1, 144)
    av2 = fetch_avatar(qq2, 144)
    ax1, ax2, ay = 95, w - 95 - 144, 92
    draw.ellipse((ax1 - 5, ay - 5, ax1 + 149, ay + 149), outline=(125, 211, 252, 230), width=3)
    draw.ellipse((ax2 - 5, ay - 5, ax2 + 149, ay + 149), outline=(244, 114, 182, 230), width=3)
    canvas.paste(av1, (ax1, ay), av1)
    canvas.paste(av2, (ax2, ay), av2)

    f_name = load_font(22)
    b1 = draw.textbbox((0, 0), name1, font=f_name)
    b2 = draw.textbbox((0, 0), name2, font=f_name)
    draw.text((ax1 + (144 - (b1[2] - b1[0])) // 2, ay + 156), name1, font=f_name, fill=(248, 250, 252, 255))
    draw.text((ax2 + (144 - (b2[2] - b2[0])) // 2, ay + 156), name2, font=f_name, fill=(248, 250, 252, 255))

    # Center score & title
    cx = w // 2
    f_score = load_font(48)
    s_txt = f"{score}%"
    sb = draw.textbbox((0, 0), s_txt, font=f_score)
    draw.text((cx - (sb[2] - sb[0]) // 2, 108), s_txt, font=f_score, fill=(244, 114, 182, 255))

    f_title = load_font(25)
    t_txt = f"【{title}】"
    tb = draw.textbbox((0, 0), t_txt, font=f_title)
    draw.text((cx - (tb[2] - tb[0]) // 2, 174), t_txt, font=f_title, fill=(253, 224, 71, 255))

    # Progress bar
    bar_w = 240
    bx = cx - bar_w // 2
    draw.rounded_rectangle((bx, 218, bx + bar_w, 234), radius=8, fill=(30, 41, 59, 255))
    fill_w = max(16, int(bar_w * (score / 100.0)))
    draw.rounded_rectangle((bx, 218, bx + fill_w, 234), radius=8, fill=(244, 114, 182, 240))

    # Tags row
    tag_str = "   ".join(f"#{t}" for t in tags)
    tgb = draw.textbbox((0, 0), tag_str, font=load_font(19))
    draw.text((cx - (tgb[2] - tgb[0]) // 2, 254), tag_str, font=load_font(19), fill=(125, 211, 252, 245))

    # Whale commentary box at bottom
    draw.rounded_rectangle((56, 304, w - 56, 386), radius=14, fill=(15, 23, 42, 215), outline=(56, 189, 248, 100), width=1)
    draw.text((78, 330), f"★ 鲸鱼锐评：{comment}", font=load_font(21), fill=(226, 232, 240, 255))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)




def render_menu(bot_qq: str, out_path: Path):
    cards = [
        ("★ 契约主专属神权 & 临时糖果盒", "吃糖 粘人/毒舌/微醺/高冷/吃醋 | 提醒我", "老大专享：免@直呼唤醒、唯一UR契约神卡、偷饼干反杀、决斗黑哨保胜、喂风味糖果临时变身(5轮)。", (250, 204, 21)),
        ("★ 深海交换日记 & 识海怪梦 (1v1)", "看日记 | 昨晚梦到啥了 | 群聊小报告", "每晚自动撰写写给老大的《深海私密交换手账》与荒诞可爱的《昨夜深海怪梦》，支持1v1私聊独享。", (192, 132, 252)),
        ("◆ 逆天语录「入典」& 翻旧账", "引用消息 + 入典  |  随机群典", "将群友逆天/社死发言渲染成黑金传世名言卡收录，随时发「随机群典」抽卡翻旧账处刑。", (251, 191, 36)),
        ("◆ UR/SSR 闪卡 & 跨服决斗PK", "抽卡  |  抽卡 @某人  |  决斗 (群/私聊均可)", "生成专属 UR/SSR 攻防与双技能闪卡；群聊可决斗群友，私聊发「决斗」可与鲸鱼1v1抢饼干大战！", (244, 114, 182)),
        ("◆ 深海晚报「震惊部头版号外」", "引用消息 + 上头条  |  发头条：...", "将发言或事件合成为《深海晚报·特急号外》报纸头版大图（红字大标题+当事人照片+记者报道）。", (248, 113, 113)),
        ("◆ 深海甩竿钓鱼 & 黑历史漂流瓶", "钓鱼  |  甩竿  |  深海钓鱼 (群/私聊均可)", "甩竿可钓起黄金帝王蟹/曲奇箱赚饼干，更有 28% 概率从海底捞出陈年黑历史漂流瓶！", (56, 189, 248)),
        ("◆ 深海「成分鉴定卡」", "鉴定一下我  |  鉴定一下 @某人", "汇总近期发言实录、好感与相处印象，输出表面成分、隐藏属性、含鱼浓度与鲸鱼毒舌锐评。", (52, 211, 153)),
        ("◆ 今日搭子 & 双人 CP 相性卡", "今日搭子  |  测CP (私聊直测与鲸鱼999%契约)", "抽取今日最佳摸鱼/干饭搭子，或生成双人头像 + 同步率进度条相性大图（老大测鲸鱼999%锁死）。", (251, 113, 133)),
        ("◆ 本群「人物八卦关系网」", "群关系图  |  八卦图  |  关系网", "以鲸鱼为中心，绘制核心成员环形头像节点与关系连线（老大专属★唯一契约主人★金标）。", (167, 139, 250)),
        ("◆ 今日「水群龙王榜 & 热词云」", "今日词云  |  水群榜  |  谁在水群", "统计近 6 小时群聊，生成左侧 Top 5 水群龙王头像进度条 + 右侧彩色高频热词云信息图。", (45, 212, 191)),
        ("◆ 平行宇宙「群友小剧场」", "编个小剧场：@A 和 @B 在食堂抢饼干", "用被点名群友的真实头像与昵称编排 5~7 句爆笑剧本，以原生【合并转发聊天记录】发出。", (251, 146, 60)),
        ("◆ 「隐藏成就解锁」金色奖状", "引用消息 + 颁个奖  |  发奖状 (群/私聊均可)", "根据发言自动发明游戏风沙雕成就称号，合成黑金配色《★ 隐藏成就已解锁》横幅图。", (250, 204, 21)),
        ("◆ 「深海饼干铺」&「深海股市」", "领饼干 | 投喂鲸鱼 | 偷饼干 @某人 | 股市", "每日领海盐饼干、投喂涨好感、拿饼干抄底做多群友身价股票（老大龙头股只涨不跌）。", (96, 165, 250)),
        ("◆ 因果律「邪恶许愿机」", "我许愿：明天不用早八  |  许愿：立刻暴富", "笑眯眯接下你的愿望，然后精准钻字面逻辑漏洞，给出一个字面成立但哭笑不得的反转结果。", (232, 121, 249)),
        ("◆ 蔚蓝Logo & GalGame立绘框", "做logo 深海 大肥鱼 | 用对话框夸我", "生成《蔚蓝档案》斜切光环透明风 Logo 横幅；或将鲸鱼回复合成为 GalGame 视觉小说 CG 截图。", (129, 140, 248)),
        ("◆ 二次元搜番 & 爬楼总结/语音/视频", "发图+搜番 | 爬楼总结 | 发条语音 | 热榜", "trace.moe 动漫搜番、4秒原生看懂GIF动图、近50条吃瓜总结、专属音色发语音、B站/抖音视频解析。", (163, 230, 53)),
    ]

    w, h = 1060, 2086
    canvas = Image.new("RGBA", (w, h), (10, 18, 34, 255))
    draw = ImageDraw.Draw(canvas)

    # Vertical deep-sea gradient
    for y in range(h):
        r = int(10 + 14 * (y / h))
        g = int(18 + 26 * (y / h))
        b = int(34 + 42 * (y / h))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # Outer double border
    draw.rounded_rectangle((14, 14, w - 15, h - 15), radius=28, outline=(56, 189, 248, 160), width=3)
    draw.rounded_rectangle((22, 22, w - 23, h - 23), radius=22, outline=(251, 191, 36, 100), width=1)

    # Top Header Banner
    draw.rounded_rectangle((40, 38, w - 40, 196), radius=22, fill=(18, 32, 62, 235), outline=(251, 191, 36, 200), width=2)
    av = fetch_avatar(bot_qq, 118)
    draw.ellipse((64, 54, 190, 180), fill=(30, 58, 110, 255), outline=(253, 224, 71, 240), width=3)
    canvas.paste(av, (68, 58), av)

    f_h1 = load_font(36)
    f_h2 = load_font(20)
    f_tag = load_font(17)
    draw.text((216, 58), "★ 深海鲸鱼女仆 (deepsleep) · 全功能玩法菜单 ★", font=f_h1, fill=(253, 224, 71, 255))
    draw.text((218, 112), "群聊中直接「@deepsleep + 口令」即可触发  |  私聊直接发送口令或日常聊天", font=f_h2, fill=(125, 211, 252, 255))
    draw.text((218, 148), "支持：原生极速看图/动图 · 139张鲸鱼表情包 · 2700+网络梗百科 · 潜意识共同回忆 · 双云端24h在线", font=f_tag, fill=(148, 163, 184, 230))

    # 2-Column Grid of 14 Feature Cards (7 rows x 2 cols)
    f_ctitle = load_font(24)
    f_ccmd = load_font(18)
    f_cdesc = load_font(18)

    col_w = 476
    card_h = 206
    gap_x = 28
    gap_y = 20
    start_x = 40
    start_y = 220

    for idx, (title, cmd, desc, accent) in enumerate(cards):
        row = idx // 2
        col = idx % 2
        cx = start_x + col * (col_w + gap_x)
        cy = start_y + row * (card_h + gap_y)

        # Card background & left accent bar
        draw.rounded_rectangle((cx, cy, cx + col_w, cy + card_h), radius=16, fill=(16, 28, 52, 235), outline=(accent[0], accent[1], accent[2], 140), width=2)
        draw.rounded_rectangle((cx + 12, cy + 16, cx + 18, cy + card_h - 16), radius=3, fill=(accent[0], accent[1], accent[2], 255))

        # Card Title
        draw.text((cx + 30, cy + 16), title, font=f_ctitle, fill=(248, 250, 252, 255))

        # Command pill box
        draw.rounded_rectangle((cx + 28, cy + 56, cx + col_w - 18, cy + 94), radius=8, fill=(10, 18, 36, 230), outline=(accent[0], accent[1], accent[2], 110), width=1)
        draw.text((cx + 38, cy + 64), f"口令：{cmd}", font=f_ccmd, fill=(accent[0], accent[1], accent[2], 255))

        # Description wrapped (up to 3 lines)
        d_lines = wrap_text(desc, f_cdesc, col_w - 48, draw, max_lines=3)
        ty = cy + 106
        for dl in d_lines:
            draw.text((cx + 30, ty), dl, font=f_cdesc, fill=(203, 213, 225, 240))
            ty += 28

    # Footer
    fy = h - 56
    f_foot = load_font(19)
    foot_txt = "★ 随时发送「@deepsleep /菜单」或「菜单」调出本图鉴  ·  深海值班室 24 小时营业中 ★"
    fb = draw.textbbox((0, 0), foot_txt, font=f_foot)
    draw.text(((w - (fb[2] - fb[0])) // 2, fy), foot_txt, font=f_foot, fill=(125, 211, 252, 220))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)




def render_headline(data_path: Path, out_path: Path):
    d = json.loads(data_path.read_text(encoding="utf-8"))
    qq = str(d.get("qq", "10000"))
    name = str(d.get("name", "群友"))[:12]
    headline = str(d.get("headline", "震惊！深海食堂白饭神秘失踪！"))[:20]
    subhead = str(d.get("subhead", "目击者称现场留有一串可疑脚印与饼干碎屑"))[:30]
    article = str(d.get("article", "本报讯（特派记者鲸鱼女仆报道）：今日凌晨，本群知名人士在群聊中发表重要讲话，引发全群海豚与肥鱼强烈震动。专家建议立即投喂两块海盐饼干以稳定局势。"))[:160]

    w, h = 920, 560
    canvas = Image.new("RGBA", (w, h), (242, 236, 222, 255))
    draw = ImageDraw.Draw(canvas)

    # Newspaper paper texture lines & outer double border
    draw.rectangle((16, 16, w - 17, h - 17), outline=(30, 41, 59, 255), width=4)
    draw.rectangle((24, 24, w - 25, h - 25), outline=(30, 41, 59, 255), width=1)

    # Top Masthead
    draw.rectangle((36, 36, w - 36, 108), fill=(18, 28, 48, 255))
    f_mast = load_font(38)
    f_meta = load_font(17)
    draw.text((54, 48), "★ 深 海 晚 报 · DEEPSEA EXPRESS", font=f_mast, fill=(253, 224, 71, 255))

    # Red stamp box
    draw.rounded_rectangle((w - 230, 48, w - 52, 96), radius=8, fill=(185, 28, 28, 255), outline=(254, 202, 202, 255), width=2)
    draw.text((w - 214, 60), "【震惊部 · 特急号外】", font=load_font(18), fill=(255, 255, 255, 255))

    now_str = datetime.datetime.now().strftime("%Y年%m月%d日 %H:%M")
    draw.text((40, 116), f"出版日期：{now_str}    |    主编：深海鲸鱼女仆    |    本期售价：2 块海盐小饼干", font=f_meta, fill=(71, 85, 105, 255))
    draw.line([(36, 144), (w - 36, 144)], fill=(30, 41, 59, 255), width=3)

    # Giant Red Headline Banner
    f_head = load_font(36)
    draw.text((42, 158), f"【头条】{headline}", font=f_head, fill=(185, 28, 28, 255))
    f_sub = load_font(22)
    draw.text((46, 208), f"—— {subhead}", font=f_sub, fill=(51, 65, 85, 255))
    draw.line([(36, 246), (w - 36, 246)], fill=(100, 116, 139, 255), width=1)

    # Left column: Framed Photo of target user
    px, py, psize = 48, 264, 200
    draw.rectangle((px - 4, py - 4, px + psize + 4, py + psize + 4), fill=(30, 41, 59, 255))
    av = fetch_avatar(qq, psize)
    bg_av = Image.new("RGBA", (psize, psize), (226, 232, 240, 255))
    bg_av.paste(av, (0, 0), av)
    canvas.paste(bg_av, (px, py))
    draw.text((px, py + psize + 12), f"▲ 图为当事人「{name}」资料画面", font=load_font(16), fill=(71, 85, 105, 255))

    # Vertical column divider
    draw.line([(280, 260), (280, h - 42)], fill=(148, 163, 184, 255), width=1)

    # Right column: Newspaper article body
    rx = 304
    f_body = load_font(24)
    lines = wrap_text(article, f_body, w - rx - 48, draw, max_lines=6)
    ty = 268
    for line in lines:
        draw.text((rx, ty), line, font=f_body, fill=(15, 23, 42, 255))
        ty += 38

    draw.line([(rx, h - 78), (w - 42, h - 78)], fill=(148, 163, 184, 255), width=1)
    draw.text((rx, h - 64), "★ 深海通讯社电 · 未经投喂禁止转载  |  爆料热线：@deepsleep 上头条", font=load_font(17), fill=(100, 116, 139, 255))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)




def render_balogo(left_text: str, right_text: str, sub_text: str, out_path: Path):
    left_text = str(left_text or "深海").strip()[:10]
    right_text = str(right_text or "大肥鱼").strip()[:10]
    sub_text = str(sub_text or "DEEPSEA WHALE ARCHIVE").strip()[:32]

    # Render at 2x resolution for super-crisp anti-aliased italic shear & halo
    scale = 2
    font_main = load_font(92 * scale)
    font_sub = load_font(18 * scale)

    dummy = Image.new("RGBA", (10, 10))
    ddraw = ImageDraw.Draw(dummy)
    lb = ddraw.textbbox((0, 0), left_text, font=font_main)
    rb = ddraw.textbbox((0, 0), right_text, font=font_main)
    lw, lh = lb[2] - lb[0], lb[3] - lb[1]
    rw, rh = rb[2] - rb[0], rb[3] - rb[1]

    pad_x = 130 * scale
    total_w = max(860 * scale, lw + rw + pad_x * 2 + 30 * scale)
    total_h = 340 * scale

    bg = Image.new("RGBA", (total_w, total_h), (248, 251, 255, 255))
    bdraw = ImageDraw.Draw(bg)

    # Subtle BA tech grid lines
    grid_step = 40 * scale
    for gx in range(0, total_w, grid_step):
        bdraw.line([(gx, 0), (gx, total_h)], fill=(226, 236, 248, 255), width=1)
    for gy in range(0, total_h, grid_step):
        bdraw.line([(0, gy), (total_w, gy)], fill=(226, 236, 248, 255), width=1)

    # Text layer (will be italic-sheared)
    txt_layer = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(txt_layer)

    start_x = (total_w - (lw + rw + 14 * scale)) // 2
    base_y = (total_h - max(lh, rh)) // 2 - 8 * scale
    split_x = start_x + lw + 7 * scale

    # White stroke outline behind text
    stroke_w = 6 * scale
    tdraw.text((start_x, base_y), left_text, font=font_main, fill=(18, 138, 250, 255), stroke_width=stroke_w, stroke_fill=(255, 255, 255, 255))
    tdraw.text((split_x, base_y), right_text, font=font_main, fill=(43, 51, 62, 255), stroke_width=stroke_w, stroke_fill=(255, 255, 255, 255))

    # Subtitle under right text
    tdraw.text((split_x + 4 * scale, base_y + max(lh, rh) + 22 * scale), sub_text, font=font_sub, fill=(100, 120, 145, 255))

    # Apply italic horizontal shear (x' = x + shear * (y - cy))
    shear = 0.22
    cy = total_h / 2.0
    sheared_txt = txt_layer.transform(
        (total_w, total_h),
        Image.Transform.AFFINE,
        (1, shear, -shear * cy, 0, 1, 0),
        resample=Image.Resampling.BICUBIC,
    )

    # Halo & Cross layer centered near the split point
    halo_layer = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(halo_layer)
    hx = split_x + 12 * scale
    hy = base_y - 6 * scale

    # Tilted double halo rings (drawn on a sub-canvas and rotated -18 deg)
    hw, hh = 260 * scale, 180 * scale
    h_sub = Image.new("RGBA", (hw, hh), (0, 0, 0, 0))
    hs_draw = ImageDraw.Draw(h_sub)
    hs_draw.ellipse((20 * scale, 52 * scale, hw - 20 * scale, hh - 52 * scale), outline=(255, 255, 255, 255), width=14 * scale)
    hs_draw.ellipse((20 * scale, 52 * scale, hw - 20 * scale, hh - 52 * scale), outline=(18, 138, 250, 255), width=8 * scale)
    hs_draw.ellipse((36 * scale, 64 * scale, hw - 36 * scale, hh - 64 * scale), outline=(0, 210, 255, 220), width=4 * scale)
    h_rot = h_sub.rotate(18, resample=Image.Resampling.BICUBIC, expand=True)
    halo_layer.alpha_composite(h_rot, (hx - h_rot.width // 2, hy - h_rot.height // 2 + 28 * scale))

    # Diagonal BA crosshair slash cutting across the junction
    slash_x1, slash_y1 = hx + 46 * scale, base_y - 48 * scale
    slash_x2, slash_y2 = hx - 48 * scale, base_y + max(lh, rh) + 46 * scale
    hdraw.line([(slash_x1, slash_y1), (slash_x2, slash_y2)], fill=(255, 255, 255, 255), width=13 * scale)
    hdraw.line([(slash_x1, slash_y1), (slash_x2, slash_y2)], fill=(18, 138, 250, 255), width=6 * scale)

    # Small horizontal crossbar on the slash
    cx_bar, cy_bar = hx + 14 * scale, base_y + 10 * scale
    hdraw.line([(cx_bar - 36 * scale, cy_bar + 8 * scale), (cx_bar + 36 * scale, cy_bar - 8 * scale)], fill=(255, 255, 255, 255), width=10 * scale)
    hdraw.line([(cx_bar - 36 * scale, cy_bar + 8 * scale), (cx_bar + 36 * scale, cy_bar - 8 * scale)], fill=(0, 210, 255, 255), width=5 * scale)

    bg.alpha_composite(sheared_txt)
    bg.alpha_composite(halo_layer)

    # Downsample to 1x with LANCZOS for crisp anti-aliasing
    final_img = bg.resize((total_w // scale, total_h // scale), Image.Resampling.LANCZOS).convert("RGB")
    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    final_img.save(out_path, format="PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="mode", required=True)

    p_ach = sub.add_parser("achievement")
    p_ach.add_argument("--qq", required=True)
    p_ach.add_argument("--name", required=True)
    p_ach.add_argument("--title", required=True)
    p_ach.add_argument("--desc", required=True)
    p_ach.add_argument("--out", required=True)

    p_gal = sub.add_parser("galgame")
    p_gal.add_argument("--sticker", default="12N11")
    p_gal.add_argument("--speaker", default="鲸鱼")
    p_gal.add_argument("--text", required=True)
    p_gal.add_argument("--out", required=True)

    p_wc = sub.add_parser("wordcloud")
    p_wc.add_argument("--json-input", required=True)
    p_wc.add_argument("--out", required=True)

    p_ssr = sub.add_parser("ssrcard")
    p_ssr.add_argument("--json-input", required=True)
    p_ssr.add_argument("--out", required=True)

    p_rel = sub.add_parser("relgraph")
    p_rel.add_argument("--json-input", required=True)
    p_rel.add_argument("--out", required=True)

    p_cp = sub.add_parser("cpcard")
    p_cp.add_argument("--json-input", required=True)
    p_cp.add_argument("--out", required=True)

    p_menu = sub.add_parser("menu")
    p_menu.add_argument("--qq", default="2709937034")
    p_menu.add_argument("--out", required=True)

    p_head = sub.add_parser("headline")
    p_head.add_argument("--json-input", required=True)
    p_head.add_argument("--out", required=True)

    p_ba = sub.add_parser("balogo")
    p_ba.add_argument("--left", required=True)
    p_ba.add_argument("--right", required=True)
    p_ba.add_argument("--sub", default="DEEPSEA WHALE ARCHIVE")
    p_ba.add_argument("--out", required=True)

    args = parser.parse_args()
    out_path = Path(args.out).resolve()
    if args.mode == "achievement":
        render_achievement(args.qq, args.name, args.title, args.desc, out_path)
    elif args.mode == "galgame":
        render_galgame(args.sticker, args.speaker, args.text, out_path)
    elif args.mode == "wordcloud":
        render_wordcloud(Path(args.json_input), out_path)
    elif args.mode == "ssrcard":
        render_ssrcard(Path(args.json_input), out_path)
    elif args.mode == "relgraph":
        render_relgraph(Path(args.json_input), out_path)
    elif args.mode == "cpcard":
        render_cpcard(Path(args.json_input), out_path)
    elif args.mode == "menu":
        render_menu(args.qq, out_path)
    elif args.mode == "headline":
        render_headline(Path(args.json_input), out_path)
    elif args.mode == "balogo":
        render_balogo(args.left, args.right, args.sub, out_path)
    print(json.dumps({"ok": True, "path": str(out_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
