import argparse
import asyncio
import json
import os
import re
import shutil
import sys
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'shared'))
from whale_env import VIDEO_DIR  # noqa: E402

# Optional backend: video_backend (Bilibili / Douyin / Kuaishou parsers)
_BACKEND = os.environ.get('WHALE_VIDEO_BACKEND', '')
if _BACKEND:
    sys.path.insert(0, _BACKEND)
try:
    from video_backend.config import ParserConfig
    from video_backend.parsers import BilibiliParser, DouyinParser, KuaiShouParser
    from video_backend.download import Downloader, task_registry, auto_task
    from video_backend.data import VideoContent
    VIDEO_BACKEND_OK = True
except Exception:
    VIDEO_BACKEND_OK = False

HOSTS = {
    'bilibili': {'b23.tv', 'bili2233.cn', 'bilibili.com', 'www.bilibili.com', 'm.bilibili.com'},
    'douyin': {'v.douyin.com', 'jx.douyin.com', 'www.douyin.com', 'douyin.com', 'm.douyin.com', 'jingxuan.douyin.com', 'www.iesdouyin.com', 'iesdouyin.com'},
    'kuaishou': {'v.kuaishou.com', 'www.kuaishou.com', 'kuaishou.com', 'v.m.chenzhongtech.com', 'chenzhongtech.com'},
}
PARSERS = {'bilibili': BilibiliParser, 'douyin': DouyinParser, 'kuaishou': KuaiShouParser}
MAX_BYTES = 80 * 1024 * 1024
MAX_SECONDS = 300
STAGE = VIDEO_DIR


def parse_url(value):
    parsed = urlsplit(value)
    if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password or parsed.port not in (None, 80, 443):
        return None
    for platform, hosts in HOSTS.items():
        if parsed.hostname in hosts:
            return platform, value
    return None


def clean_stage():
    if not STAGE.exists():
        return
    now = time.time()
    for entry in STAGE.iterdir():
        if not entry.is_dir() or entry.is_symlink():
            continue
        if not re.fullmatch(r'job-[0-9a-f]{32}', entry.name):
            continue
        try:
            if now - entry.stat().st_mtime > 3600:
                shutil.rmtree(entry, ignore_errors=True)
        except OSError:
            continue


def make_config(job):
    entries = [{'__template_key': platform, 'enable': True, 'use_proxy': False, 'cookies': '',
                'video_quality': '_720P', 'video_codec_list': ['AVC'], 'block_pcdn': True}
               for platform in HOSTS]
    cookies = job / 'cookies'
    cookies.mkdir(mode=0o700, exist_ok=True)
    return SimpleNamespace(
        parser=ParserConfig(entries), proxy=None, source_max_size=80, source_max_minute=5,
        max_size=MAX_BYTES, max_duration=MAX_SECONDS, common_timeout=20,
        download_timeout=100, download_retry_times=0, cache_dir=job,
        data_dir=job, cookie_dir=cookies, admins_id=[], downloaded_bytes=0,
    )


async def prepare(platform, url, job):
    cfg = make_config(job)

    class VideoOnlyDownloader(Downloader):
        @auto_task
        async def download_img(self, *args, **kwargs):
            return job / 'unused-image'

    downloader = VideoOnlyDownloader(cfg)
    children = set()
    token = task_registry.set(children)
    parser = None
    try:
        parser = PARSERS[platform](cfg, downloader)
        keyword, matched = parser.search_url(url)
        result = await parser.parse(keyword, matched)
        videos = [c for c in result.contents if isinstance(c, VideoContent)]
        if not videos:
            raise ValueError('no video')
        video = videos[0]
        duration = video.duration / 1000 if platform in ('douyin', 'kuaishou') else video.duration
        if duration > MAX_SECONDS:
            raise ValueError('video too long')
        path = (await video.get_path()).resolve()
        if not path.is_relative_to(job.resolve()) or not path.is_file():
            raise ValueError('invalid local video')
        if not 0 < path.stat().st_size <= MAX_BYTES:
            raise ValueError('video too large')
        proc = await asyncio.create_subprocess_exec(
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name',
            '-of', 'json', str(path), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        info = json.loads(out)
        if proc.returncode or not any(s.get('codec_type') == 'video' for s in info.get('streams', [])):
            raise ValueError('not a playable video')
        os.chmod(path, 0o600)
        return {'path': str(path), 'duration': duration, 'bytes': path.stat().st_size}
    finally:
        for task in list(children):
            if not task.done():
                task.cancel()
        await asyncio.gather(*children, return_exceptions=True)
        task_registry.reset(token)
        await downloader.close()
        if parser:
            await parser.close_session()
        for file in job.rglob('*'):
            if file.is_file() and not file.is_symlink():
                os.chmod(file, 0o600)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('url')
    args = parser.parse_args()
    request = parse_url(args.url)
    if not request:
        raise ValueError('unsupported url')
    STAGE.mkdir(mode=0o700, parents=True, exist_ok=True)
    clean_stage()
    job = STAGE / ('job-' + uuid.uuid4().hex)
    job.mkdir(mode=0o700)
    result = await prepare(request[0], request[1], job)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({'error': str(error)[:200]}, ensure_ascii=False))
        sys.exit(1)
