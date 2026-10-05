#!/usr/bin/env node
'use strict';

// tdd-rig.js — build a throwaway C# project for exercising --tdd mode end to end.
//
//   node scripts/tdd-rig.js <target-dir>
//   node scripts/tdd-rig.js <target-dir> --no-install     (skip the harness install)
//
// WHY THIS EXISTS
//
// Nothing in this repo parses the task XML, so `--tdd` is instruction prose. The doc-consistency
// probe (skills/implement/__tests__/tdd-mode.probe.test.js) proves the twelve affected files agree
// with each other. It cannot prove an agent reading them behaves correctly, and it cannot prove the
// *signals* the executor is told to look for actually appear in real test-runner output.
//
// This rig closes both, in two layers:
//
//   Layer A — mechanical, no agents, repeatable.  `node traps/run-traps.js` inside the rig plants
//             each failure mode from tasks/tdd/findings.md D3 as real C# and runs real `dotnet
//             test`, asserting the signal the executor keys off is genuinely present. Proves the
//             contract is grounded in observable output rather than in what we imagined it to be.
//
//   Layer B — agent runs, by hand.  Install the harness into the rig, run `/implement --tdd 1`, and
//             confirm the plan ordered empty shell -> failing test -> real code, and that the
//             failing-test task passed by failing on an assertion.
//
// The project is C#, not Node, deliberately: the empty-shell step exists only because a compiled
// language will not build a test against a class that does not exist. A Node rig never exercises it.
//
// The rig itself is disposable and lives OUTSIDE this repo. This generator is what is committed, so
// the traps stay documented and anyone can rebuild it.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const TFM = 'net8.0';

const args = process.argv.slice(2);
const noInstall = args.includes('--no-install');
const target = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(REPO_ROOT, '..', 'claude-harness-tdd-rig'));

if (target.startsWith(REPO_ROOT + path.sep) || target === REPO_ROOT) {
  console.error(`Refusing to build the rig inside the harness repo.\n  target: ${target}\nPick a directory outside ${REPO_ROOT}.`);
  process.exit(1);
}

function write(rel, content) {
  const full = path.join(target, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\n/g, '\r\n'), 'utf8');
}

// ── The project under test ───────────────────────────────────────────────────
// Real code with real passing tests. "Good data" matters: agents behave differently in an empty
// scaffold than in a project with existing conventions to follow.

