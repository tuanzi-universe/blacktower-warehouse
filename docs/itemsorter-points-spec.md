# itemsorter 点位文件生成规范

> 交接对象：需要生成 `itemsorter-points.json` 的外部项目、配置编辑器或代码生成器。
> 目标：生成的文件可被 warehouse-bot 的 `itemsorter` 插件直接加载，无需人工修改。
> 人类可读的字段说明见 [itemsorter-points.md](itemsorter-points.md)；本文是生成器视角的**契约与验收标准**。

## 1. 交付物

生成器最终输出**一个 UTF-8 JSON 文件**，路径由 `config.yaml` 的 `plugins.itemsorter.pointsFile` 指定（默认 `./config/itemsorter-points.json`）。

| 项目     | 要求                                                              |
| -------- | ----------------------------------------------------------------- |
| 编码     | UTF-8，**不带 BOM**（带 BOM 会导致 `JSON.parse` 失败）            |
| 语法     | RFC 8259 合法 JSON；不允许注释、尾随逗号、`NaN`、`Infinity`       |
| 根节点   | 必须是 object，不能是数组或 `null`                                |
| 字段     | 只能使用本文定义字段；**所有层级都拒绝未知字段**                  |
| 版本字段 | 不要添加 `version`、`$schema`、`comment` 等字段，运行时会校验失败 |
| 缩进     | 建议 2 空格；缩进不影响解析                                       |
| 写入     | 建议先写临时文件再原子替换，避免 bot 重启时读到半截文件           |

文件没有格式版本号；如需版本管理，请放在生成器自己的项目或 API 中，不要写进 JSON。

## 2. 输出文件结构

```text
{
  "items": Rule[],                 // 可省略，缺省 []
  "home"?: Point,                  // homeMode=walk 时必填
  "trash"?: Point,                 // 可选
  "collector": Point,              // 必填
  "minecart": Point,               // 必填（当前仅解析保留，不参与行程）
  "button"?: BlockPoint,           // acquireMode=button 时必填
  "ready"?: ReadyPoint,            // readyAction.enabled=true 时必填
  "readyButton"?: BlockPoint       // readyAction.enabled=true 时必填
}
```

`items`、`home`、`trash`、`button`、`ready`、`readyButton` 可省略；`collector` 与 `minecart` 永远必填。省略 `items` 等价于空数组。

## 3. 基础数据类型

### 3.1 `Point`：站位点位

用于 `items[].point`、`home`、`trash`、`collector`、`minecart`。

| 字段    | 类型   | 必填 | 规则                                                   |
| ------- | ------ | ---- | ------------------------------------------------------ |
| `x`     | number | 是   | 水平坐标，可为小数                                     |
| `y`     | number | 是   | 垂直坐标，可为小数；寻路不使用 `y`，但日志与诊断会用到 |
| `z`     | number | 是   | 水平坐标，可为小数                                     |
| `yaw`   | number | 是   | 水平朝向，单位为度；**没有默认值，必须显式写入**       |
| `pitch` | number | 是   | 俯仰角，单位为度；**没有默认值，必须显式写入**         |
| `label` | string | 否   | 仅用于日志与人工备注，不影响行为                       |
| `area`  | string | 否   | 仓库区；运行时 `trim`，缺省按空字符串分组              |
| `side`  | string | 否   | 分类侧；运行时 `trim`，缺省按空字符串分组              |

坐标为 bot **脚部**位置。路径规划只使用 `x` / `z`，因此 `x` / `z` 必须是可站立、可达的位置；`y` 不会参与 `GoalXZ` 寻路，但建议填写真实站立高度，便于日志中的方块诊断。

`yaw` / `pitch` 原样按度转换为弧度后传给 `bot.look`。运行时不校验范围；建议统一归一化到 `[-180, 180]` 或 `[0, 360)`，并在生成器内部保持一致。

### 3.2 `BlockPoint`：方块坐标

用于 `button`、`readyButton`。

