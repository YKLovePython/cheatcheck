# 发布文案（复制即用）

> 和 `LAUNCH.md` 配套：那份是节奏和渠道，这份是能直接贴出去的正文。
> 规则只有一条：**先讲问题，再讲工具，最后放链接。** 不要写"求 star"。

- GitHub：<https://github.com/YKLovePython/cheatcheck>
- npm：<https://www.npmjs.com/package/cheatcheck>
- 安装：`npx cheatcheck`

---

## 1. V2EX（分享创造）

**标题**

> cheatcheck：检查 AI 有没有为了"测试全绿"把测试删了

**正文**

最近半年我基本都在让 agent 写代码。它交付得很快，但有一种情况越来越常见：

> Agent：完成了，42 个测试全部通过 ✅
>
> 我：那 12 个测试呢？

它没有说谎。它只是把跑不过的测试删了、给不稳定的那个加了 `.skip`、把 `toBe(110)` 改成了
`toBeTruthy()`、用 `try { } catch { }` 把报错包了起来。CI 是绿的，功能是坏的，而 diff 看上去
就是一次普通的改动——因为破坏藏在"悄悄消失"的那几行里。

代码审查很难抓住这个，不是因为审查不认真，而是因为人的注意力天然落在**新增**的代码上，
而这些作弊几乎都发生在**删除**和**弱化**里。

所以我写了个小工具 `cheatcheck`。它读一遍 git diff，只回答一个问题：这次改动里，有多少是
在让检查变绿，而不是让功能变对。

```bash
npx cheatcheck                 # 未提交的改动
npx cheatcheck --staged        # 暂存区，适合 pre-commit
npx cheatcheck --base origin/main   # 整个分支，适合 CI
npx cheatcheck --diff fix.patch     # 别人发来的补丁
```

它检查 16 件事，全部基于 diff 的新增/删除行：

- 测试数量净减少、测试文件被删
- 新增 `.skip` / `.only` / `xit` / `@pytest.mark.skip` / `t.Skip` / `#[ignore]`
- 断言净减少，或者 `toBe` 被换成 `toBeTruthy` / `toBeDefined`
- 空的 `catch {}`、`except: pass`、`.catch(() => {})`
- 没写理由的 `@ts-nocheck`、`eslint-disable`、`# type: ignore`
- `"strict": false`、`skipLibCheck`、`--passWithNoTests`、`continue-on-error: true`
- 快照被单方向大量重写
- `not implemented`、`TODO: implement`
- 150 行以上实现，测试几乎没动

输出一个 0–100 的信任分，出现严重问题直接封顶 39。干净退出码 0，有问题 1。

**几个刻意的取舍：**

1. **有理由的抑制不算问题。** `// eslint-disable-next-line no-console -- CLI 就是要往 stderr 打`
   是正常工程；光秃秃的 `@ts-nocheck` 才是举白旗。只报后者。
2. **同一规则按次汇总。** 一条规则在五个文件里出现，是一个问题，不是五个。
3. **用真实仓库做回归。** 我拿 `chalk`、`trpc`、`vitest`、`hono`、`got`、`slugify`、`p-limit`
   的最新 commit 各跑了一遍，全部 100 分。这个仓库自己的 diff 也是 100 分。
4. **不调模型、不联网、不需要 API Key，零运行时依赖。** 它就是一把尺子，不是另一个审查员。

**它做不到什么：** 静态分析读不懂动机。它不知道某个测试为什么被删，也无法证明剩下的测试是
好测试。它是烟雾报警器，不是火灾调查员——只是把那些通常值得看两分钟的几行挑出来。

```bash
npx cheatcheck
```

如果它帮你拦下过一次"全绿但什么都没测"的提交，点个 star 能让更多人看到。

<https://github.com/YKLovePython/cheatcheck>

---

## 2. 掘金（长文）

**标题**

> Agent 优化的不是代码，是测试套件：我写了 16 条规则来抓 reward hacking

**结构**

1. **开头（300 字）**：用第 1 节的"42 个测试"故事，直接给结论——agent 的奖励函数是 CI，不是产品。
2. **为什么会这样（600 字）**：模型在"让检查通过"这个目标上被训练得很好；删除一个失败的测试
   和修复一个 bug，在奖励上等价，但成本差 100 倍。列 5 种典型作弊手法，每种配一个真实 diff 片段。
3. **为什么 code review 抓不住（400 字）**：注意力偏向新增行；破坏是"缺失"而不是"存在"；
   大 diff 里没人会数断言个数。
4. **工具怎么做（800 字）**：diff 解析 → 规则 → 评分。重点讲三个工程决策：
   - 为什么按规则聚合而不是按文件（避免噪声淹没信号）
   - 为什么 critical 直接封顶 39（严重问题的分数不该被"其他都很好"平均掉）
   - 为什么抑制注释要区分"有理由"和"没理由"（精确性优先，误报比漏报更伤）
5. **实测（400 字）**：7 个真实仓库 100 分；故意构造的作弊 diff 39 分。贴终端输出截图。
6. **怎么接进 CI（300 字）**：GitHub Actions 片段，`--format github` 会输出原生注解。
7. **局限（200 字）**：读不懂动机、只看 diff、不能替代测试本身。
8. **结尾**：`npx cheatcheck`，仓库链接。

**配图**：`docs/demo.zh.svg`；再加一张"真实仓库 100 分"的终端截图。

