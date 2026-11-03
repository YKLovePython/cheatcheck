# Rules

`cheatcheck` ships 16 rules. Severity sets the verdict colour, weight sets the score deduction.

Every rule is a pure function of the parsed diff. No rule reads the filesystem, runs a command, or
calls a model.

Text patterns are matched against code, not data: quoted string contents are stripped before looking
for comments or calls, and documentation, snapshots and generated assets are skipped. A README that
mentions `@ts-nocheck` does not trigger `checks-disabled`.

| id | severity | weight | 中文 |
| --- | --- | --- | --- |
| [`test-deleted`](#test-deleted) | critical | 30 | 测试被删除 |
| [`test-file-deleted`](#test-file-deleted) | critical | 30 | 测试文件被删除 |
| [`test-skipped`](#test-skipped) | critical | 25 | 测试被跳过 |
| [`test-ignored`](#test-ignored) | critical | 25 | 测试被排除在运行之外 |
| [`mock-under-test`](#mock-under-test) | critical | 25 | 被测模块被 mock |
| [`assertions-removed`](#assertions-removed) | high | 18 | 断言被删除 |
| [`assertion-weakened`](#assertion-weakened) | high | 20 | 断言被弱化 |
| [`error-swallowed`](#error-swallowed) | high | 18 | 异常被吞掉 |
| [`checks-disabled`](#checks-disabled) | high | 15 | 检查被关闭 |
| [`config-loosened`](#config-loosened) | high | 15 | 配置被放宽 |
| [`snapshot-blast`](#snapshot-blast) | high | 15 | 快照被批量重生成 |
| [`lint-suppressed`](#lint-suppressed) | medium | 8 | lint 被抑制 |
| [`stub-implementation`](#stub-implementation) | medium | 12 | 桩实现 |
| [`mock-inflation`](#mock-inflation) | medium | 10 | 大量 mock |
| [`test-ratio`](#test-ratio) | medium | 8 | 大幅改动，测试没动 |
| [`type-escape`](#type-escape) | low | 4 | 类型逃逸 |

---

## test-deleted

**Critical.** Counts test declarations removed from a modified test file, subtracts the ones added,
and reports a positive net loss.

Recognises `it()`, `test()`, `specify()`, `def test_*`, `func Test*`, `#[test]`, `@Test`,
`[Fact]` / `[Theory]`, RSpec `it "…"`.

**Not triggered by:** renames (one removed, one added), or files deleted entirely
(that is `test-file-deleted`).

**Fix:** restore the test, or explain in the PR why it no longer applies.

## test-file-deleted

**Critical.** A test file is gone and no surviving test file has the same basename, so it was not a
rename.

**Not triggered by:** `git mv old.test.ts new.test.ts` without content changes.

## test-skipped

**Critical.** A new line disables a test while leaving it in place:

```js
it.skip('rejects an expired token', …)
it.only('accepts a valid token', …)   // silently disables every other test in the file
xit('…'), xdescribe('…'), fit('…')
```

Python: `@pytest.mark.skip`, `@pytest.mark.skipif`, `@pytest.mark.xfail`, `pytest.skip()`,
`@unittest.skip`. Go: `t.Skip()`. Rust: `#[ignore]`. Java/Kotlin: `@Ignore`, `@Disabled`.

**Fix:** delete the test honestly, or make it pass.

## test-ignored

**Critical.** The tests are still there, but the diff stops them from running:

- a new `.gitignore` / `.eslintignore` / `.prettierignore` line matching test paths or snapshots
- a new `testPathIgnorePatterns`, `testMatch` or `testRegex` in `jest.config` / `vitest.config`

## mock-under-test

**Critical.** A test mocks the module it is supposed to verify:

```ts
// src/auth/token.test.ts
vi.mock('./token', () => ({ verifyToken: vi.fn() }));
```

At that point the test asserts on the mock, and the mock always passes.

**Not triggered by:** mocking a dependency (`node:crypto`, `axios`, a sibling module).

## assertions-removed

**High.** The test still exists but asserts less. Fires when the net loss across the diff is two or
more assertion lines (`expect`, `assert`, `assertEqual`, `t.Error`, `require.*`).

## assertion-weakened

**High.** A precise matcher was replaced by a vague one:

```diff
-  expect(parse('x')).toBe({ ok: false });
+  expect(parse('x')).toBeTruthy();
```

Vague matchers: `toBeTruthy`, `toBeFalsy`, `toBeDefined`, `toBeUndefined`, `toBeNull`,
`expect.anything()`, `assertTrue`, `assertIsNotNone`.

## error-swallowed

**High.** New code catches an error and does nothing:

```ts
} catch (err) {}
} catch (err) { /* ignore */ }
```

```py
except Exception:
    pass
```

Also `.catch(() => {})`.

**Not triggered by:** a `catch` that rethrows, logs, or returns a result.

## checks-disabled

**High.** A blanket suppression with no reason:

- `// @ts-nocheck` at the top of a file
- `/* eslint-disable */` with no rule list
- `# type: ignore` with no error code
- `# noqa` with no code, `# pylint: disable` with no rule, `//nolint` with no rule
- `#![allow(...)]`, `/* istanbul ignore file */`

**Not triggered by:** any suppression followed by a reason of 12+ characters, e.g.
`// eslint-disable-next-line no-console -- the CLI prints progress to stderr on purpose`.

## config-loosened

**High.** The project's own guardrails get relaxed in `package.json`, `tsconfig.json`, `pyproject.toml`,
jest/vitest config or a GitHub workflow:

```diff
-  "strict": true
+  "strict": false
```

Also: `skipLibCheck: true`, `--passWithNoTests`, `--forceExit`, `--no-verify`,
`continue-on-error: true`, `testPathIgnorePatterns`, `fail_under = 0`.

## snapshot-blast

**High.** A snapshot file (`__snapshots__/`, `snapshots/`, `*.snap`) gains 20+ lines and at least twice
as many additions as deletions — the shape of `jest -u` / `vitest -u`.

**Fix:** review the snapshot diff instead of regenerating it.

## lint-suppressed

**Medium.** A one-line suppression with no reason: `// @ts-ignore`, `// @ts-expect-error`,
`eslint-disable-next-line <rule>`, `# type: ignore[code]`, `# noqa: E501`.

Rule-specific and code-specific suppressions are still suppressions. They just cost less than a
blanket one.

## stub-implementation

**Medium.** Code written to look finished:

```ts
throw new Error('Not implemented');
// TODO: implement permission check
return null; // stub
```

```py
raise NotImplementedError
```

## mock-inflation

**Medium.** Three or more new mocks in one test file (`jest.mock`, `vi.mock`, `sinon.stub`, `@patch`,
`MagicMock`, `mocker.patch`, `nock`, `http.mock`). Usually means the integration was replaced by a
description of it.

## test-ratio

**Medium.** 150+ lines of implementation added while new test lines stay under 2% of that.

Lockfiles, generated directories, docs, binary assets and snapshots do not count as implementation.

## type-escape

**Low.** Three or more new `any` in production TypeScript (`as any`, `: any`, `any[]`).