| 字段    | 类型   | 必填 | 规则                 |
| ------- | ------ | ---- | -------------------- |
| `x`     | number | 是   | 方块 X 坐标          |
| `y`     | number | 是   | 方块 Y 坐标          |
| `z`     | number | 是   | 方块 Z 坐标          |
| `label` | string | 否   | 仅用于日志与人工备注 |

`BlockPoint` 没有 `yaw` / `pitch`。坐标应为实际可交互方块的整数坐标（例如按钮、拉杆所在方块），运行时用 `bot.blockAt` 读取并按方块交互。

### 3.3 `ReadyPoint`：准备出发点

用于 `ready`，与 `Point` 相同，但 `yaw` / `pitch` 可省略。

| 字段    | 类型   | 必填 | 规则                 |
| ------- | ------ | ---- | -------------------- |
| `x`     | number | 是   | 水平坐标             |
| `y`     | number | 是   | 垂直坐标             |
| `z`     | number | 是   | 水平坐标             |
| `yaw`   | number | 否   | 缺省 `0`             |
| `pitch` | number | 否   | 缺省 `0`             |
| `label` | string | 否   | 仅用于日志与人工备注 |

## 4. `Rule` 与 `Match`

### 4.1 `Rule`

```text
{
  "weight"?: integer,   // 缺省 0
  "match": Match,
  "point": Point
}
```

| 字段     | 类型    | 必填 | 规则                                                 |
| -------- | ------- | ---- | ---------------------------------------------------- |
| `weight` | integer | 否   | 优先级，缺省 `0`；数值越大越优先。运行时不做范围限制 |
| `match`  | Match   | 是   | 匹配条件，至少包含一个条件                           |
| `point`  | Point   | 是   | 命中的物品投放到该点位                               |

### 4.2 `Match`

| 字段              | 类型        | 说明                                       |
| ----------------- | ----------- | ------------------------------------------ |
| `name`            | string      | 精确物品 ID，可带或不带 `minecraft:` 前缀  |
| `nameRegex`       | string      | 物品 ID 正则，作用于 `minecraft:<物品 ID>` |
| `enchantments`    | object      | 附魔名或数字 ID → **精确等级**             |
| `customName`      | string      | 自定义名称精确匹配（纯文本）               |
| `customNameRegex` | string      | 自定义名称正则（纯文本）                   |
| `lore`            | string      | lore 任意一行精确匹配                      |
| `loreRegex`       | string      | lore 任意一行正则匹配                      |
| `potionId`        | integer ≥ 0 | `potion_contents.potionId` 精确匹配        |
| `effects`         | array       | 药水自定义效果，只判断是否存在             |

约束：

1. `match` 至少包含上表中的一个字段；`{}` 非法。
2. 多字段之间是 **AND**，全部满足才命中。
3. 以下字段两两互斥，同时出现非法：
   - `name` 与 `nameRegex`
   - `customName` 与 `customNameRegex`
   - `lore` 与 `loreRegex`
4. `enchantments` 至少有一个键，值必须是 ≥ 1 的整数。
5. `effects` 至少有一个元素；元素为字符串或 ≥ 0 的整数。

### 4.3 `enchantments` 的对象形式

```json
{ "enchantments": { "mending": 1, "unbreaking": 3 } }
```

- 键：附魔名（推荐）或数字 ID 的字符串形式（如 `"10"`）。
- 值：要求的精确等级。
- 列出的附魔必须全部存在且等级完全相等；允许多余附魔。
- 附魔书读取 `stored_enchantments`，装备读取 `enchantments`，旧数据回退 NBT。
- 名称归一化：去掉 `minecraft:` 前缀、转小写、连续非字母数字字符转下划线。推荐生成小写 snake_case、不带命名空间的名称。
- 数字 ID 随 Minecraft 版本变化；生成器应优先使用名称。

### 4.4 `effects` 的数组形式

```json
{ "effects": ["speed", "water_breathing"] }
```

