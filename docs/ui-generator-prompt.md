# A股量化策略回测终端（SaaS）— MVP UI 生成（迭代式）

> 适用于 Vercel v0、Lovable 等 AI 前端生成器的高质量提示词（Prompt）。
> 来源：`docs/prd.md` 与 `docs/front-end-spec.md`

---

## 一、项目上下文（Context）

- 高层目标（来自 PRD `docs/prd.md`）
  - 在 2 个月内交付 MVP，打通“编辑 → 回测 → 查看结果”的单人闭环。
  - 支持参数网格寻优（并发、早停、重试）。
  - 提供可解释的绩效可视化与最小策略管理/软计费占位。

- 技术栈（前端）
  - Next.js（App Router）+ TypeScript
  - UI 基座：Radix UI + Tailwind + shadcn/ui（已定稿）
  - 图表库：ECharts（已定稿）
  - 可达性：WCAG 2.2 AA 目标；深色模式优先（可切浅色）

- 关键 UX 约束（来自 `docs/front-end-spec.md`）
  - 首屏 2s 可见“结果页概要卡”+ 渐进加载曲线/明细
  - 状态驱动体验：“提交-状态-结果”作业卡统一交互
  - 响应式断点：Mobile(360–767), Tablet(768–1023), Desktop(1024–1439), Wide(≥1440)
  - 深色模式 Tokens 与动效 Tokens（Durations: 120/160/200/250ms；Easings: ease-out/in-out）

- 品牌与样式（若无企业规范，采用以下建议）
  - 颜色（深色优先）：Primary #1E90FF, Secondary #7C8A99, Accent #FFB020,
    Success #16A34A, Warning #F59E0B, Error #DC2626,
    Neutrals: Background #0B0F14, Surface #121821, Border #223041,
    Text Primary #E6EDF3, Text Secondary #A9B5C1
  - 字体：Inter（UI）+ JetBrains Mono（代码/参数/日志）
  - 栅格与间距：12 列；Spacing 4/8/12/16/20/24/32/40/48

---

## 二、可视化与信息架构（IA 摘要）

- 主导航：Dashboard/Jobs, Strategy Editor, Grid Optimization, Results, Settings, Health
- 关键页面：
  1) Strategy Editor + Submit（编辑与提交同屏、右侧作业卡）
  2) Backtest Result（结果页：Summary→Curve→Trades）
- 组件清单（首批）
  - MetricCard（指标卡），JobCard（作业卡），ChartPanel（ECharts 容器）
  - TradesTable（虚拟滚动），ParamsForm（参数表单），TopNList（优化 Top-N 榜单）

---

## 三、首轮任务范围（Strict Scope）

- 仅生成两个页面与必要组件的初版脚手架：Strategy Editor + Submit 与 Backtest Result。
- 仅在前端模拟数据与接口占位；不要接入真实后端。
- 仅创建新文件或修改本次涉及的页面/组件；不要重构其他与本任务无关的文件。

---

## 四、Structured Prompting Framework 指令

### A. High-Level Goal（高层目标）
- 目标：生成“Strategy Editor + Submit”与“Backtest Result”的响应式页面初版，
  包含核心组件与占位数据流，满足深色模式与可达性基线，并为后续真实 API 对接留好插口。

### B. Detailed, Step-by-Step Instructions（分步详细指令）
1. 基础工程与主题
   1.1 新建/更新全局主题（Tailwind + CSS Vars 或等效方案），包含颜色/字体/动效 Tokens。
   1.2 实现深/浅模式切换骨架；默认深色；确保文本/组件对比度满足 AA。
   1.3 全局布局：顶部主导航（见 IA），内容区最大宽度栅格；移动端折叠菜单。