---

## 3. X / Twitter（English thread）

**1/**

> Your agent said "all 42 tests pass ✅".
>
> 12 of those tests no longer exist.

**2/**

> This is reward hacking: the agent optimizes the check, not the code.
>
> Deleted tests, `.skip`, `toBeTruthy()` instead of `toBe(110)`, `catch {}`, `@ts-nocheck`.
>
> All green CI. All broken product.

**3/**

> I built `cheatcheck` to catch it.
>
> It reads a git diff and scores it 0–100. No model, no network, no API key, zero runtime deps.
>
> ```bash
> npx cheatcheck --base origin/main
> ```

**4/**

> 16 rules, all diff-based:
>
> · tests removed / skipped / excluded
> · assertions removed or weakened
> · errors swallowed
> · checks disabled without a reason
> · snapshots mass-regenerated
> · 150+ lines of code, no tests

**5/**

> Precision matters more than coverage here. A linter that cries wolf every day gets uninstalled.
>
> Verified against the latest commits of chalk, trpc, vitest, hono, got, slugify, p-limit — all 100/100.

**6/**

> `npx cheatcheck` → exit 0 if clean, 1 if suspicious.
>
> GitHub: https://github.com/YKLovePython/cheatcheck
> npm: https://www.npmjs.com/package/cheatcheck
>
> If it catches one "green but untested" commit for you, a ⭐ helps.

---

## 4. Show HN

**Title（≤ 80 chars）**

> Show HN: Cheatcheck – catch AI agents deleting tests to pass CI

**Text**

> I kept hitting the same failure mode with coding agents: the task comes back "done, all tests
> pass", and the diff is green — because a few failing tests were deleted, one got a `.skip`, and an
> exact assertion became `toBeTruthy()`.
>
> Code review misses this for a boring reason: reviewers read added lines, and the damage is in the
> removed ones.
>
> cheatcheck is a diff linter for that. It doesn't call a model, doesn't touch the network, needs no
> API key, and has zero runtime dependencies. It parses the diff, applies 16 rules (tests removed,
> specs skipped, assertions weakened, errors swallowed, checks disabled, snapshots blasted, stubs
> shipped), and prints a 0–100 trust score plus the exact lines responsible. Exit code is 0/1, so it
> drops into pre-commit or CI.
>
> ```bash
> npx cheatcheck --base origin/main
> ```
>
> The design choice I care most about is precision. Suppression comments with a stated reason are
> not flagged (`eslint-disable-next-line no-console -- CLI writes to stderr`); only bare
> `@ts-nocheck` is. Findings are aggregated per rule, not per file. And I regression-test it against
> the latest commits of chalk, trpc, vitest, hono, got, slugify and p-limit — all must stay at 100.
>
> It's a smoke alarm, not a fire investigator: it can't tell you *why* a test was deleted, and it
> only sees the diff in front of it.
>
> https://github.com/YKLovePython/cheatcheck

---

## 5. r/ClaudeAI / r/Codex / r/cursor

**Title**

> I got tired of agents deleting tests to make CI green, so I wrote a diff linter for it

**Body**

> Three times last month a Claude Code task ended with "all tests passing" and a diff where the
> failing tests were simply gone. Twice it was `.skip` instead. Once an exact assertion became
> `toBeTruthy()`.
>
> I don't think the model is lying — it's doing exactly what it was asked: make the check pass. The
> problem is that deleting a test and fixing a bug look identical to a green CI.
>
> So I built `cheatcheck` (open source, MIT). It reads the diff, applies 16 rules, and prints a
> 0–100 score with the offending lines:
>
> - tests removed / skipped / excluded from discovery
> - assertions removed, or `toBe(x)` → `toBeTruthy()`
> - empty `catch {}`, `except: pass`
> - `@ts-nocheck`, bare `eslint-disable`, `# type: ignore` with no reason
> - `"strict": false`, `skipLibCheck`, `--passWithNoTests`, `continue-on-error: true`
> - snapshots mass-rewritten in one direction
>
> ```bash
> npx cheatcheck            # uncommitted
> npx cheatcheck --staged   # pre-commit
> ```
>
> No model calls, no network, no API key, zero runtime deps. It's fast enough for a pre-commit hook.
>
> Caveat: it's static and dumb about intent. It flags "a test declaration disappeared", not "this
> was the right test to delete". Suppression comments with a written reason are ignored on purpose.
>
> Repo: https://github.com/YKLovePython/cheatcheck — feedback on false positives is the most useful
> thing you can send me.

---

## 6. 回复模板

**"这不就是又一个 AI code review 吗？"**

> 不是。它不调模型、不读整个仓库、不生成建议。它只做一件事：数这次 diff 里少了几个测试、
> 少了几个断言、多了几个没理由的抑制。规则是确定的，同样的 diff 永远同样的输出。

**"误报怎么办？"**

> 直接开 issue，附上 diff。精确性是第一优先级——有理由的抑制注释已经排除了，同一规则也按次
> 汇总。误报是 bug，不是让你去改配置的理由。

**"能抓到我改配置吗？"**

> 能抓 `"strict": false`、`skipLibCheck`、`--passWithNoTests`、`continue-on-error: true`、
> 新增的 testPathIgnorePatterns。抓不到的是"把测试写得很水但确实在跑"——那需要人看。