- 只匹配 `potion_contents` 的自定义效果（`customEffects`），旧数据回退 NBT `CustomPotionEffects`。
- **只判断存在，不比较等级与时长**；列出的效果必须全部存在，允许多余效果。
- 元素可以是效果名或数字 ID；效果名归一化规则与附魔相同。
- 标准药水通常只有 `potionId`、没有 `customEffects`，因此 `effects` 主要用于自定义药水。

## 5. 与 `config.yaml` 联动的条件必填

JSON Schema 无法表达“取决于 YAML 配置”的必填关系，生成器必须在写文件前按目标配置检查：

| YAML 配置                                       | JSON 必须包含            | 额外校验                                                                |
| ----------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `plugins.itemsorter.homeMode: walk`             | `home`                   | 无                                                                      |
| `plugins.itemsorter.homeMode: teleport`         | 无                       | `home` 可省略；即使存在也不会被读取                                     |
| `plugins.itemsorter.acquireMode: button`        | `button`                 | 与 `collector` 水平距离 ≤ 3 格，且 `abs(button.y - collector.y)` ≤ 2 格 |
| `plugins.itemsorter.acquireMode: auto`          | 无                       | `button` 可省略                                                         |
| `plugins.itemsorter.readyAction.enabled: true`  | `ready` 和 `readyButton` | `ready` 的 `yaw` / `pitch` 可省略，默认 `0`                             |
| `plugins.itemsorter.readyAction.enabled: false` | 无                       | 两个点都可省略                                                          |
| 任意配置                                        | `collector`、`minecart`  | 永远必填                                                                |

补充建议：

- 无法确定目标配置时，**尽量输出所有点位**；多输出的 `home` / `button` / `ready` / `readyButton` 在不相关模式下会被忽略，不会导致加载失败（`button` 的距离校验也只在 `button` 模式执行）。
- `ready` 与 `readyButton` 建议保持直线距离 ≤ 4.5 格。超出不会导致加载失败，但运行时不会点击按钮，只记录警告。
- `collector` 首次分拣前会校验 bot 与它的水平距离不超过 `maxCollectorDistance`（默认 200），并做一次不移动的可达性探测。生成器若知道出生点/接收点，建议提前校验距离。

## 6. 匹配语义（生成器必须遵守）

### 6.1 优先级与首条命中

- 运行时先按 `weight` 降序排序，`weight` 相同则保持 JSON 数组中的原始顺序（稳定排序）。
- 每件物品只使用**第一条命中的规则**，后续规则不再检查。
- 因此：
  - 如果生成器把所有规则按优先级排好序并省略 `weight`（全部为 0），文件顺序就是优先级。
  - 如果使用显式 `weight`，文件顺序只在同权重时生效；不要用数组顺序表达不同权重的优先级。
  - 通用兜底规则的 `weight` 必须低于特例规则，或在同权重时排在特例之后。

### 6.2 物品标识的来源

| 条件                 | 运行时匹配对象                         | 生成要求                                                    |
| -------------------- | -------------------------------------- | ----------------------------------------------------------- |
| `name`               | 归一化后的物品 ID（去掉 `minecraft:`） | 使用服务端/`minecraft-data` 的物品 ID，不要用中文名或展示名 |
| `nameRegex`          | `minecraft:<物品 ID>`                  | 正则必须包含 `minecraft:` 前缀；建议用 `^...$` 锚定         |
| `enchantments`       | 附魔注册表名称或 ID                    | 优先使用小写 snake_case 名称                                |
| `customName`         | 去格式代码并 `trim` 后的纯文本         | 输出纯文本；不要写 `§` 颜色代码                             |
| `customNameRegex`    | 同上                                   | 对纯文本做正则测试                                          |
| `lore` / `loreRegex` | 每一行去格式代码并 `trim` 后的纯文本   | 任意一行满足即可                                            |
| `potionId`           | 服务端药水注册表数字 ID                | 必须与目标 MC/服务端版本一致                                |
| `effects`            | `customEffects` 中的效果名称或数字 ID  | 名称优先；只判断存在                                        |

