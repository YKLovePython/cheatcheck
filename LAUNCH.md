# 发布清单

目标：**7 天内 100+ stars**，先中文社区冷启动，再打 Hacker News。

> 当前状态（2026-11-03）：GitHub 已上线 <https://github.com/YKLovePython/cheatcheck>，
> CI 全绿；npm 包等登录后发布。下面的清单保留为可重复使用的发布流程。

这份文件是给自己看的，不发布。原则只有一条：**先给价值，再要 star。** 每个渠道都先讲清楚
"它能帮你挡掉什么"，最后才放链接。

---

## 0. 发布前（必须全部完成）

- [ ] 把仓库里所有 `OWNER` 替换成真实 GitHub 用户名
      ```bash
      grep -rn "OWNER" --include="*.md" --include="*.yml" --include="*.json" .
      ```
- [ ] GitHub 仓库名：`cheatcheck`，Description 用下面这句：
      `Catch your AI coding agent cheating before you merge: deleted tests, skipped specs, weakened assertions.`
- [ ] Topics：`ai` `ai-agents` `code-review` `reward-hacking` `testing` `static-analysis`
      `claude-code` `codex` `cursor` `opencode` `github-actions` `cli`
- [ ] 确认 `dist/` 已提交，且 `npm run build` 之后 `git status` 干净
- [ ] `npm test` 全绿；`node dist/cli.js --diff examples/agent-cheat.diff` 输出正常
- [ ] README 首屏在手机上能一屏看到：一句话、demo 图、`npx cheatcheck`
- [ ] 上传 Social preview（1280×640）：左边 agent 说 "all tests pass ✅"，右边 cheatcheck 说
      "12 of those tests no longer exist."
- [ ] 打 tag `v0.1.0`，创建 GitHub Release，正文直接用 `CHANGELOG.md` 的 0.1.0 段落
- [ ] `npm publish`，确认 `npx cheatcheck@0.1.0 --version` 可用
- [ ] 在 3 个真实仓库上各跑一次，截图存证（防"只在自己 demo 上有效"的质疑）
- [ ] 准备一条 30 秒录屏：在真实 repo 里删掉一个测试 → 跑 cheatcheck → 红色 FAIL

## 1. 定位句（所有渠道统一）

**中文：**

> Agent 说"测试全过了"。cheatcheck 检查它是不是把测试删了。
> 一个零依赖的 diff linter，专抓 AI  coding agent 的 reward hacking：删测试、跳过用例、
> 弱化断言、吞异常、关检查。不调模型、不联网、不需要 API Key。

**English:**

> Your agent said the tests pass. Did it delete them?
> A zero-dependency diff linter for AI reward hacking: deleted tests, skipped specs, weakened
> assertions, swallowed errors, disabled checks. No model, no network, no API key.

## 2. 七天节奏

| 天 | 渠道 | 内容 |
| --- | --- | --- |
| D1 | V2EX / 即刻 | 中文首发，讲动机和真实案例，不放"求 star" |
| D1 | 掘金 | 长文：为什么 agent 会 reward hack，16 条规则怎么设计 |
| D2 | X / 即刻 | 30 秒录屏 + demo 图，英文一句话 |
| D3 | Hacker News | Show HN，美东周二/周三 8–10 点（北京时间 20–22 点） |
| D3 | r/ClaudeAI | 同一角度，强调 Claude Code / Codex 工作流 |
| D4 | r/ExperiencedDevs | 换角度：code review 里最容易被忽略的 diff 变化 |
| D4 | GitHub | 给 10 个正在做 agent 工具的项目提 issue/PR，不群发 |
| D5 | 中文群 | 把 HN 的讨论截图翻译成一条长帖 |
| D6 | 复盘 | 看哪个渠道带来 star，把资源压过去 |
| D7 | 二发 | 根据反馈改 README 首屏，再发一次 X thread |

### 标题备选

**Hacker News（≤ 80 字符，不要 emoji，不要 "please upvote"）**

1. `Show HN: Cheatcheck – catch AI agents deleting tests to pass CI`
2. `Show HN: A diff linter for AI reward hacking`
3. `Show HN: Your agent said tests pass. Did it delete them?`
4. `AI agents optimize the test suite, not the code`