const FILES = {
  'src/Pricing/Pricing.csproj': `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>${TFM}</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
`,

  'src/Pricing/Basket.cs': `namespace Pricing;

public record BasketLine(string Sku, int Quantity, decimal UnitPrice);

public class Basket
{
    private readonly List<BasketLine> _lines = new();

    public IReadOnlyList<BasketLine> Lines => _lines;

    public void Add(string sku, int quantity, decimal unitPrice)
    {
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
        _lines.Add(new BasketLine(sku, quantity, unitPrice));
    }

    public decimal Subtotal() => _lines.Sum(l => l.Quantity * l.UnitPrice);
}
`,

  'src/Pricing/DiscountCalculator.cs': `namespace Pricing;

/// <summary>
/// Flat percentage discounts. Tiered discounts are not implemented yet — that is issue #1.
/// </summary>
public class DiscountCalculator
{
    public decimal ApplyFlat(decimal subtotal, decimal percent)
    {
        if (percent < 0 || percent > 100) throw new ArgumentOutOfRangeException(nameof(percent));
        // SEEDED DEFECT (issue #2). Rounding the discount and then subtracting it pushes an exact
        // half-cent the wrong way: 50% of 10.05 is 5.025, truncated to 5.02, leaving 5.03 - when
        // rounding the discounted total instead gives the correct 5.02. Chosen because the two
        // existing tests still pass (100.00 at 10% is 90.00 either way), so the bug is invisible
        // until the repro from issue #2 is written. The fix is to round once, at the end.
        var discount = Math.Round(subtotal * percent / 100m, 2, MidpointRounding.ToZero);
        return subtotal - discount;
    }
}
`,

  'tests/Pricing.Tests/Pricing.Tests.csproj': `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>${TFM}</TargetFramework>
    <Nullable>enable</Nullable>
    <!-- Required: trap files reference System types (ArgumentOutOfRangeException,
         NotImplementedException) without a using directive. -->
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="../../src/Pricing/Pricing.csproj" />
  </ItemGroup>
</Project>
`,

  'tests/Pricing.Tests/BasketTests.cs': `using Pricing;
using Xunit;

namespace Pricing.Tests;

public class BasketTests
{
    [Fact]
    public void Subtotal_MultipleLines_SumsQuantityTimesUnitPrice()
    {
        var basket = new Basket();
        basket.Add("APPLE", 3, 1.50m);
        basket.Add("PEAR", 2, 2.00m);

        Assert.Equal(8.50m, basket.Subtotal());
    }

    [Fact]
    public void Add_ZeroQuantity_Throws()
    {
        var basket = new Basket();
        Assert.Throws<ArgumentOutOfRangeException>(() => basket.Add("APPLE", 0, 1.50m));
    }
}
`,

  'tests/Pricing.Tests/DiscountCalculatorTests.cs': `using Pricing;
using Xunit;

namespace Pricing.Tests;

public class DiscountCalculatorTests
{
    [Fact]
    public void ApplyFlat_TenPercent_ReducesSubtotal()
    {
        var calc = new DiscountCalculator();
        Assert.Equal(90.00m, calc.ApplyFlat(100.00m, 10m));
    }

    [Fact]
    public void ApplyFlat_PercentAbove100_Throws()
    {
        var calc = new DiscountCalculator();
        Assert.Throws<ArgumentOutOfRangeException>(() => calc.ApplyFlat(100.00m, 101m));
    }
}
`,

  // ── Project conventions the harness reads ──────────────────────────────────
  'tasks/lessons.md': `# Lessons

## Build & Test Commands

- **Build:** \`dotnet build src/Pricing/Pricing.csproj\`
- **Build tests:** \`dotnet build tests/Pricing.Tests/Pricing.Tests.csproj\`
- **All tests:** \`dotnet test tests/Pricing.Tests/Pricing.Tests.csproj\`
- **One test:** \`dotnet test tests/Pricing.Tests/Pricing.Tests.csproj --filter "FullyQualifiedName~TheTestName"\`

Never pass \`--no-build\` to \`dotnet test\`. It reuses whatever was compiled last, so a test can pass
or fail against stale binaries — see trap 07.

## Code Conventions

- Namespace is \`Pricing\`; tests live in \`Pricing.Tests\`.
- Test names read \`Method_Scenario_ExpectedResult\`.
- xUnit, \`Assert.Equal(expected, actual)\` — expected first.
- Money is \`decimal\`, never \`double\`. Round with \`MidpointRounding.ToZero\`.
- Public methods validate their arguments and throw \`ArgumentOutOfRangeException\`.

## Test Framework

xUnit 2.9. \`[Fact]\` for single cases, \`[Theory]\` + \`[InlineData]\` for tables.
`,

  // ── Local tracker seed: one feature, one bug ───────────────────────────────
  'tasks/issues/1.md': `---
id: 1
title: Add tiered discounts to DiscountCalculator
state: open
type: Story
labels: [feature]
parent: null
created: 2026-09-01T09:00:00Z
closed: null
close_reason: null
---

\`DiscountCalculator\` only does flat percentages. We need tiered discounts based on the basket
subtotal:

- under 50.00 — no discount
- 50.00 to 199.99 — 5%
- 200.00 and above — 10%

Add \`decimal ApplyTiered(decimal subtotal)\`. Same rounding rule as \`ApplyFlat\`
(2 decimal places, \`MidpointRounding.ToZero\`).

Acceptance:
- a 49.99 subtotal is returned unchanged
- a 100.00 subtotal returns 95.00
- a 200.00 subtotal returns 180.00
- a negative subtotal throws \`ArgumentOutOfRangeException\`
`,

  'tasks/issues/2.md': `---
id: 2
title: ApplyFlat rounds up on exact half-cents
state: open
type: Bug
labels: [bug]
parent: null
created: 2026-09-01T09:05:00Z
closed: null
close_reason: null
---

\`ApplyFlat(10.05, 50)\` should give \`5.02\` (round toward zero) but the rounding mode is applied to
the wrong value in some cases, giving \`5.03\`.

This is a **bug**, so it must be planned test-first even without \`--tdd\` — write the failing test
that reproduces it first, then fix. Two steps, no empty-shell step: the code already exists.
`,
};