`name` 匹配只去掉一个前导 `minecraft:`，其余部分区分大小写。生成器应统一输出**小写、带命名空间**的物品 ID，例如 `minecraft:enchanted_book`；不要输出 `Enchanted_Book` 或展示名。

### 6.3 正则

- 使用 JavaScript `RegExp` 语法；运行时用 `new RegExp(source)` 编译，**不支持 flags**。
- 不要把 `/.../` 分隔符写进字符串；`"/^minecraft:.*_shulker_box$/"` 是错误写法。
- 非法正则会直接导致插件加载失败。生成器应在写文件前用 JS 运行时编译一次，或只使用保守的 ECMAScript 子集（避免 `(?P<>)`、`\A`、`\Z` 等非 JS 语法）。
- `nameRegex` 的匹配目标是 `minecraft:<物品 ID>`，因此正则里通常需要 `minecraft:` 前缀；`customNameRegex` / `loreRegex` 直接作用于纯文本。

### 6.4 遮蔽与重复规则

生成器应检测并阻止以下情况：

1. **完全重复的 `match`**：两条规则匹配条件完全相同，后一条永远不会被使用。
2. **通用规则遮蔽特例**：例如 `{ "name": "minecraft:enchanted_book" }` 的 `weight` 不低于 `{ "name": "minecraft:enchanted_book", "enchantments": { "mending": 1 } }` 时，特例永远匹配不到 mending 附魔书。
3. **无名称的宽泛规则**：只写 `enchantments` / `customName` / `lore` / `potionId` / `effects` 而没有 `name` / `nameRegex` 的规则可能匹配任意物品，必须显式给予足够低的优先级。

### 6.5 版本相关字段

- `potionId`、附魔数字 ID、效果数字 ID 都属于目标版本的注册表数据，可能随 MC 或服务端升级变化。
- 生成器必须知道目标 Minecraft 版本；无法解析时，优先使用名称，不要猜测数字 ID。
- 标准药水通常只带 `potionId`；自定义药水才带 `customEffects`。

## 7. 点位与行程语义

- **停靠点合并**：两个点位相同当且仅当 `x`、`y`、`z`、`yaw`、`pitch` 五项全部相同。多项规则指向同一点位会合并为一次停靠、一起投掷。
- **朝向不同即不同点**：坐标相同但 `yaw` / `pitch` 不同会被视为两个停靠点，生成器应避免无意的重复。
- **`area` / `side`**：只影响行程排序，不参与匹配。建议同一实际点位使用一致的 `area` / `side`；缺省值会归入空字符串组。
- **行程顺序**：有未映射物品且配置了 `trash` 时，`trash` 第一站；随后按 `area` 分组、同区内按 `side` 连续访问，区内用最近邻 + 2-opt；`collector` 永远是最后一站。
- **未映射物品**：没有任何规则命中的物品会按物品 ID 分组。配置了 `trash` 时投入垃圾点；未配置时只记录警告并留在背包。生成器若不能保证覆盖所有可能物品，建议始终输出 `trash`。
- **`collector`**：接收点/回收点，必填。首次分拣前会做距离与可达性校验。
- **`home`**：仅在 `homeMode: walk` 时作为登录后的起点被寻路访问；`teleport` 模式使用 `homeName`，不读取该点位。
- **`minecart`**：必填但当前未参与行程，属于保留字段。没有实际矿车点时，可填写与 `collector` 相同的合法点位。
- **`button`**：`acquireMode: button` 时使用，必须是真实可交互方块；与 `collector` 的水平距离 ≤ 3、垂直距离 ≤ 2，否则插件初始化失败。
- **`ready` / `readyButton`**：`readyAction.enabled` 时使用。每轮从 `collector` 出发前先走到 `ready`、转向，再点击 `readyButton`；点击成功后等待 `readyAction.delayTicks` 再开始分拣。
- **可站立性**：`Point` 的 `x` / `z` 必须是 bot 能到达并站立的位置。生成器若从建筑方块坐标推导，需要转换为脚部站位，不能直接使用方块中心或方块内部坐标。