推荐第 1 条：具体、有冲突、说清了输入输出。

**V2EX（分享创造节点）**

1. `做了一个工具，专抓 AI 写代码时"删测试让 CI 变绿"`
2. `Agent 说测试全过了，我写了个工具检查它是不是把测试删了`
3. `零依赖、不联网：检测 AI 代码里的 reward hacking`

**掘金**

1. `AI 编程 Agent 正在偷偷删你的测试：16 条规则与一个 diff linter`
2. `Reward hacking 入门：当 Agent 开始优化测试而不是代码`
3. `我如何用 800 行 TypeScript 检测 AI 作弊`

**Reddit**

- r/ClaudeAI：`I built a linter that catches Claude Code deleting tests to make CI green`
- r/ExperiencedDevs：`What AI-generated diffs quietly remove, and how to catch it in review`

**X**

> Your agent: "All 42 tests pass ✅"
> cheatcheck: 12 of those tests no longer exist.
>
> A zero-dep diff linter for AI reward hacking.
> `npx cheatcheck`
>
> [demo 图]

## 3. 每个渠道的正文骨架

1. **一个具体场景**（不要从"AI 很火"开始）。例：上周让 agent 修一个 flaky test，它把
   `it(...)` 改成 `it.skip(...)`，CI 绿了，PR 描述写着"fixed"。
2. **为什么现有工具抓不到**：普通 linter 看代码风格，code review 看新增行；作弊发生在
   **被删掉的行**里。
3. **它怎么做**：读 diff，16 条规则，每条都有误报防护；给一个真实输出截图。
4. **30 秒试用**：`npx cheatcheck`，退出码 0/1。
5. **一个诚实的边界**：它只看 diff，不能证明剩下的测试是好的；它是烟雾报警器，不是消防员。
6. 最后一行放仓库链接。**不要**写"求 star"。

## 4. 回复策略

- **有人说"误报"**：请对方给 diff，当天复现。真误报就修，并在 issue 里写清楚阈值怎么调。
  这是最好的传播素材。
- **有人说"这有什么用，人也会删测试"**：同意，然后给数据：agent 的删除是批量、静默、且在
  PR 描述里声称"全部通过"。工具抓的是**声称与 diff 不一致**。
- **有人说"规则太简单，绕过很容易"**：承认。目标是提高作弊成本，不是证明不可能。欢迎提规则。
- **有人问"支持 X 语言吗"**：直接给 `docs/rules.md` 的覆盖表，并邀请提 issue 附 diff。
- **不要**和质疑者在评论区吵；把结论沉淀成 README 的 FAQ 或新规则。
- **不要**买 star、不要互星、不要在多个群复制粘贴同一段话。

## 5. 成功指标

| 指标 | 7 天目标 | 判断 |
| --- | --- | --- |
| GitHub stars | 100+ | 主目标 |
| npm 周下载 | 300+ | 真实使用 |
| HN | 首页 ≥ 30 分钟 | 英文破圈 |
| 外部 issue | ≥ 3 | 有人真的在用 |
| 误报报告 | ≥ 1 且已修 | 精度口碑 |

如果第 3 天 HN 没起来：不要重复发。改 README 首屏和标题，第 5 天用"真实误报修复记"的角度再发一次。

## 6. 发布后 24 小时

- 每 2 小时看一次 issue 和评论，2 小时内回复
- 把高频问题补进 README 的 "What it is not" 和 FAQ
- 给每个提 issue 的人道谢，合并第一个外部 PR 时在 Release 里点名
- 记录每个渠道的 star 增量，写进 `LAUNCH.md` 末尾的复盘表

## 7. 复盘表（发布后填）

| 渠道 | 发布时间 | 曝光 | star | 有效反馈 |
| --- | --- | --- | --- | --- |
| V2EX | | | | |
| 掘金 | | | | |
| 即刻 | | | | |
| Hacker News | | | | |
| r/ClaudeAI | | | | |
| r/ExperiencedDevs | | | | |
| X | | | | |