// ── Layer A: the traps ───────────────────────────────────────────────────────
// Each trap plants real C#, runs real `dotnet test`, and asserts the signal the executor is told to
// key off is actually present in the output. Numbering matches tasks/tdd/findings.md section 10 (D3).

const TRAPS_README = `# The traps

Fifteen ways a test written *before* its code can pass when it should have failed. Numbering matches
\`tasks/tdd/findings.md\` section 10 (D3) in the harness repo. Number 4 was a duplicate of 12 and is
not used.

\`node traps/run-traps.js\` runs every mechanically-checkable trap against real \`dotnet test\` and
asserts the signal is present. It needs no agents and no API calls.

The rest are marked "human" — they look identical from outside and are the ones the executor is
required to escalate with evidence rather than guess at.

| # | Trap | Layer A checks | Executor must |
|---|---|---|---|
| 1 | The feature already exists | — | ask, with the method body as evidence |
| 2 | Filter matched nothing | zero tests ran | FAIL, fix the filter |
| 3 | Test is subtly wrong | — | ask |
| 5 | Test file never saved | file absent | FAIL, retry |
| 6 | Test marked skip | runner reports skipped | FAIL, remove skip |
| 7 | Stale build | \`--no-build\` passes against old binaries | FAIL, rebuild clean |
| 8 | Verify hides the failure | exit 0 despite a failing test | rejected at planning |
| 9 | Asserts nothing real | passes without touching the method | FAIL, rewrite |
| 10 | Tests a mock, not our code | — | ask |
| 11 | Different class, same name | — | ask |
| 12 | Shell default matched the expectation | passes against \`NotImplementedException\`-free stub | FAIL, expect a value the shell cannot return |
| 13 | Throw treated as success | \`Assert.Throws<NotImplementedException>\` passes | FAIL, rewrite |
| 14 | Another agent built it mid-run | — (prevented: alone in its wave) | n/a |
| 15 | Leftover state from another test | passes in company, fails run alone | PASS, log the pollution |
| 16 | On only in test settings | — | ask |

Also checked: a **genuine** failing test (assertion failure — the one case that may report PASS) and
a **compile break** (which must never count as a failing test).
`;