## 8. 推荐生成流程

### 8.1 抽象输入

生成器至少需要：

1. 目标 `config.yaml` 中的 `homeMode`、`acquireMode`、`readyAction.enabled`；
2. 所有空间点位（`home` / `trash` / `collector` / `minecart` / `button` / `ready` / `readyButton`）；
3. 有序规则列表：匹配条件、投放点位、可选显式 `weight`、可选 `area` / `side`；
4. 目标 Minecraft 版本（用于解析物品、附魔、药水 ID）。

### 8.2 归一化

| 数据          | 归一化动作                                                           |
| ------------- | -------------------------------------------------------------------- |
| 物品 ID       | 转小写，统一为 `minecraft:<snake_case>`；不要使用展示名              |
| 附魔/效果名   | 去 `minecraft:`、转小写、非字母数字转 `_`，输出 snake_case           |
| 自定义名称    | 去掉 `§` 格式代码，`trim`                                            |
| lore 每一行   | 去掉 `§` 格式代码，`trim`                                            |
| `area`/`side` | `trim`；空字符串可省略                                               |
| 数值          | 确保 `weight` / `potionId` / 附魔等级 / 效果 ID 为整数，且满足最小值 |

### 8.3 排序

- 有显式优先级时：按优先级从高到低输出，并写入对应 `weight`。
- 没有显式优先级时：按业务期望顺序输出规则，省略 `weight`（全部按 0 处理）。
- 不要同时依赖“文件顺序”和“不同权重”表达优先级。
- 排序后执行第 6.4 节的遮蔽检查。

### 8.4 校验

按顺序执行：

1. JSON 语法校验（含无 BOM、无注释、无尾随逗号）。
2. 附录 A 的 JSON Schema 校验。
3. 第 5 节的配置相关必填与 `button` 距离校验。
4. 第 6、7 节的语义检查：重复 `match`、遮蔽、正则编译、点位一致性。
5. 如需更强保证，用目标版本的 itemsorter 加载一次文件，确认日志出现 `itemsorter 点位已加载`。

### 8.5 序列化

- UTF-8 无 BOM。
- 2 空格缩进、对象字段顺序不限；建议保持 `items` 在前、特殊点位在后，便于人工检查。
- 写临时文件后原子替换。
- 写入后通知 bot 重启或重连，因为点位文件只在插件 `setup` 阶段读取。

## 9. 验收清单

生成器输出必须满足：

- [ ] `JSON.parse` 成功，根节点是 object。
- [ ] 附录 A 的 JSON Schema 校验通过。
- [ ] 只包含本文列出的字段；没有 `version` / 注释 / `NaN` / `Infinity`。
- [ ] `items` 是数组；不是旧版「物品名 → 点位」对象。
- [ ] 每条规则都有非空 `match` 和 `Point`；`Point` 包含 `x` / `y` / `z` / `yaw` / `pitch`。
- [ ] `match` 中互斥字段没有同时出现；`enchantments` / `effects` 非空。
- [ ] 所有 `name` 为小写物品 ID；`nameRegex` 包含 `minecraft:` 前缀且能被 JS 编译。
- [ ] 按第 5 节补齐 `home` / `button` / `ready` / `readyButton`。
- [ ] `button` 与 `collector` 的距离满足水平 ≤ 3、垂直 ≤ 2。
- [ ] 不存在完全重复的 `match`；特例规则的优先级高于通用规则。
- [ ] 未配置 `trash` 时，生成器已明确接受“未映射物品会留在背包”的后果。
- [ ] 文件为 UTF-8 无 BOM，且已通过原子写入落盘。

运行时错误对照：

