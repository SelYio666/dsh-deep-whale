# NOTICE — 第三方组件与署名

本仓库的**原创部分**（`whale-console/`、`whale-daemon/`、`shared/`、`scripts/`、`packages/dsh-whale-policy/` 中的策略与插件代码、
`fun_plugins.mjs`、`visual_cards.py`、`quote_card.py`、`distill_memories.py`）采用 **MIT**（见 `LICENSE`）。

## 1. `packages/dsh-onebot-patched/`

源自 DeepSeek Harness 官方 OneBot v11 适配器，原仓库以 **MPL-2.0** 发布。
本仓库对其做了增强（GIF 抽帧原生看多模态、群聊公共时间线防串人、历史持久化、工具面收敛等），
按 MPL-2.0 要求：

- 本目录继续以 **MPL-2.0** 授权；
- 修改文件本身（`lib/index.js`）与其衍生修改均以 MPL-2.0 公开；
- 上游版权与许可声明保留在本目录。

## 2. 记忆内核 `memory-core`（可选依赖，不随本仓库分发）

推荐搭配 [peterpoal134/memory-brain](https://github.com/peterpoal134/memory-brain) 的 `memory-core`
（SQLite FTS5 五路混合检索 + 实体关系图谱 + 衰减归档），其许可证为 **AGPL-3.0**。

本项目通过 **HTTP 接口**（`/recall`、`/remember`、`/graph`、`/maintenance/run`）与它通信，
不复制其源码，因此不构成衍生作品。若你选择把 `memory-core` 一起打包分发，
需按 **AGPL-3.0** 授权该部分并保留原作者署名。

## 3. 运行时宿主 DeepSeek Harness

`@deepseek-ai/dsh-*` 系列包是插件运行的宿主，通过 `peerDependencies` 引用，
**不包含在本仓库中**。请自行按官方方式安装 DeepSeek Harness。

## 4. 美术与素材

- `data/media/whale-stickers/` 里的鲸鱼表情包**不在仓库内**，只提供 `sticker-catalogue.example.json` 结构说明。
  如需使用请自行准备素材，并确认你拥有相应使用/再分发权利。
- 字体不随仓库分发：`visual_cards.py` 会按
  `文泉驿正黑 → Noto Sans CJK → Windows 微软雅黑/黑体 → macOS 苹方` 的顺序探测系统字体。
