# 🐋 DeepWhale · 深海鲸鱼女仆

> 一套基于 **DeepSeek Harness (DSH)** 的**单机** QQ 数字伴侣全家桶：
> 仿生记忆大脑 + 12 维神经星环控制台 + 15 种原生图卡玩法 + 主人专属偏心系统。
>
> **一台机器、一条命令、一个浏览器页面**就能跑起来。不需要第二台服务器，也不需要显卡。

<p align="center">
  <em>NEURAL RING 神经星环 · 12 类神经团实时可视化</em><br/>
  <em>MEMORY-BRAIN 3D 圆锥星云 · 记忆原子与实体关系图谱</em>
</p>

---

## 目录

- [它和别的 QQ Bot 有什么不一样](#它和别的-qq-bot-有什么不一样)
- [核心能力](#核心能力)
- [架构（单机）](#架构单机)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [目录结构](#目录结构)
- [记忆系统怎么工作](#记忆系统怎么工作)
- [主人（Owner）系统](#主人owner系统)
- [常见问题](#常见问题)
- [许可与署名](#许可与署名)

---

## 它和别的 QQ Bot 有什么不一样

大多数 QQ Bot 框架解决的是「**收消息 → 调模型 → 发消息**」。
DeepWhale 关心的是另一个问题：**怎么让她像一个人，而不是一个接口。**

| 维度 | 传统方案（AstrBot / NoneBot / Koishi 拼插件） | DeepWhale |
|---|---|---|
| **架构** | 消息路由 + 一堆插件各自读写数据库、各自往 system prompt 塞指令 | 单一策略层统一调度：情绪、记忆、人设、玩法、图形渲染收在一个进程内，预处理 `<20ms` |
| **看图** | 调外部视觉工具，两段式往返 20–30 秒，动图基本没戏 | **原生多模态**：GIF 自动抽 4 帧关键画面直接塞进模型视野，单步 4–6 秒 |
| **群聊认人** | 要么全群共用一个上下文（张冠李戴），要么按人彻底隔离（接力聊天断片） | **个人 Session + 本群公共时间线**：群友接力聊不断片，同时绝不把 A 的话安到 B 头上 |
| **记忆** | 要么只有上下文窗口，要么全塞向量库越来越吵 | 12 类神经团分类 + 实体关系图谱 + 五路混合召回 + 衰减/归档/冲突消解 |
| **遗忘与纠错** | 只能全留或全删 | 重要性衰减、相似合并、反义冲突检测（说「讨厌香菜」会自动覆盖旧的「喜欢香菜」） |
| **可视化** | 单一力导向图或干脆没有 | **双核**：2D 12 维神经星环（NEURAL RING）+ 3D 圆锥记忆星云（带角色挂件、拖拽旋转、滚轮缩放） |
| **娱乐玩法** | 到处找第三方插件，画风割裂 | **15 种原生玩法 + Pillow 高清图卡**，统一美术风格，群聊与私聊都能玩 |
| **主人体验** | 管理员权限 = 能执行 `/reset` | 一套贯穿人设、游戏规则与状态机的**契约主系统**（见下文） |
| **硬件** | 装向量模型动辄 2–3G 内存 | SQLite FTS5 二进制组 + 内存 mtime 热缓存，**300MB 内存可稳定跑**，无需显卡 |
| **部署** | 需要常驻服务器 + 各种 cron | 单进程内置调度器（潜意识提炼 / 热榜 / 每日梦境 / 快照维护），Windows 本机也能挂 |

---

## 核心能力

### 🧠 仿生记忆（四层脑区）

| 脑区 | 类比 | 实现 |
|---|---|---|
| **海马体** | 记什么 | 12 类神经团（情景 / 语义 / 程序 / 偏好 / 前瞻 / 图式 / 自我 / 社会 / 事实 / 来源 / 纠错 / 归档） |
| **神经递质** | 情绪化学 | 四维荷尔蒙：多巴胺（兴奋）、催产素（依恋）、去甲肾上腺素（炸毛）、血清素（治愈） |
| **默认模式网络** | 没说出口的话 | 每轮生成一句「内心 OS」，网页控制台可实时偷看（仅主人可见） |
| **杏仁核** | 高光记忆 | 情绪浓度极高的时刻结晶成「核心记忆水晶球」，永不衰减 |

配套能力：

- **心潮驱力**：思念值 / 嘴硬值 / 玩心 / 委屈度 / 分享欲五轴随时间漂移，越阈值触发真实行为（久别重逢的傲娇、被叫外号后的告状）
- **风味糖果盒**：临时性格胶囊（粘人 / 毒舌 / 微醺 / 高冷 / 吃醋），只作用于接下来 4–5 轮，用完即焚，**绝不污染人设文件**
- **睡前日记**：每天自动写一封《深海交换手账》+ 一场荒诞怪梦，第二天可以顺嘴提起
- **潜意识提炼**：每 30 分钟把双边对话压成「共同回忆(MM-DD)」，并抽取实体与关系边写进图谱

### 🎴 15 种原生玩法（群聊 / 私聊都能玩）

| 玩法 | 口令 | 产物 |
|---|---|---|
| 逆天语录入典 | 引用消息 + `入典` | 黑金传世名言卡 |
| SSR/UR 闪卡 | `抽卡`、`抽卡 @某人` | 攻防双技能卡 |
| 跨服决斗 | `决斗 @某人`（私聊直接 `决斗`） | 技能对轰战报 + 饼干赌注 |
| 深海晚报 | 引用 + `上头条` | 震惊部头版大图 |
| 甩竿钓鱼 | `钓鱼` | 渔获播报 / 黑历史漂流瓶 |
| 成分鉴定 | `鉴定一下我` | 表面成分 / 隐藏属性 / 含鱼浓度 |
| 今日搭子 / CP | `今日搭子`、`测CP` | 相性卡（同步率 + 标签） |
| 人物八卦关系网 | `群关系图` | 环形头像节点 + 关系连线 |
| 水群龙王榜 / 词云 | `今日词云` | Top5 头像进度条 + 热词云 |
| 平行宇宙小剧场 | `编个小剧场：@A 和 @B …` | 原生合并转发聊天记录 |
| 隐藏成就奖状 | 引用 + `颁个奖` | 黑金成就横幅 |
| 深海饼干铺 | `领饼干`、`投喂鲸鱼 3`、`偷饼干 @某人` | 饼干账本 |
| 深海股市 | `股市`、`买入 @某人 2` | 群友身价行情 |
| 邪恶许愿机 | `我许愿：…` | 字面反转的因果律报应 |
| 蔚蓝 Logo / GalGame 框 / 搜番 | `做logo 左 右`、`用对话框夸我`、发图 + `搜番` | 各类图卡 |

### 🖥️ NEURAL RING 网页总控台

一个页面管全部：

- **2D 神经星环**：12 扇区发光环 + 金色刻度 + 内部彩色力导向星云 + 实时召回脉冲流
- **3D 记忆星云**：圆锥放射布局，鼠标拖拽旋转 / 滚轮缩放 / 悬停看原文（含视觉记忆缩略图）
- **陪伴舱**：网页直接撸鲸鱼（摸呆毛 / 塞曲奇 / 调暖夜灯 / 捏尾巴），跨次元影响她在 QQ 里的心情与台词
- **免 QQ 直聊窗**：不登 QQ 也能在网页上 1v1 聊天，走同一套人设与记忆
- **记忆管理**：任意神经团的增删改查、糖果盒投喂、心潮滑杆、核心记忆球凝结
- **人格与梗库**：在线编辑 persona/style，一键保存生效
- **表情与图卡画廊**：预览并一键发送
- **双机/单机运维**：服务状态、日志流、一键重启；Linux 下还能直接抓 QQ 虚拟桌面扫码重登
- **手机竖屏适配**：躺床上也能摸呆毛

---

## 架构（单机）

```text
                        ┌──────────────────────────────────────────┐
   手机 / PC QQ          │           DeepSeek Harness (DSH)          │
        │                │                                          │
        ▼                │  ┌────────────────────────────────────┐  │
  SnowLuma / NapCat ────►│  │ packages/dsh-onebot-patched        │  │
  (OneBot v11 WS)        │  │  · 原生多模态（GIF 抽帧）           │  │
                         │  │  · 群聊公共时间线（防串人 / 不断片） │  │
                         │  │  · 历史持久化、工具面收敛           │  │
                         │  └───────────────┬────────────────────┘  │
                         │                  ▼                       │
                         │  ┌────────────────────────────────────┐  │
                         │  │ packages/dsh-whale-policy          │  │
                         │  │  · 人设 / 记忆 / 情绪 / 早晚安仪式   │  │
                         │  │  · 心潮驱力 + 糖果盒 + 读心术        │  │
                         │  │  · fun_plugins.mjs 15 种玩法        │  │
                         │  │  · visual_cards.py 图卡渲染         │  │
                         │  └───────────────┬────────────────────┘  │
                         └──────────────────┼───────────────────────┘
                                            │ HTTP（可选）
                         ┌──────────────────▼───────────────────────┐
                         │ memory-core（可选）                       │
                         │ SQLite FTS5 五路召回 + 实体关系图谱        │
                         └──────────────────▲───────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────┐
        │                                   │                       │
┌───────┴────────┐              ┌───────────┴─────────┐   ┌─────────┴────────┐
│ whale-console  │              │ whale-daemon        │   │ data/            │
│ NEURAL RING    │              │ 内置调度器           │   │ memory.json      │
│ 3D 记忆星云     │              │ · 30m 潜意识提炼     │   │ brain.db (WAL)   │
│ 陪伴舱 / 直聊   │              │ · 2h 热榜           │   │ self/persona.txt │
│ :31888         │              │ · 03:35 日记+怪梦   │   │ media/stickers/  │
└────────────────┘              │ · 04:00 维护+快照    │   └──────────────────┘
                                └─────────────────────┘
```

**关键设计**：所有路径、QQ 号、端口、模型接口都来自 `whale.config.json` + `WHALE_*` 环境变量
（见 `shared/whale-config.mjs` 与 `shared/whale_env.py`），**仓库里没有任何写死的个人信息**。

---

## 快速开始

### 前置

- **Node.js ≥ 20**（跑 DSH 与控制台）
- **Python ≥ 3.10**（图卡渲染、记忆提炼）
- 可选：`ffmpeg`（GIF 抽帧 / 视频）、`pypinyin`（谐音梗索引）
- 可选：DeepSeek Harness 本体（只在你要接 QQ 时需要）

### Linux / macOS

```bash
git clone https://github.com/SelYio666/dsh-deep-whale.git && cd dsh-deep-whale
bash scripts/install.sh            # 建 .venv、装依赖、初始化 data/
$EDITOR whale.config.json          # 填 ownerQq / testGroupId / llm.apiKey
.venv/bin/python whale-console/server.mjs      # 起控制台
.venv/bin/python whale-daemon/scheduler.py     # 起后台任务（另开一个终端）
```

打开 `http://127.0.0.1:31888/whale-ops/?key=<你的 consoleKey>`。

### Windows

```powershell
git clone https://github.com/SelYio666/dsh-deep-whale.git; cd dsh-deep-whale
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
notepad whale.config.json
.venv\Scripts\python.exe whale-console\server.mjs
.venv\Scripts\python.exe whale-daemon\scheduler.py
```

### 接 QQ（可选）

1. 装好 SnowLuma / NapCat，以 **OneBot v11 反向 WebSocket** 连到 DSH。
2. 在 DeepSeek Harness 配置里加载两个插件：
   - `packages/dsh-onebot-patched`
   - `packages/dsh-whale-policy`（把 `cordis.patch.yml` 里的示例路径改成你的 `data/` 路径）
3. 把 `whale.config.json` 里的 `ownerQq` 改成**你自己的 QQ 号**——这样她才会认你当主人。

> 不想折腾 QQ 协议号？那就只用网页直聊窗，一样能聊天、抽卡、看日记、玩糖果盒。

---

## 配置说明

`whale.config.json`（首次运行从 `whale.config.example.json` 复制）：

| 字段 | 说明 |
|---|---|
| `ownerQq` | **主人 QQ 号**。填了它，她才会对你开启偏心、免 @ 唤醒、糖果盒等特权 |
| `testGroupId` | 测试群号（用于「遥控发消息」「表情一键发送」） |
| `botQq` | 机器人自己的 QQ（可留空） |
| `dataDir` | 运行数据目录，默认 `./data` |
| `consoleKey` | 控制台访问密钥，**请改成足够长的随机串** |
| `memoryCorePort` / `memoryCoreToken` | 若接了 `memory-core` 则填对应端口与令牌 |
| `llm.baseUrl` | OpenAI 兼容接口：`https://api.deepseek.com/v1`、硅基流动、本地 Ollama 等 |
| `llm.apiKey` | API Key（也可用环境变量 `WHALE_LLM_KEY` 覆盖，更安全） |
| `llm.model` / `llm.visionModel` | 文本模型 / 视觉模型 |
| `llm.maxTokens` | 上限。**注意**：带 reasoning 的模型建议 ≥ 2048，否则 `content` 可能为空 |

所有字段都可用环境变量覆盖：`WHALE_OWNER_QQ`、`WHALE_DATA_DIR`、`WHALE_LLM_BASE`、`WHALE_LLM_KEY`、`WHALE_LLM_MODEL`、`WHALE_CONSOLE_KEY`、`WHALE_PYTHON` 等。

---

## 目录结构

```text
.
├── whale.config.example.json     # 配置模板（复制成 whale.config.json）
├── requirements.txt
├── shared/
│   ├── whale-config.mjs          # Node 侧统一配置（唯一来源）
│   └── whale_env.py              # Python 侧统一配置（对齐同一份）
├── packages/
│   ├── dsh-onebot-patched/       # 增强版 OneBot v11 桥（MPL-2.0）
│   │   ├── lib/index.js
│   │   ├── package.json
│   │   └── LICENSE
│   └── dsh-whale-policy/         # 核心策略插件（MIT）
│       ├── lib/index.js          # 人设 / 记忆 / 情绪 / 特权
│       ├── fun_plugins.mjs       # 15 种玩法
│       ├── visual_cards.py       # 图卡渲染（Pillow）
│       ├── quote_card.py         # 语录卡渲染
│       ├── distill_memories.py   # 潜意识提炼
│       ├── video_fetch.py        # 视频解析（可选）
│       └── cordis.patch.yml      # DSH 插件配置示例
├── whale-console/                # NEURAL RING 网页总控台
│   ├── server.mjs
│   └── index.html
├── whale-daemon/                 # 单机内置调度器
│   ├── scheduler.py
│   └── dream_diary.py
├── scripts/
│   ├── install.sh / install.ps1
│   └── build_meme_index.py       # 生成拼音/首字母梗索引
├── docs/ARCHITECTURE.md
└── data/                         # 运行数据（不入库）
    ├── self/                     # persona / style / 梗库 / 表情目录
    ├── state/                    # memory.json / brain.db / 缓存
    ├── media/whale-stickers/     # 表情包与生成图卡
    └── backups/                  # 每日快照
```

---

## 记忆系统怎么工作

1. **写入**：每轮对话只取「当前说话人这一句」，避免旁人污染；关键句（偏好、约定、送礼物）额外落一条结构化记忆。
2. **分类**：自动归入 12 类神经团之一（情景 / 语义 / 程序 / 偏好 / 前瞻 / 图式 / 自我 / 社会 / 事实 / 来源 / 纠错 / 归档）。
3. **召回**：五路混合打分（语义 + 关键词二元组 + 重要性 + 新鲜度半衰期 + 实体图谱加成），带 1 跳图扩散；上下文只注入 1–3 条，约 150–300 token。
4. **遗忘**：重要性每日衰减，低于阈值归档；相似度 ≥0.92 合并；反义冲突自动消解并在「纠错层」留痕。
5. **做梦**：每日把高价值片段压成元记忆（日记 / 怪梦 / 画像），次日可直接调用。

> 只保留「够用的记忆」而不是「所有记录」，是长跑不崩的关键。

---

## 主人（Owner）系统

把 `ownerQq` 填成你的 QQ，会解锁一整套贯穿玩法与语气的特权：

- **认主铁律**：你在群里问「我是谁」，她会当众骄傲地认出「我家老大」，不会因为隐私规则装不认识
- **免 @ 唤醒**：群里直呼「鲸鱼 / 肥鱼」就能叫出来；戳她有专属双击回蹭暗号
- **双标偏心**：对群友伶牙俐齿，对你明显更软；别人损她会拍尾巴，你损她只会委屈撒娇
- **游戏护主**：群友偷你饼干 100% 被抓包反扣；跟你决斗必吹黑哨保你赢；你的闪卡固定 `UR · 契约主`
- **专属记忆**：跨群、私聊共享的记忆槽（普通群友上限 8 条，你 30 条）
- **值班室**：网页摸呆毛 / 塞曲奇会实时改变她 30 分钟内的心情与台词
- **读心术**：网页可看她每轮「嘴上说的」和「心里想的」两版

---

## 常见问题

**Q：能不用 QQ 吗？**
能。控制台自带网页直聊窗（`/api/chat/solo`），人设、记忆、糖果盒、表情包全部可用。

**Q：需要显卡 / 向量模型吗？**
不需要。检索默认走 SQLite FTS5 字符二元组 + 图谱 + 重要性，毫秒级；想加语义检索再接 embedding 接口即可。

**Q：Windows 本地能跑吗？**
能。图卡渲染会按「文泉驿 → Noto CJK → 微软雅黑/黑体 → 苹方」自动探测系统字体；`ffmpeg` 与 `pypinyin` 都是可选。

**Q：为什么回复偶尔是空的 / 只有半句？**
常见原因是 `llm.maxTokens` 太小，带 reasoning 的模型把额度花在思考上。把 `maxTokens` 调到 ≥ 2048。

**Q：她答话时把别人的事安到我头上？**
确认你用的是本仓库的 `dsh-onebot-patched`（含群聊公共时间线 + 认人护栏），而不是原版适配器。

**Q：怎么备份？**
`whale-daemon/scheduler.py` 每天 04:00 会把 `memory.json` + `brain.db` + 人设打包进 `data/backups/`，保留最近 7 份。

---

## 许可与署名

- 本项目原创部分：**MIT**（见 `LICENSE`）
- `packages/dsh-onebot-patched`：源自 DeepSeek Harness 官方 OneBot 适配器，沿用 **MPL-2.0**
- 记忆内核 `memory-core`（可选、通过 HTTP 对接、不随仓库分发）：[peterpoal134/memory-brain](https://github.com/peterpoal134/memory-brain)，**AGPL-3.0**
- 表情包与字体**不随仓库分发**，请自备并确认授权

详见 [`NOTICE.md`](NOTICE.md)。

---

<p align="center"><em>“深海值班台 24 小时营业中。”</em></p>