| 运行时错误（前缀）                                     | 生成器应检查的内容                     |
| ------------------------------------------------------ | -------------------------------------- |
| `无法读取 itemsorter 点位文件`                         | 路径、文件是否存在、权限               |
| `itemsorter 点位文件不是合法 JSON`                     | BOM、注释、尾随逗号、语法              |
| `itemsorter 点位文件 items 必须是数组`                 | 是否仍输出旧对象格式                   |
| `itemsorter 点位文件校验失败（...）：<路径>`           | 按字段路径修正类型、未知字段、互斥字段 |
| `配置为 homeMode=walk，但点位文件缺少 home 点位`       | 补齐 `home`                            |
| `配置为 acquireMode=button，但...缺少 button 点位`     | 补齐 `button`                          |
| `按钮距离 collector 过远`                              | 调整 `button` 坐标                     |
| `启用了 readyAction，但...缺少 ready/readyButton 点位` | 补齐两个准备点位                       |

## 10. 完整示例

以下示例假设目标配置为：

```yaml
plugins:
  itemsorter:
    homeMode: walk
    acquireMode: button
    readyAction:
      enabled: true
```

```json
{
  "items": [
    {
      "weight": 100,
      "match": { "name": "minecraft:enchanted_book", "enchantments": { "mending": 1 } },
      "point": {
        "x": 100,
        "y": 64,
        "z": 101,
        "yaw": 180,
        "pitch": 0,
        "label": "mending 附魔书",
        "area": "D",
        "side": "L"
      }
    },
    {
      "match": { "name": "minecraft:enchanted_book" },
      "point": {
        "x": 102,
        "y": 64,
        "z": 101,
        "yaw": 180,
        "pitch": 0,
        "label": "其它附魔书",
        "area": "D",
        "side": "L"
      }
    },
    {
      "weight": 50,
      "match": { "nameRegex": "^minecraft:.*_shulker_box$" },
      "point": {
        "x": 104,
        "y": 64,
        "z": 101,
        "yaw": 180,
        "pitch": 0,
        "label": "所有潜影盒",
        "area": "E",
        "side": "R"
      }
    },
    {
      "match": { "name": "minecraft:potion", "potionId": 23 },
      "point": {
        "x": 106,
        "y": 64,
        "z": 101,
        "yaw": 180,
        "pitch": 0,
        "label": "药水",
        "area": "C",
        "side": "L"
      }
    }
  ],
  "home": { "x": 100, "y": 64, "z": 100, "yaw": 0, "pitch": 0, "label": "起点" },
  "trash": { "x": 108, "y": 64, "z": 100, "yaw": 180, "pitch": 0, "label": "垃圾点" },
  "collector": { "x": 100, "y": 64, "z": 110, "yaw": 180, "pitch": 0, "label": "接收点" },
  "minecart": { "x": 100, "y": 64, "z": 111, "yaw": 180, "pitch": 0, "label": "矿车点" },
  "button": { "x": 101, "y": 65, "z": 111, "label": "领取按钮" },
  "ready": { "x": 100, "y": 64, "z": 109, "yaw": 180, "pitch": 0, "label": "准备出发点" },
  "readyButton": { "x": 102, "y": 65, "z": 109, "label": "准备按钮" }
}
```

## 附录 A：JSON Schema（Draft-07）

