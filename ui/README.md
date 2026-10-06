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
   └─ theme.js            主题切换逻辑
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

## 构建做了什么

1. **剥离上一次的注入**：所有注入块都用 `<!--cp:name-->` / `<!--/cp:name-->` 包起来，
   重跑时先删掉再重新注入，因此**反复执行结果完全一致**（幂等）。
2. **替换两个页面的样式表**：按 `<style>` / `</style>` 标记定位，**不依赖行号**，
   上游改了行数也不受影响。
3. **替换设置页标记**：`<body>` 到 `<script>` 之间换成 `src/body.html`。
4. **注入主题切换**：防闪烁脚本进 `<head>`，按钮插在 `#cpFxToggle` 之后，逻辑脚本放 `</body>` 前。
5. **绝不改动页面 JS**：两段页面脚本逐字节保留。

### 两条硬性约束

注入的内容会被拼进 Worker 的 JS 模板字符串，所以构建前会检查：

- 不含反引号 `` ` `` —— 否则会提前结束模板字符串，整个 Worker 报废。
- 不含 `${...}` —— 否则会被**服务端求值**（只有 `body.html` 例外，那里的 `${...}` 是页面自己的模板占位符）。

违反任一条，构建直接报错退出。

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
2. 跑一次 `node ui/build.mjs --input <上游原始文件> --output /tmp/x.js`
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
