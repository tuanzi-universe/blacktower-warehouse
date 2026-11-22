# 仓库分区

黑塔仓库的物品分类分区方案：8 区冷热布局（623 存储单元 / 1822 条规则），由 `tools/build.js` 从规则定义生成点位 JSON 与审计 CSV，并附带 2D 平面图查看器。

## 目录结构

```
warehouse-partition/
├── viewer/                    # 交付物：浏览器打开
│   ├── index.html             # 2D 平面图（v1/v2/v3 切换、差异、搜索、导入导出）
│   ├── unmapped.html          # 未收录物品报告
│   └── assets/                # 查看器静态资源（贴图 tex/、points-io.js、xlsx）
├── data/
│   ├── items.json             # 输入：游戏物品注册表
│   ├── enchantments.json      # 输入：附魔列表
│   ├── effects.json           # 输入：药水效果
│   ├── partition.csv          # 输入：旧版布局基准
│   ├── partition_new.csv      # 输出：880 行全量布局
│   ├── storage_units.csv      # 输出：623 个存储单元
│   ├── storage_units-v2.csv   # v2 冻结基准（报告对比用）
│   ├── item_map.csv           # 输出：1822 行逐物品映射
│   ├── item_map-v2.csv        # v2 冻结基准（报告对比用）
│   └── points/
│       ├── itemsorter-points-v1.json    # 冻结基准（只读）
│       ├── itemsorter-points-v2.json    # 上一轮快照（v3 差异基线）
│       ├── itemsorter-points-v3.json    # 工作版本（主交付物）
│       └── itemsorter-points.json       # bot 兼容副本，与 v3 同步
├── docs/
│   ├── 分区方案.md             # 主方案：分区表、归位规则、验证
│   ├── itemsorter-points-spec.md        # 点位 JSON 格式规范
│   ├── 本次改进.md             # 本轮重排说明
│   ├── 合并编组报告.md / .csv  # 生成：合并编组单元
│   └── 改进物品清单.md / .csv  # 生成：逐物品变化
└── tools/
    ├── build.js               # 主构建：生成点位 JSON 与审计 CSV
    ├── build-html.js          # 用模板生成 viewer/index.html
    ├── families.js            # 族定义（含跨材质变体单元）
    ├── attributes.js          # 附魔等级、药水效果 ID 与中文名
    ├── report-merged.js       # 生成合并编组报告
    ├── report-unmapped.js     # 生成未收录物品 HTML
    ├── diff-items.js          # 生成改进物品清单
    ├── validate.js            # 覆盖率、点位、每侧单元数校验
    ├── validate-coldhot.js    # 冷热归属、重组、顺序校验
    ├── validate-load.ts       # 用 bot loader 实际加载
    ├── validate-match.ts      # 物品匹配冒烟测试
    ├── test-points-io.js      # points-io 回导测试
    └── template/              # HTML 模板与注入数据（build 中间产物）
```

## 查看平面图

需本地 HTTP（fetch 点位 JSON）。在项目根目录：

```bash
python -m http.server 8000
```

打开 `http://localhost:8000/viewer/index.html`。

## 常用命令

均在项目根目录执行：

| 命令 | 作用 |
|---|---|
| `node tools/build.js` | 生成点位 JSON（v3 + bot 副本）与三个审计 CSV |
| `node tools/build-html.js` | 重新生成 `viewer/index.html` |
| `node tools/validate.js` | 覆盖率、点位、每侧单元数校验 |
| `node tools/validate-coldhot.js` | 冷热归属、重组、顺序校验 |
| `node tools/report-merged.js` | 生成 `docs/合并编组报告` |
| `node tools/report-unmapped.js` | 生成 `viewer/unmapped.html` |
| `node tools/diff-items.js` | 生成 `docs/改进物品清单` |
| `node tools/test-points-io.js` | points-io 45 项回导测试 |

`validate-load.ts` / `validate-match.ts` 依赖 warehouse-bot 源码，在 bot 目录下运行：
`npx tsx ../warehouse-partition/tools/validate-load.ts`。

## 重新布局流程

改 `tools/families.js` / `tools/build.js` → `build.js` → `validate.js` → `validate-coldhot.js` → `build-html.js` → 三个报告脚本。

## 发布

`.github/workflows/deploy-viewer.yml`：push 到 main/master（或手动触发）时，先跑三个校验脚本，通过后把 `viewer/` + `data/points/` 发布到 GitHub Pages。首次使用需在仓库 Settings → Pages 将 Source 设为 **GitHub Actions**。发布后访问 `https://<user>.github.io/<repo>/viewer/`。

点位版本：

- `data/points/itemsorter-points-v1.json`：冻结基准，build 不覆盖，只用于对比。
- `data/points/itemsorter-points-v2.json`：上一轮快照（冻结），v3 的差异对比基线。
- `data/points/itemsorter-points-v3.json`：工作版本，重新布局的唯一目标。
- `data/points/itemsorter-points.json`：每次 build 与 v3 同步的 bot 兼容副本。

启用到 bot：复制 `data/points/itemsorter-points.json` 到 `../warehouse-bot/config/` 并重启 bot。