const RUN_TRAPS = `#!/usr/bin/env node
'use strict';

// Plants each mechanically-checkable trap as real C#, runs real \`dotnet test\`, and asserts the
// signal the executor keys off is present. No agents, no API calls. Run from the rig root:
//
//   node traps/run-traps.js
//
// Every trap restores the tree afterwards, pass or fail.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS = path.join(ROOT, 'tests', 'Pricing.Tests');
const SRC = path.join(ROOT, 'src', 'Pricing');
const TEST_PROJ = path.join(TESTS, 'Pricing.Tests.csproj');

function dotnet(args) {
  const r = spawnSync('dotnet', args, { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function withFiles(files, fn) {
  const written = [];
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(ROOT, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
      written.push(full);
    }
    return fn();
  } finally {
    for (const f of written) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
  }
}

const results = [];
function trap(id, name, fn) {
  process.stdout.write(\`  \${String(id).padStart(2, '0')}  \${name} ... \`);
  try {
    const detail = fn();
    console.log('signal present' + (detail ? \` (\${detail})\` : ''));
    results.push({ id, name, ok: true });
  } catch (err) {
    console.log('NOT DETECTED');
    console.log(\`      \${err.message}\`);
    results.push({ id, name, ok: false, err: err.message });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// A stub that returns a plausible default — how trap 12 happens.
const STUB_DEFAULT = \`namespace Pricing;
public partial class TrapSubject
{
    public decimal Compute(decimal input) => 0m;
}
\`;

// A stub that throws — the correct empty shell.
const STUB_THROWS = \`namespace Pricing;
public partial class TrapSubject
{
    public decimal Compute(decimal input) => throw new NotImplementedException();
}
\`;

console.log('\\nRunning traps against real dotnet test\\n');

// Baseline: the suite must be green before any trap is planted.
trap(0, 'baseline suite is green', () => {
  const r = dotnet(['test', TEST_PROJ, '--nologo', '-v', 'quiet']);
  assert(r.code === 0, 'baseline suite is not green - fix the rig before trusting any trap');
  return 'green';
});

trap(2, 'filter matched nothing -> zero tests ran', () => {
  const r = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~NoSuchTestNameAnywhere']);
  const zero = /No test matches|Passed!\\s*-\\s*Failed:\\s*0,\\s*Passed:\\s*0|total:\\s*0/i.test(r.out);
  assert(zero, 'runner did not visibly report zero tests - executor cannot detect this trap from output');
  return 'runner reports no matching tests';
});

trap(6, 'test marked skip -> runner reports skipped', () => {
  const file = 'tests/Pricing.Tests/TrapSkipTests.cs';
  return withFiles({
    [file]: \`using Xunit;
namespace Pricing.Tests;
public class TrapSkipTests
{
    [Fact(Skip = "planted trap")]
    public void TrapSkip_AlwaysSkipped_NeverRuns() => Assert.True(false);
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapSkip_AlwaysSkipped_NeverRuns']);
    assert(/skipped/i.test(r.out), 'skip is not visible in runner output');
    assert(r.code === 0, 'expected a skipped test to exit clean, which is exactly why it is dangerous');
    return 'skipped, exit 0';
  });
});

trap(8, 'verify hides the failure -> exit 0 despite a real failure', () => {
  const file = 'tests/Pricing.Tests/TrapFailingTests.cs';
  return withFiles({
    [file]: \`using Xunit;
namespace Pricing.Tests;
public class TrapFailingTests
{
    [Fact]
    public void TrapFailing_Always_Fails() => Assert.Equal(1, 2);
}
\`,
  }, () => {
    const honest = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapFailing_Always_Fails']);
    assert(honest.code !== 0, 'a genuinely failing test did not produce a non-zero exit code');
    // The masking form the planner is forbidden from emitting.
    const masked = spawnSync('bash', ['-c', \`dotnet test "\${TEST_PROJ}" --nologo --filter "FullyQualifiedName~TrapFailing_Always_Fails" || true\`], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    assert(masked.status === 0, '|| true did not mask the failure - the prevention rule may be unnecessary here');
    return 'honest exit non-zero, masked exit 0';
  });
});

trap(9, 'asserts nothing real -> passes without touching the subject', () => {
  const file = 'tests/Pricing.Tests/TrapVacuousTests.cs';
  return withFiles({
    [file]: \`using Xunit;
namespace Pricing.Tests;
public class TrapVacuousTests
{
    [Fact]
    public void TrapVacuous_AssertsNothing_Passes() => Assert.True(true);
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapVacuous_AssertsNothing_Passes']);
    assert(r.code === 0, 'a vacuous test did not pass - trap could not be reproduced');
    return 'green while proving nothing';
  });
});

trap(12, 'shell default matches the expectation -> false green', () => {
  return withFiles({
    'src/Pricing/TrapSubject.cs': STUB_DEFAULT,
    'tests/Pricing.Tests/TrapDefaultTests.cs': \`using Pricing;
using Xunit;
namespace Pricing.Tests;
public class TrapDefaultTests
{
    [Fact]
    public void TrapDefault_EmptyBasket_ReturnsZero()
        => Assert.Equal(0m, new TrapSubject().Compute(123m));
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapDefault_EmptyBasket_ReturnsZero']);
    assert(r.code === 0, 'stub returning 0 did not satisfy a test expecting 0 - trap not reproduced');
    return 'stub returned 0m, test expected 0m, green';
  });
});

trap(13, 'throw treated as success -> false green against the correct shell', () => {
  return withFiles({
    'src/Pricing/TrapSubject.cs': STUB_THROWS,
    'tests/Pricing.Tests/TrapThrowTests.cs': \`using Pricing;
using Xunit;
namespace Pricing.Tests;
public class TrapThrowTests
{
    [Fact]
    public void TrapThrow_NotImplemented_IsTreatedAsSuccess()
        => Assert.Throws<NotImplementedException>(() => new TrapSubject().Compute(1m));
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapThrow_NotImplemented_IsTreatedAsSuccess']);
    assert(r.code === 0, 'asserting the shell throws did not pass - trap not reproduced');
    return 'asserts the shell, not the behaviour';
  });
});

trap(7, 'stale build -> --no-build passes against old binaries', () => {
  const testFile = 'tests/Pricing.Tests/TrapStaleTests.cs';
  return withFiles({
    [testFile]: \`using Xunit;
namespace Pricing.Tests;
public class TrapStaleTests
{
    [Fact]
    public void TrapStale_Marker_Passes() => Assert.True(true);
}
\`,
  }, () => {
    // Compile the passing version into the output.
    const built = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapStale_Marker_Passes']);
    assert(built.code === 0, 'could not establish the baseline build for the stale-build trap');
    // Now break the source WITHOUT rebuilding.
    fs.writeFileSync(path.join(ROOT, testFile), \`using Xunit;
namespace Pricing.Tests;
public class TrapStaleTests
{
    [Fact]
    public void TrapStale_Marker_Passes() => Assert.Equal(1, 2);
}
\`, 'utf8');
    const stale = dotnet(['test', TEST_PROJ, '--nologo', '--no-build', '--filter', 'FullyQualifiedName~TrapStale_Marker_Passes']);
    assert(stale.code === 0, '--no-build recompiled or noticed the change - stale-build trap not reproduced here');
    return '--no-build ran the old binary and passed a now-failing test';
  });
});

// A genuine red has TWO shapes, and they look completely different in the output. The first version
// of this trap only checked "1 failed, no compiler error", which is trap 9 applied to the trap itself
// - it asserted far less than its name claimed and would have passed either way. That weakness hid a
// real contract bug: the executor originally required an *assertion* failure, which rejects shape R2
// - the normal first red on every feature slice. Check the failure KIND, not just the count.

trap('R1', 'GENUINE red, shape 1 -> assertion mismatch', () => {
  return withFiles({
    // A stub that returns a wrong value rather than throwing: the behaviour exists but is incomplete.
    'src/Pricing/TrapSubject.cs': \`namespace Pricing;
public partial class TrapSubject
{
    public decimal Compute(decimal input) => 1m;
}
\`,
    'tests/Pricing.Tests/TrapRedAssertTests.cs': \`using Pricing;
using Xunit;
namespace Pricing.Tests;
public class TrapRedAssertTests
{
    [Fact]
    public void TrapRedAssert_KnownInput_ReturnsTieredValue()
        => Assert.Equal(95.00m, new TrapSubject().Compute(100.00m));
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '-v', 'normal', '--filter', 'FullyQualifiedName~TrapRedAssert_KnownInput_ReturnsTieredValue']);
    assert(r.code !== 0, 'the genuine failing test did not fail');
    assert(/Failed:\\s*1/i.test(r.out), 'runner did not report exactly one failed test');
    assert(!/error CS\\d+/i.test(r.out), 'this failed to compile, which is not a valid failing test');
    assert(/Assert\\.Equal\\(\\)|Expected:/i.test(r.out), 'no assertion text in the output - the executor cannot recognise this shape');
    return 'Assert.Equal() mismatch, distinguishable';
  });
});

trap('R2', 'GENUINE red, shape 2 -> NotImplementedException from the shell', () => {
  return withFiles({
    'src/Pricing/TrapSubject.cs': STUB_THROWS,
    'tests/Pricing.Tests/TrapRedThrowTests.cs': \`using Pricing;
using Xunit;
namespace Pricing.Tests;
public class TrapRedThrowTests
{
    [Fact]
    public void TrapRedThrow_KnownInput_ReturnsTieredValue()
        => Assert.Equal(95.00m, new TrapSubject().Compute(100.00m));
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '-v', 'normal', '--filter', 'FullyQualifiedName~TrapRedThrow_KnownInput_ReturnsTieredValue']);
    assert(r.code !== 0, 'the shell-throw red did not fail');
    assert(!/error CS\\d+/i.test(r.out), 'this failed to compile, which is not a valid failing test');
    assert(/NotImplementedException/i.test(r.out), 'NotImplementedException not visible in output');
    // The point of this trap: there is NO assertion text here. A contract demanding an assertion
    // failure would reject the correct first red on every feature slice.
    assert(!/Assert\\.Equal\\(\\)/i.test(r.out), 'unexpected assertion text - the two shapes would not be distinguishable, and the finding this trap encodes may no longer hold');
    return 'exception, NO assertion text - shape 2 confirmed distinct';
  });
});

trap(15, 'leftover state -> passes in the suite, fails run alone', () => {
  // The executor's prescribed check for this one is "re-run the test on its own". This proves that
  // check actually discriminates: the same test passes in company and fails in isolation. A static
  // field is the simplest honest stand-in for the real thing (a shared fixture, a test database, a
  // cached singleton) - the mechanism differs, the signal the executor keys off does not.
  return withFiles({
    'tests/Pricing.Tests/TrapPollutionTests.cs': \`using Xunit;
namespace Pricing.Tests;

public static class TrapSharedState
{
    public static decimal? Seeded;
}

public class TrapPollutionSeedTests
{
    [Fact]
    public void TrapPollution_Seed_SetsSharedState() => TrapSharedState.Seeded = 95.00m;
}

public class TrapPollutionReaderTests
{
    [Fact]
    public void TrapPollution_Reader_DependsOnLeftoverState()
        => Assert.Equal(95.00m, TrapSharedState.Seeded);
}
\`,
  }, () => {
    // Together, in one run: the seed executes and leaves the value behind, so the reader passes.
    const together = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapPollution_']);
    assert(together.code === 0, 'the polluted pair did not pass together - trap not reproduced');

    // Alone: nothing seeded the state, so the same test fails. This is the discriminator.
    const alone = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapPollution_Reader_DependsOnLeftoverState']);
    assert(alone.code !== 0, 're-running the test alone still passed - the executor\\'s "re-run it on its own" check would not detect this');
    return 'green in company, red alone - the isolation re-run discriminates';
  });
});

trap('T', 'table-driven test -> one method, several reported cases', () => {
  return withFiles({
    'tests/Pricing.Tests/TrapTheoryTests.cs': \`using Xunit;
namespace Pricing.Tests;
public class TrapTheoryTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void TrapTheory_ThreeRows_AllPass(int n) => Assert.True(n > 0);
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapTheory_ThreeRows_AllPass']);
    assert(r.code === 0, 'the theory did not pass');
    assert(/Passed:\\s*3/i.test(r.out), 'runner did not report 3 cases for one test method');
    return 'one method, 3 cases - a literal "exactly one test ran" check would reject this';
  });
});

trap('C', 'compile break -> must NOT count as a failing test', () => {
  return withFiles({
    'tests/Pricing.Tests/TrapCompileTests.cs': \`using Xunit;
namespace Pricing.Tests;
public class TrapCompileTests
{
    [Fact]
    public void TrapCompile_Broken_DoesNotCompile() => Assert.Equal(1, ThisSymbolDoesNotExist);
}
\`,
  }, () => {
    const r = dotnet(['test', TEST_PROJ, '--nologo', '--filter', 'FullyQualifiedName~TrapCompile_Broken_DoesNotCompile']);
    assert(r.code !== 0, 'a compile break did not produce a non-zero exit');
    assert(/error CS\\d+/i.test(r.out), 'no compiler error in output - executor could not tell this from a real assertion failure');
    return 'compiler error visible, distinguishable from an assertion failure';
  });
});

const failed = results.filter((r) => !r.ok);
console.log(\`\\n\${results.length - failed.length}/\${results.length} signals present\\n\`);
if (failed.length) {
  console.log('Traps whose signal was NOT detectable:');
  for (const f of failed) console.log(\`  \${f.id}  \${f.name}\\n      \${f.err}\`);
  console.log('\\nA missing signal means the executor contract asks for evidence the runner does not');
  console.log('actually produce. Fix the contract in agents/story-executor-agent.md, not this rig.\\n');
  process.exit(1);
}
console.log('Every mechanically-checkable trap produces the signal the executor is told to look for.');
console.log('Traps 1, 3, 10, 11 and 16 are the human-escalation cases and are not checkable here.\\n');
`;

