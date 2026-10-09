# UI 构建系统

这个目录把「重设计后的界面」以**可移植、可复现**的方式保存在仓库里。
`_worker.js` 是**生成物**，不要手工编辑——每次上游同步后都会由本目录的脚本重新生成。

## 为什么需要它

仓库的 GitHub Action 每 6 小时从上游 `byJoey/cfnew` 拉取最新 `Pages.zip`，解压后
会**直接覆盖 `_worker.js`**。如果不做处理，上游一发新版，重设计的界面就全没了。

现在的流程是：拉上游 → **构建（重新套用 UI）** → **校验** → 通过才提交。
所以既能自动跟进上游版本，界面又不会被冲掉。

## 目录结构

```
ui/
├─ build.mjs              构建脚本（可移植、幂等）
├─ validate.mjs           契约校验（安全阀）
├─ patch.mjs              页面 JS 补丁应用器
├─ patches/               页面 JS 补丁（每个 bug 一个声明式 JSON）
└─ src/
   ├─ tokens.css          设计令牌：深浅双主题色板、圆角、阴影
   ├─ terminal.css        终端 / 登录页样式
   ├─ settings-head.css   设置页样式 · 1-9 节（布局、卡片、HUD、特效开关）
   ├─ settings-mid.css    设置页样式 · 10-13 节（面板、表单、按钮、状态、结果列表）
   ├─ settings-normalize.css  JS 动态生成元素的样式归一化
   ├─ settings-tail.css   设置页样式 · 14-22 节（滚动条、浮动操作栏、Toast、响应式）
   ├─ settings-addendum.css  补充响应式
   ├─ body.html           设置页标记（语义类版本）
   ├─ theme-shared.css    主题切换按钮样式
   ├─ theme-button.html   主题切换按钮标记
   ├─ theme-boot.html     防闪烁内联脚本（放在 <head>）
   ├─ theme.js            主题切换逻辑
   └─ topbar.css          固定顶部导航栏样式（最后加载，可覆盖页面默认值）
```

## 本地构建

```bash
# 就地重建仓库里的 _worker.js（对已构建的文件也安全，幂等）
node ui/build.mjs

# 指定输入输出
node ui/build.mjs --input upstream_worker.js --output _worker.js

# 校验
node ui/validate.mjs --upstream upstream_worker.js --built _worker.js
```

脚本没有任何第三方依赖，只用 Node 内置模块。Node 18+ 均可。

## 固定顶部导航栏

两个页面顶部都有一条固定的状态 / 导航栏：

```
[ SYS:: … NODE:: … LINK:: … ]        [LANG_][语言][FX][主题]
 左侧：状态读数（窄屏自动隐藏）        右侧：控制项，一行居右对齐
```

它是**构建时自动加上去的**：`build.mjs` 在 `<div class="cp-hud">` 前插入
`<nav class="cp-topbar">`，在主题按钮之后插入 `</nav>`。两个标记分别是
`<!--cp:topbar-open-->` / `<!--cp:topbar-close-->`，重建时先剥离再插入，保持幂等。

**原有标记没有被改动**：id、class、事件处理器一个没动，只是多了一层容器。

栏内四个控制项（`LANG_` 标签、语言下拉、FX 开关、主题开关）被强制统一为
**同一高度、同一垂直中线**，并靠右排成一行——这正是之前不对齐、大小不一的地方。

`topbar.css` 在样式表里排在最后，所以它能覆盖页面默认样式而不需要 `!important`。

实测（两页 × 1440 / 1024 / 768 / 375）：

- 控制项高度差 **0px**，垂直中线差 **0px**
- 右对齐间距 20px（移动端 12px）
- 无横向溢出、无内容遮挡、滚动时保持固定

## 构建做了什么

1. **剥离上一次的注入**：所有注入块都用 `<!--cp:name-->` / `<!--/cp:name-->` 包起来，
   重跑时先删掉再重新注入，因此**反复执行结果完全一致**（幂等）。
2. **替换两个页面的样式表**：按 `<style>` / `</style>` 标记定位，**不依赖行号**，
   上游改了行数也不受影响。
3. **替换设置页标记**：`<body>` 到 `<script>` 之间换成 `src/body.html`。
4. **注入主题切换**：防闪烁脚本进 `<head>`，按钮插在 `#cpFxToggle` 之后，逻辑脚本放 `</body>` 前。
5. **包裹顶部导航栏**：见上一节。
6. **绝不改动页面 JS**：两段页面脚本逐字节保留。

### 两条硬性约束

注入的内容会被拼进 Worker 的 JS 模板字符串，所以构建前会检查：

- 不含反引号 ` \` ` —— 否则会提前结束模板字符串，整个 Worker 报废。
- 不含 `${` —— 否则会被**服务端求值**（只有 `body.html` 例外，那里的 `${...}` 是页面自己的模板占位符）。

违反任一条，构建直接报错退出。

## 页面 JS 补丁（受控修改）

页面逻辑默认**一字不改**。但有些 bug 确实就在页面逻辑里，必须能修 —— 所以引入受控补丁。

每个补丁是 `ui/patches/` 下的一个 JSON：

```json
{
  "name": "latency-render-failures",
  "target": "settings",
  "description": "失败/超时的结果也渲染出来",
  "find": "……上游原文（必须逐字节匹配且唯一）……",
  "replace": "……替换后的代码……",
  "appliedWhen": "……一段只可能出现在已应用结果里的标记……"
}
```

