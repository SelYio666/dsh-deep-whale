#!/usr/bin/env bash
# DeepWhale 一键安装（Linux / macOS）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> DeepWhale 安装在 $ROOT"

if [ ! -f whale.config.json ]; then
  cp whale.config.example.json whale.config.json
  echo "!! 已生成 whale.config.json，请先填写 ownerQq / testGroupId / llm.apiKey 后再运行"
fi

PY="${WHALE_PYTHON:-python3}"
if [ ! -d .venv ]; then
  echo "==> 创建虚拟环境 .venv"
  "$PY" -m venv .venv
fi
VPY="$ROOT/.venv/bin/python"

echo "==> 安装 Python 依赖"
"$VPY" -m pip install --upgrade pip >/dev/null
"$VPY" -m pip install -r requirements.txt || true

echo "==> 初始化数据目录"
"$VPY" - <<'PY'
import sys, os
sys.path.insert(0, os.path.join(os.getcwd(), 'shared'))
from whale_env import ensure_dirs, DATA_DIR, SELF_DIR
ensure_dirs()
print('data dir:', DATA_DIR)
PY

if [ ! -f data/self/persona.txt ]; then
  cp data/self/persona.example.txt data/self/persona.txt 2>/dev/null || true
fi
if [ ! -f data/self/style.txt ]; then
  cp data/self/style.example.txt data/self/style.txt 2>/dev/null || true
fi

echo
echo "==> 完成。下一步："
echo "  1) 编辑 whale.config.json（ownerQq / testGroupId / llm.apiKey）"
echo "  2) 启动控制台：   $VPY whale-console/server.mjs"
echo "  3) 启动后台任务： $VPY whale-daemon/scheduler.py"
echo "  4) 浏览器打开：   http://127.0.0.1:31888/whale-ops/?key=<consoleKey>"
echo
echo "  如果要用 QQ：在 DeepSeek Harness 里加载 packages/dsh-onebot-patched 与 packages/dsh-whale-policy"
