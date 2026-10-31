#!/usr/bin/env python3
import argparse
import datetime
import io
import sys
import json
import os
import time
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "shared"))
from whale_env import STICKER_DIR, AUDIO_CACHE  # noqa: E402

AVATAR_CACHE = AUDIO_CACHE / "avatars"


def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def fetch_avatar(qq: str, size: int = 168) -> Image.Image:
    AVATAR_CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
    cache_file = AVATAR_CACHE / f"{qq}.png"
    raw_bytes = None
    if cache_file.exists() and (time.time() - cache_file.stat().st_mtime < 12 * 3600):
        try:
            raw_bytes = cache_file.read_bytes()
        except Exception:
            raw_bytes = None
    if not raw_bytes and qq.isdigit():
        url = f"https://q1.qlogo.cn/g?b=qq&nk={qq}&s=640"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                raw_bytes = resp.read()
            if raw_bytes:
                cache_file.write_bytes(raw_bytes)
        except Exception:
            raw_bytes = None

    if raw_bytes:
        try:
            img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        except Exception:
            img = None
    else:
        img = None

    if img is None:
        img = Image.new("RGBA", (size, size), (45, 85, 145, 255))

    # Circular mask
    mask = Image.new("L", (size, size), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.ImageDraw, max_lines: int = 6):
    text = " ".join(str(text or "").split())[:160]
    lines = []
    cur = ""
    for ch in text:
        test = cur + ch
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
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
    return lines or ["（无字天书）"]


def cleanup_old_cards():
    if not STICKER_DIR.exists():
        return
    now = time.time()
    for f in STICKER_DIR.glob("quote-*.png"):
        try:
            if now - f.stat().st_mtime > 48 * 3600:
                f.unlink(missing_ok=True)
        except Exception:
            pass


def render_card(qq: str, name: str, text: str, out_path: Path):
    cleanup_old_cards()
    width = 920
    font_badge = load_font(20)
    font_quote = load_font(34)
    font_author = load_font(25)
    font_footer = load_font(18)
    font_deco = load_font(110)

    dummy = Image.new("RGB", (10, 10))
    ddraw = ImageDraw.Draw(dummy)
    lines = wrap_text(text, font_quote, 560, ddraw, max_lines=6)

    line_h = 48
    text_block_h = len(lines) * line_h
    height = max(360, 210 + text_block_h)

    canvas = Image.new("RGBA", (width, height), (13, 22, 40, 255))
    draw = ImageDraw.Draw(canvas)

    # Subtle vertical gradient background
    for y in range(height):
        r = int(12 + (22 - 12) * (y / height))
        g = int(21 + (38 - 21) * (y / height))
        b = int(38 + (68 - 38) * (y / height))
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))

    # Outer & inner borders (deep sea gold & cyan)
    draw.rounded_rectangle((14, 14, width - 15, height - 15), radius=22, outline=(56, 189, 248, 110), width=2)
    draw.rounded_rectangle((22, 22, width - 23, height - 23), radius=18, outline=(251, 191, 36, 90), width=1)

    # Decorative quote marks
    draw.text((275, 38), "“", font=font_deco, fill=(56, 189, 248, 45))
    draw.text((width - 105, height - 135), "”", font=font_deco, fill=(251, 191, 36, 40))

    # Avatar + glowing ring
    av_size = 164
    av_x = 64
    av_y = (height - av_size) // 2 - 10
    draw.ellipse((av_x - 6, av_y - 6, av_x + av_size + 6, av_y + av_size + 6), outline=(251, 191, 36, 180), width=3)
    draw.ellipse((av_x - 11, av_y - 11, av_x + av_size + 11, av_y + av_size + 11), outline=(56, 189, 248, 90), width=2)
    avatar = fetch_avatar(qq, av_size)
    canvas.paste(avatar, (av_x, av_y), avatar)

    # QQ tag below avatar
    qq_label = f"QQ: {qq[:3]}***{qq[-2:]}" if len(qq) >= 6 else f"ID: {qq}"
    q_bbox = draw.textbbox((0, 0), qq_label, font=font_footer)
    q_w = q_bbox[2] - q_bbox[0]
    draw.text((av_x + (av_size - q_w) // 2, av_y + av_size + 18), qq_label, font=font_footer, fill=(148, 163, 184, 210))

    # Right column content
    rx = 290
    draw.text((rx, 44), "★ 深海群典藏馆 · 传世名言 ★", font=font_badge, fill=(252, 211, 77, 235))

    ty = 98
    for line in lines:
        draw.text((rx, ty), line, font=font_quote, fill=(248, 250, 252, 255))
        ty += line_h

    author_str = f"—— {name}"
    draw.text((rx, ty + 18), author_str, font=font_author, fill=(125, 211, 252, 255))

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    footer_str = f"{now_str} · 鲸鱼女仆盖章收录"
    draw.text((rx, height - 54), footer_str, font=font_footer, fill=(148, 163, 184, 190))

    out_path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--qq", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out_path = Path(args.out).resolve()
    render_card(str(args.qq), str(args.name)[:20], str(args.text)[:160], out_path)
    print(json.dumps({"ok": True, "path": str(out_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
