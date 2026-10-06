# CFnew Console — 设计系统 (MASTER)

> 目标：把 CFnew v3.1 的界面从「赛博朋克霓虹风」升级为专业、克制的现代网络控制台。
> 硬约束：**页面内容一字不改**，所有元素 ID / class 名 / JS 交互逻辑保持可用。

## 1. 设计基调

- 风格：现代深色控制台 + 玻璃拟态（Glassmorphism），去霓虹、去切角、去故障字
- 双主题：`data-theme="dark"`（默认）/ `data-theme="light"`，右上角切换，`localStorage.cp-theme` 持久化
- 密度：标准（8-32px 间距刻度，表单密集场景）
- 动效：克制（150-260ms，仅 hover/focus/入场，尊重 `prefers-reduced-motion`）

## 2. 色彩令牌

### 深色（默认）
```
--bg:          #0B1120    页面底色（深蓝灰，非纯黑）
--bg-grad-1:   #0F172A    背景渐变
--bg-grad-2:   #111C33
--surface:     #131C2E    卡片
--surface-2:   #1A2537    卡片内嵌块 / 输入框
--surface-3:   #223047    hover 态
--border:      #26344B    常规描边
--border-str:  #33445F    强调描边
--text:        #E8EEF7    主文本
--text-mut:    #97A6BC    次要文本
--text-dim:    #6B7C94    辅助/占位
--accent:      #3B82F6    主色（蓝）
--accent-2:    #2563EB    主色深
--accent-soft: rgba(59,130,246,.14)
--ok:          #22C55E
--warn:        #F59E0B
--err:         #EF4444
--info:        #38BDF8
```

### 浅色
```
--bg:          #F5F7FB
--surface:     #FFFFFF
--surface-2:   #F1F5F9
--surface-3:   #E7EDF5
--border:      #DCE3ED
--border-str:  #C3CEE0
--text:        #0F1B2D
--text-mut:    #4A5A72
--text-dim:    #6B7C94
--accent:      #2563EB
--accent-soft: rgba(37,99,235,.10)
--ok:          #15803D
--warn:        #B45309
--err:         #DC2626
--info:        #0369A1
```

对比度：主文本对底色 ≥ 12:1，次要文本 ≥ 5.5:1，均满足 WCAG AA 4.5:1。

## 3. 字体

- 正文 / UI：`-apple-system, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`
- 等宽（仅代码/URL/UUID/IP 等数据）：`"JetBrains Mono", ui-monospace, "SF Mono", Consolas, monospace`
- 基准 16px，正文行高 1.6；标题 600-700 字重，不再全大写、不再宽字距

## 4. 间距与圆角

```
--r-sm: 8px   --r-md: 12px   --r-lg: 16px   --r-xl: 20px
--sp-1: 4px  --sp-2: 8px  --sp-3: 12px  --sp-4: 16px  --sp-5: 24px  --sp-6: 32px  --sp-7: 48px
```

## 5. 组件规范

- **卡片**：`--surface` + 1px `--border` + `--r-lg`，阴影极轻；hover 不位移
- **按钮**：主按钮实心 `--accent`；次要按钮描边；危险按钮 `--err` 描边；统一 `--r-sm`，最小高度 40px（触控 44px 用于移动端）
- **输入/下拉**：`--surface-2` 底 + `--border` 描边，focus 时 2px `--accent` 环（`outline-offset:2px`）
- **开关（checkbox）**：替换为原生可用 + accent-color 着色，尺寸 18px，标签整块可点
- **Toast**：左下/右下浮动卡片，左侧 3px 语义色条，不再是霓虹发光框
- **底部操作栏**：玻璃拟态浮动条（`backdrop-filter: blur(16px)`）
- **状态徽标**：pill 形，语义色 soft 底 + 同色文字

## 6. 反模式（本次要消除的）

- ❌ 霓虹发光 `text-shadow: 0 0 8px`   → ✅ 无发光，用字重与色彩分层
- ❌ `clip-path` 多边形切角       → ✅ 统一圆角
- ❌ 矩阵雨 / 扫描线 / 故障字      → ✅ 静态柔和径向光晕 + 网格，可一键关闭
- ❌ 正文也用等宽字体全大写        → ✅ 无衬线正文，仅数据用等宽
- ❌ 内容里硬编码 `#00f0ff` 内联样式 → ✅ 语义 class

## 7. 交付前检查表

- [ ] 无 emoji 当图标（使用内联 SVG）
- [ ] 可点击元素 `cursor: pointer`
- [ ] hover/focus 过渡 150-300ms
- [ ] 深浅两主题文本对比度 ≥ 4.5:1
- [ ] 键盘焦点可见
- [ ] 尊重 `prefers-reduced-motion`
- [ ] 响应式：375 / 768 / 1024 / 1440