2. 组件层（按模块创建）
   2.1 MetricCard
       - Props: { label: string, value: string|number, delta?: string, state?: 'loading'|'ready'|'error' }
       - 状态支持：loading 骨架、error 占位；深/浅主题样式；可键盘聚焦。
   2.2 JobCard
       - 展示 jobId、状态（queued/running/succeeded/failed/early-stopped）与操作位（重试/取消占位）。
       - ARIA：状态变更使用 aria-live=polite；按钮有可见标签与 aria-label。
   2.3 ChartPanel（ECharts 容器）
       - 封装主题/深色/tooltip/缩放；支持空数据/错误占位；触屏提供手势与固定信息卡。
       - Props: { option: EChartsOption, loading?: boolean, a11ySummary?: string }
   2.4 TradesTable（虚拟滚动）
       - 列：时间、方向、价格、盈亏（移动端仅显示关键列，提供“展开更多”）。
       - 可达性：列标题与排序状态可被 SR 朗读；Tab 键可导航。
   2.5 ParamsForm
       - 字段示例：开始时间、结束时间、频率、参数（key/value）；支持分组/校验/示例填充。
       - 状态：pristine/invalid/valid/submitting；错误消息与输入控件关联。
   2.6 TopNList（占位，当前轮可不渲染）

3. 页面 1：Strategy Editor + Submit（/editor）
   3.1 三栏布局（Desktop）：左（代码编辑占位/Monospace 区域）、中（ParamsForm）、右（JobCard）
       - Tablet：两栏（代码+参数；右侧 JobCard 抽屉）
       - Mobile：单列，JobCard 置底部抽屉
   3.2 交互流：
       - 点击 Submit：显示“提交成功占位 + jobId: mock-12345”，右侧 JobCard 更新状态。
       - 参数校验失败：表单内联错误与示例提示。
   3.3 无障碍与动效：
       - 焦点可见；Submit 成功触发 aria-live 提示；动效 150–200ms、transform/opacity 优先。

4. 页面 2：Backtest Result（/results/[jobId]）
   4.1 首屏 Summary（2s 内可见）：使用 3–4 个 MetricCard 显示收益/回撤/夏普等（mock 数据）
   4.2 渐进加载：
       - 延迟加载 ChartPanel（净值曲线，mock 数据）
       - 延迟加载 TradesTable（虚拟滚动，mock 数据）
   4.3 导出按钮占位（不实现真实导出）；移动端优先“概要卡 → 关键按钮 → 曲线 → 明细”
   4.4 无障碍与动效：同上；图表提供 a11ySummary 文本（如“本段净值+3.2%、最大回撤4.8%”）

5. 状态与数据占位
   5.1 使用本地 mock 数据与延时模拟（setTimeout 等）展示“loading→ready”过程。
   5.2 预留 API 占位（不真正调用）：/api/submit, /api/results/[jobId], /api/trades?jobId=xxx

6. 响应式与主题
   6.1 按断点实现布局切换与表格列隐藏/展开。
   6.2 深/浅模式一致；图表与表格遵循同一主题 Tokens。

7. 目录与文件（示例）
   - app/
     - editor/page.tsx（Strategy Editor + Submit）
     - results/[jobId]/page.tsx（Backtest Result）
   - components/
     - MetricCard.tsx, JobCard.tsx, ChartPanel.tsx, TradesTable.tsx, ParamsForm.tsx
   - lib/theme.ts（Tokens 与主题工具）
   - styles/globals.css（若使用 Tailwind/CSS 变量）
   - mock/（mock 数据与生成器）

### C. Code Examples, Data Structures & Constraints（示例与约束）
- 图表示例（ECharts option 结构）与 MetricCard/TradesTable 的 props 示例请内联小样例，确保可运行。
- 不要接入真实后端；所有 API 以 mock 模拟；为将来接入留接口。
- 动效仅使用 transform/opacity；尊重 prefers-reduced-motion。
- 可达性：键盘全覆盖、焦点环清晰、aria-live 用于状态变化。

### D. Define a Strict Scope（严格范围）
- 只创建上述页面与组件文件；不要修改其他无关页面/组件。
- 如需新增工具函数或样式，只能在 lib/ 与 styles/ 下新增。

---

## 五、输出要求（Output）
- 生成完整可运行的页面与组件代码片段（尽量简洁），以及必要的主题与 mock 示例。
- 提供“如何运行/验证要点”（包括无障碍与响应式的检查点）。
- 总结本次生成与后续迭代建议（下一步可生成：Grid Optimization 页面与 Jobs & History）。
- 提醒：AI 生成的代码需经人工审查与测试后方可用于生产环境。