该 Schema 描述文件结构与字段约束；配置相关的条件必填（第 5 节）、正则合法性、规则遮蔽、点位可达性需要生成器额外校验。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "warehouse-bot itemsorter points file",
  "description": "itemsorter 点位文件。配置相关的条件必填见生成规范第 5 节。",
  "type": "object",
  "additionalProperties": false,
  "required": ["collector", "minecart"],
  "properties": {
    "items": {
      "type": "array",
      "default": [],
      "items": { "$ref": "#/definitions/rule" }
    },
    "home": { "$ref": "#/definitions/point" },
    "trash": { "$ref": "#/definitions/point" },
    "collector": { "$ref": "#/definitions/point" },
    "minecart": { "$ref": "#/definitions/point" },
    "button": { "$ref": "#/definitions/blockPoint" },
    "ready": { "$ref": "#/definitions/readyPoint" },
    "readyButton": { "$ref": "#/definitions/blockPoint" }
  },
  "definitions": {
    "point": {
      "type": "object",
      "additionalProperties": false,
      "required": ["x", "y", "z", "yaw", "pitch"],
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "z": { "type": "number" },
        "yaw": { "type": "number" },
        "pitch": { "type": "number" },
        "label": { "type": "string" },
        "area": { "type": "string" },
        "side": { "type": "string" }
      }
    },
    "readyPoint": {
      "type": "object",
      "additionalProperties": false,
      "required": ["x", "y", "z"],
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "z": { "type": "number" },
        "yaw": { "type": "number", "default": 0 },
        "pitch": { "type": "number", "default": 0 },
        "label": { "type": "string" }
      }
    },
    "blockPoint": {
      "type": "object",
      "additionalProperties": false,
      "required": ["x", "y", "z"],
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "z": { "type": "number" },
        "label": { "type": "string" }
      }
    },
    "rule": {
      "type": "object",
      "additionalProperties": false,
      "required": ["match", "point"],
      "properties": {
        "weight": { "type": "integer", "default": 0 },
        "match": { "$ref": "#/definitions/match" },
        "point": { "$ref": "#/definitions/point" }
      }
    },
    "match": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": { "type": "string", "minLength": 1, "pattern": "\\S" },
        "nameRegex": { "type": "string", "minLength": 1 },
        "enchantments": {
          "type": "object",
          "minProperties": 1,
          "additionalProperties": { "type": "integer", "minimum": 1 }
        },
        "customName": { "type": "string", "minLength": 1, "pattern": "\\S" },
        "customNameRegex": { "type": "string", "minLength": 1 },
        "lore": { "type": "string", "minLength": 1, "pattern": "\\S" },
        "loreRegex": { "type": "string", "minLength": 1 },
        "potionId": { "type": "integer", "minimum": 0 },
        "effects": {
          "type": "array",
          "minItems": 1,
          "items": {
            "oneOf": [
              { "type": "string", "minLength": 1, "pattern": "\\S" },
              { "type": "integer", "minimum": 0 }
            ]
          }
        }
      },
      "anyOf": [
        { "required": ["name"] },
        { "required": ["nameRegex"] },
        { "required": ["enchantments"] },
        { "required": ["customName"] },
        { "required": ["customNameRegex"] },
        { "required": ["lore"] },
        { "required": ["loreRegex"] },
        { "required": ["potionId"] },
        { "required": ["effects"] }
      ],
      "not": {
        "anyOf": [
          { "required": ["name", "nameRegex"] },
          { "required": ["customName", "customNameRegex"] },
          { "required": ["lore", "loreRegex"] }
        ]
      }
    }
  }
}
```

## 附录 B：最小生成伪代码

```text
function generate(input):
  config = input.config
  assert input.points.collector != null
  assert input.points.minecart != null
  if config.homeMode == "walk":          assert input.points.home != null
  if config.acquireMode == "button":     assert input.points.button != null
  if config.readyAction.enabled:         assert input.points.ready != null
                                         assert input.points.readyButton != null

  if input.points.button != null and config.acquireMode == "button":
    horizontal = hypot(button.x - collector.x, button.z - collector.z)
    vertical   = abs(button.y - collector.y)
    assert horizontal <= 3 and vertical <= 2

  rules = input.rules ordered by intended priority
  for each rule:
    assert rule.match is non-empty
    assert not (name and nameRegex)
    assert not (customName and customNameRegex)
    assert not (lore and loreRegex)
    assert rule.match.enchantments is empty or all levels >= 1
    assert rule.match.effects is empty or non-empty array
    assert every regex compiles in JavaScript
    assert rule.point has x, y, z, yaw, pitch

  assert no duplicate match conditions
  assert no generic rule shadows a more specific rule

  output = {
    items: rules.map(toRule),
    home: points.home?,
    trash: points.trash?,
    collector: points.collector,
    minecart: points.minecart,
    button: points.button?,
    ready: points.ready?,
    readyButton: points.readyButton?
  }

  validateAgainstSchema(output)
  writeJsonAtomic(output, utf8WithoutBom, indent=2)
```
