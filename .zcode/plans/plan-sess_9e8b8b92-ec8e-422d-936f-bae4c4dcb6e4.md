## Context

仓库分区项目（C:\Projects\blacktower\warehouse-partition）目前所有文件平铺在根目录：数据 JSON/CSV、文档、HTML 交付物、报告混杂，只有 assets/ 和 tools/ 两个子目录。目标是重新设计目录结构并生成 README，使「数据 / 工具 / 文档 / 查看器交付物」四类各归其位。所有文件均为 git 未跟踪状态，直接移动即可，无需 git mv。

## 新目录结构

```
warehouse-partition/
├── README.md                    # 新增
├── viewer/                      # 交付物：浏览器打开
│   ├── index.html               # ← partition-2d.html
│   ├── unmapped.html            # ← 未收录物品.html
│   └── assets/                  # ← assets/ 整体平移（points-io.js、texmap.json、xlsx、tex/）
├── data/
│   ├── items.json / enchantments.json / effects.json   # 输入
│   ├── partition.csv            # 旧版基准（输入）
│   ├── partition_new.csv / storage_units.csv / item_map.csv   # build 输出
│   └── points/
│       ├── itemsorter-points-v1.json   # 冻结基准
│       ├── itemsorter-points-v2.json   # 工作版本
│       └── itemsorter-points.json      # bot 兼容副本
├── docs/                        # 中文文档保留中文文件名
│   ├── 分区方案.md、itemsorter-points-spec.md、本次改进.md
│   ├── 合并编组报告.md + .csv
│   └── 改进物品清单.md + .csv
└── tools/
    ├── build.js、build-html.js、families.js、attributes.js
    ├── diff-items.js、report-merged.js、report-unmapped.js
    ├── validate.js、validate-coldhot.js、validate-load.ts、validate-match.ts
    ├── test-points-io.js
    └── template/
        ├── html-template.html   # ← tools/html-template.html
        └── html-data.json       # build 中间产物
```

`.playwright-mcp/` 临时快照删除（已在 .gitignore）。

## 脚本路径修改（tools 内 11 个脚本 + 模板）

所有脚本用 `ROOT = path.resolve(__dirname, '..')`，tools/ 保持在根层级不动，只需把文件名改成 `path.join(ROOT, 'data', ...)` 等子路径：

- **tools/build.js**：读 `data/partition.csv`、`data/items.json`、`data/enchantments.json`、`data/effects.json`；写 `data/partition_new.csv`、`data/storage_units.csv`、`data/item_map.csv`、`data/points/itemsorter-points-v2.json`、`data/points/itemsorter-points.json`、`tools/template/html-data.json`；读旧 HTML 改为 `viewer/index.html`（TEX 提取逻辑不变，`assets/tex/...` 相对路径因 assets 与 index.html 同目录仍然有效）。外部绝对路径（warehouse-bot 配置、papers CSV）不动。
- **tools/build-html.js**：模板读 `tools/template/`，输出 `viewer/index.html`。
- **tools/validate.js、validate-coldhot.js**：数据路径 → data/、data/points/，html-data.json → tools/template/。
- **tools/report-merged.js**：读 data/points、viewer/index.html；输出 `docs/合并编组报告.md/.csv`。
- **tools/report-unmapped.js**：读 data/；输出 `viewer/unmapped.html`。
- **tools/diff-items.js**：读 data/；输出 `docs/改进物品清单.md/.csv`。
- **tools/test-points-io.js**：`require('../viewer/assets/...')`；数据 → data/points/、html-data → tools/template/。
- **tools/validate-load.ts、validate-match.ts**：硬编码的 itemsorter-points.json 路径 → data/points/。
- **tools/template/html-template.html**：`VER_FILES` 改为 `../data/points/itemsorter-points-v1.json` 等（v1/v2 两项；imported 为浏览器暂存不含文件路径）。

## 文档引用更新

- **docs/分区方案.md**：文件清单表（第 128–153 行附近）、命令章节、`python -m http.server` 行——统一更新为新路径（如 `data/points/itemsorter-points-v2.json`、`viewer/index.html`、`python -m http.server 8000` 后访问 `/viewer/`）。
- **docs/本次改进.md**：文件路径提及同步更新。

## README.md（新增，简洁中文、无废话）

- 一句话项目简介（黑塔仓库分区：581 单元 / 1830 规则 + 2D 平面图查看器）
- 目录结构树（同上，含每个目录一行说明）
- 快速开始：项目根目录起本地 HTTP（`python -m http.server 8000`）→ 打开 `http://localhost:8000/viewer/`
- 常用命令表：build → build-html → validate/validate-coldhot → 各报告脚本 → test-points-io；validate-load/match 需 npx tsx
- 数据版本说明：v1 冻结 / v2 工作 / bot 兼容副本；启用需复制到 `warehouse-bot/config/` 并重启 bot
- 文档索引（docs/ 各文件一句话）

## 验证

1. `node tools/build.js` + `node tools/build-html.js` —— 确认产物写到新路径（data/、data/points/、viewer/index.html）
2. `node tools/validate.js` + `node tools/validate-coldhot.js` —— 校验通过
3. `node tools/test-points-io.js` —— 测试通过
4. 重跑 report-merged / report-unmapped / diff-items 确认输出落位 docs/ 与 viewer/
5. 起本地服务，用浏览器打开 viewer/index.html 确认 v1/v2 加载、贴图正常