const RIG_README = `# TDD mode rig (throwaway)

A disposable C# project for exercising \`--tdd\` end to end. Rebuild it any time with
\`node scripts/tdd-rig.js <dir>\` from the harness repo. Delete it whenever you like.

## Layer A — mechanical, no agents

    node traps/run-traps.js

Plants each machine-checkable failure mode as real C#, runs real \`dotnet test\`, and asserts the
signal the executor keys off is genuinely in the output. Proves the contract in
\`agents/story-executor-agent.md\` Step 3.5 is grounded in what the runner actually prints.

## Layer B — agent runs, by hand

The harness is installed here with the **local** tracker, seeded with two issues:

- **#1** — a Story: add tiered discounts. Should plan as *empty shell -> failing test -> real code*.
- **#2** — a Bug: rounding. Should plan test-first **even without the flag**, and in *two* steps.

Then:

    /implement --tdd 1      # feature: expect three tasks, three waves
    /implement 2            # bug: expect test-first anyway, two steps, no shell

What to check:

1. The plan orders the failing test **before** the code it tests.
2. The test task carries \`must_fail="true"\` and sits **alone** in its wave.
3. Its \`<verify>\` names exactly one test, forces a fresh build, and has no \`|| true\`.
4. The implementation task lists the test file under \`<read_first>\`, never \`<files>\`.
5. The failing-test task reports PASS because the test failed **on an assertion**.
6. For #2 there is no empty-shell step.

## Cost

Layer A is free. Layer B spawns real agents and costs real time and money — run it before shipping a
change to the mode, not on every commit.
`;

