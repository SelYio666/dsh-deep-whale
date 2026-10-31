# 打包为可发布 zip（Windows / 跨平台）
param(
  [string]$OutFile = "dsh-deep-whale-opensource.zip"
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Src  = Split-Path -Parent $Root
$Name = Split-Path -Leaf $Root
$Tmp  = Join-Path ([System.IO.Path]::GetTempPath()) ("whale-pack-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Tmp | Out-Null

# 只带走该带的东西，绝不包含 data/、.venv、__pycache__、密钥
$Include = @('.gitignore','.gitattributes','LICENSE','NOTICE.md','README.md','requirements.txt',
             'whale.config.example.json','shared','packages','whale-console','whale-daemon','scripts','docs')
foreach ($item in $Include) {
  $p = Join-Path $Root $item
  if (-not (Test-Path $p)) { continue }
  $dest = Join-Path (Join-Path $Tmp $Name) $item
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  Copy-Item -Recurse -Force $p $dest
}

# data/ 只保留示例与占位
$dataDest = Join-Path (Join-Path $Tmp $Name) 'data'
New-Item -ItemType Directory -Force -Path (Join-Path $dataDest 'self') | Out-Null
Get-ChildItem (Join-Path $Root 'data\self') -Filter '*.example.*' -ErrorAction SilentlyContinue |
  ForEach-Object { Copy-Item $_.FullName (Join-Path $dataDest 'self') }
foreach ($d in 'state','media\whale-stickers','media\whale-video','voice','backups') {
  New-Item -ItemType Directory -Force -Path (Join-Path $dataDest $d) | Out-Null
  Set-Content -Path (Join-Path $dataDest "$d\.gitkeep") -Value ''
}

$zip = Join-Path $Src $OutFile
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $Tmp $Name) -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $Tmp -Recurse -Force

$size = (Get-Item $zip).Length
Write-Host "打包完成: $zip  ($([math]::Round($size/1KB,1)) KB)"
