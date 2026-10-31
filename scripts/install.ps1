# DeepWhale 一键安装（Windows PowerShell）
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
Write-Host "==> DeepWhale 安装在 $Root"

if (-not (Test-Path 'whale.config.json')) {
  Copy-Item 'whale.config.example.json' 'whale.config.json'
  Write-Host '!! 已生成 whale.config.json，请先填写 ownerQq / testGroupId / llm.apiKey'
}

$python = if ($env:WHALE_PYTHON) { $env:WHALE_PYTHON } else { 'python' }

if (-not (Test-Path '.venv')) {
  Write-Host '==> 创建虚拟环境 .venv'
  & $python -m venv .venv
}
$vpy = Join-Path $Root '.venv\Scripts\python.exe'

Write-Host '==> 安装 Python 依赖'
& $vpy -m pip install --upgrade pip | Out-Null
& $vpy -m pip install -r requirements.txt

Write-Host '==> 初始化数据目录'
& $vpy -c "import sys,os;sys.path.insert(0,os.path.join(os.getcwd(),'shared'));from whale_env import ensure_dirs,DATA_DIR;ensure_dirs();print('data dir:',DATA_DIR)"

if (-not (Test-Path 'data\self\persona.txt')) { Copy-Item 'data\self\persona.example.txt' 'data\self\persona.txt' -ErrorAction SilentlyContinue }
if (-not (Test-Path 'data\self\style.txt'))   { Copy-Item 'data\self\style.example.txt'   'data\self\style.txt'   -ErrorAction SilentlyContinue }

Write-Host ''
Write-Host '==> 完成。下一步：'
Write-Host '  1) 编辑 whale.config.json（ownerQq / testGroupId / llm.apiKey）'
Write-Host "  2) 启动控制台：   `"$vpy`" whale-console\server.mjs"
Write-Host "  3) 启动后台任务： `"$vpy`" whale-daemon\scheduler.py"
Write-Host '  4) 浏览器打开：   http://127.0.0.1:31888/whale-ops/?key=<consoleKey>'
Write-Host ''
Write-Host '  如果要用 QQ：在 DeepSeek Harness 里加载 packages/dsh-onebot-patched 与 packages/dsh-whale-policy'