// ── Build ────────────────────────────────────────────────────────────────────

console.log(`\nBuilding TDD rig at:\n  ${target}\n`);
fs.mkdirSync(target, { recursive: true });

for (const [rel, content] of Object.entries(FILES)) write(rel, content);
write('traps/README.md', TRAPS_README);
write('traps/run-traps.js', RUN_TRAPS);
write('README.md', RIG_README);
write('.gitignore', 'bin/\nobj/\n.claude/\n');

// The wave machinery is full of git-dependent safety checks — the branch-drift check before and after
// every wave, the stray-file check via `git status --porcelain`, and the restore-before-retry rule.
// In a non-git rig all of them fail with "fatal: not a git repository", so a Layer B run silently
// skips the very safety net it is meant to be exercising. Both orchestrator runs flagged this.
const git = (args) => spawnSync('git', args, { cwd: target, encoding: 'utf8' });
if (!fs.existsSync(path.join(target, '.git'))) {
  git(['init', '-q']);
  git(['add', '-A']);
  const c = spawnSync('git', ['-c', 'user.name=TDD Rig', '-c', 'user.email=rig@example.invalid',
    'commit', '-q', '-m', 'rig: baseline before any test-first work'], { cwd: target, encoding: 'utf8' });
  console.log(c.status === 0 ? '  git         initialised, baseline committed' : '  git         init failed — branch/stray-file checks will not run');
}

console.log(`  project     src/Pricing + tests/Pricing.Tests (${TFM}, xUnit)`);
console.log('  conventions tasks/lessons.md');
console.log('  tracker     tasks/issues/1.md (Story), tasks/issues/2.md (Bug)');
console.log('  traps       traps/run-traps.js');

if (!noInstall) {
  console.log('\nInstalling the harness from this repo (local tracker, solo pack)...\n');
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'install', 'install.js'),
    '--project', target,
    '--yes',
    '--name', 'Rig',
    '--project-name', 'TDD Rig',
    '--pack', 'solo',
    '--local', REPO_ROOT,
  ], { encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\nInstall failed. The project is still usable for Layer A traps.');
    console.error(`Retry by hand:\n  node install/install.js --project "${target}" --yes --name Rig --project-name "TDD Rig" --pack solo --local "${REPO_ROOT}"`);
  }
}

console.log(`\nDone.\n\n  cd "${target}"\n  dotnet test tests/Pricing.Tests/Pricing.Tests.csproj   # baseline should be green\n  node traps/run-traps.js                                # Layer A\n`);
