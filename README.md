这是自动升级

> **⚠️ 重要：部署后请将兼容日期设置为 `2026-01-20`**
>
> **Pages 部署：**
> 1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)
> 2. 进入 **Workers 和 Pages** → 选择你的 Pages 项目
> 3. 点击 **设置** → **运行时**
> 4. 找到 **兼容性日期**，选择 `2026-01-20`，点击 **保存**
> 5. 返回 **部署** → 对最新一次部署点 **重试部署**，让新日期生效
>
> **Worker 部署：**
> 1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)
> 2. 进入 **Workers 和 Pages** → 选择你的 Worker
> 3. 点击 **设置** → **运行时**
> 4. 找到 **兼容性日期**，选择 `2026-01-20`，点击 **保存**
>
> 这个设置只用改一次，之后每天的自动同步不会动它。

---

## 界面

本仓库在同步上游的同时，会自动把界面重新套用为**现代深色控制台**风格，并带**深色 / 浅色主题切换**。

- 设计系统：`design-system/cfnew/MASTER.md`
- 构建系统与维护手册：`ui/README.md`
- 深浅两套色板文本对比度均满足 WCAG AA（≥ 4.5:1）

`_worker.js` 是**生成物**，不要手工编辑。界面改动请改 `ui/src/` 下的源文件，
再跑 `node ui/build.mjs`。

### 自动同步是怎么工作的

```
每天 0 点（UTC）
   ↓
检查上游 byJoey/cfnew 最新 release
   ↓
版本有变化？──否──→ 结束（不做任何事）
   │是
   ↓
下载 Pages.zip 并解压（_worker.js 变成上游纯净版）
   ↓
node ui/build.mjs      ← 重新套用界面
   ↓
node ui/validate.mjs   ← 契约校验（安全阀）
   ↓
通过？──否──→ 失败退出，【不提交】，仓库停留在上一个可用版本
   │是
   ↓
写 VERSION.txt → commit → push
```

### 上游新增字段时会怎样

`ui/src/body.html` 是整体替换上游设置页标记的。若上游新增了字段而 `body.html` 里没有，
页面 JS 会找不到元素。这种情况下**校验会失败并拒绝提交**，GitHub 会给你发失败通知，
报告里会精确列出缺失的元素 id，以及该往哪里加。

修复：把上游那段新字段的标记照抄进 `ui/src/body.html`（用现有的语义类，不要写内联样式），
本地跑 `node ui/validate.mjs` 确认通过后提交，再到 Actions 页面手动重跑工作流。

详细步骤见 `ui/README.md`。