- `target`：`settings` / `terminal`；校验时只对该页生效
- `find` 匹配 0 次且 `appliedWhen` 也不在 → **构建直接报错**（上游改了这段代码，补丁需要更新，而不是静默失效）
- `find` 匹配 0 次但 `appliedWhen` 在 → 视为已应用，跳过（保证幂等）
- `find` 匹配 ≥2 次 → 报错（要求唯一）

### 为什么这样是安全的

`validate.mjs` 会**独立重算**期望值：`上游页面 JS + 该页补丁`，再与产物逐字节比对。所以：

- 任何**未声明**的页面逻辑改动 → 校验失败，拒绝提交
- 补丁只作用于声明的那一页，不会误伤另一页
- 补丁失效（上游改掉对应代码）→ 构建阶段就报错

### 现有补丁

| 补丁 | 作用 |
|---|---|
| `001-latency-render-failures` | 延迟测试：失败/超时的结果也列出来（置灰 + 禁用勾选 + 显示失败原因） |
| `002-add-buttons-empty-feedback` | 覆盖/追加添加：勾选项里没有成功结果时给出提示，而不是静默返回 |

### 新增一个补丁

1. 从上游文件或产物里**复制原文**，确保逐字节一致
2. 写进 `ui/patches/NNN-name.json`；`replace` 里不能出现反引号（会截断 Worker 的模板字符串）
3. `${...}` 在这里是**合法**的 —— Worker 会在服务端求值，这正是页面做中/波斯语 i18n 的方式
4. 跑 `node ui/build.mjs` 和 `node ui/validate.mjs` 确认通过

## 安全阀（重要）

`validate.mjs` 是自动升级不推坏版本的关键。它会检查：

| 检查 | 级别 | 说明 |
|---|---|---|
| 产物语法合法 | 致命 | `node --check` |
| 页面 JS 逐字节未变 | 致命 | 构建绝不能改逻辑 |
| JS 用到的 id 在标记里存在 | 致命 | 变量确实被使用才算致命 |
| **上游的元素没被丢掉** | 致命 | ← 新增字段就靠这条拦住 |
| 上游的内联事件没被丢掉 | 致命 | |
| 标记里用到的 class 都有样式 | 致命 | |
| 主题注入恰好各 2 处 | 致命 | 防止重复注入 |
| **顶部栏包裹四个控制项** | 致命 | 每页恰好一个 `<nav class="cp-topbar">`，且四个控制项确实在栏内 |
| 顶部栏样式存在 | 致命 | 两页样式表都必须有 `.cp-topbar` 且 `position: fixed` |

### 上游新增字段时会发生什么

`src/body.html` 是**整体替换**上游设置页标记的。如果上游新增了一个字段
（例如 `<input id="newField">`），而 `body.html` 里没有它，页面 JS 就会找不到元素。

这种情况下校验会**失败**并打印：

```
FAILED (1) - refusing to publish this build
  x upstream elements missing from the rebuilt markup (1):
        #newField
      Add these elements to ui/src/body.html, then re-run the workflow.
```

此时工作流**不会提交任何东西**，仓库继续停留在上一个可用版本，GitHub 会给你发失败通知。

### 修复步骤

1. 看 Action 的 Summary，里面有完整报告和缺失的 id 列表
2. 跑一次 `node ui/build.mjs --input <上游原始文件> --output /tmp/x.js`，
   并把上游那段新字段的标记照抄进 `ui/src/body.html`（用已有的语义类，别写内联样式）
3. 本地跑 `node ui/validate.mjs --upstream <上游原始文件> --built <构建产物>` 直到通过
4. 提交，然后到 Actions 页面手动重跑工作流

### 已知无害告警

```
! settings page: 1 dead lookup(s) - assigned from getElementById but never read: cfStatus
```

上游代码里有 `const 云墙状态 = document.getElementById('cfStatus')`，但 `云墙状态`
之后再也没被用过，标记里也没有 `#cfStatus`。这是上游的**死代码**，无任何功能影响。
校验会把它识别为「死引用」只给警告。

## 两个工作流

| 工作流 | 触发 | 作用 |
|---|---|---|
| `sync-from-cfnew.yml` | 每 6 小时 / 手动 | 拉上游 → 构建 → 校验 → 通过才提交 |
| `ui-check.yml` | 推送或 PR 触及 `ui/**` 或 `_worker.js` | 立刻校验，不必等 6 小时 |

`ui-check.yml` 做两件事：

1. **产物漂移检查**：用提交的 `_worker.js` 重新构建一遍，产物必须逐字节一致。
   不一致说明有人手工改了生成物，或者改了 `ui/src/` 却忘了重新构建。
2. **契约校验**：和同步流程用的是同一个 `validate.mjs`。

## 设计与无障碍基线

- 完整设计系统见 `design-system/cfnew/MASTER.md`
- 深浅两套色板的文本对比度**全部 ≥ 4.5:1**（WCAG AA）
- 全部动效遵守 `prefers-reduced-motion`
- 断点 375 / 768 / 1024 / 1440 均无横向溢出
- 交互目标高度 ≥ 34px，移动端表单控件 ≥ 44px

## 主题皮肤

`<html data-theme="dark|light">` 控制，默认深色。切换按钮写在 `theme.js` 里，
选择持久化到 `localStorage['cp-theme']`。按钮文案会跟随 `documentElement.lang`
在中文和波斯语之间自动切换。
