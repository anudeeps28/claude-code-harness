# Test rules: how every test is written

The rules for every test a run writes or changes: the tests written first from a story's criteria, any
test a fix adds, and a test touched for a review finding. `story-builder` reads this file itself and
`story-reviewer` judges tests against it; any other agent that writes a test is told to read it.

**Write the tests before the implementation.** Write them from the criteria text and nothing else.
Follow the repo's testing guide and the existing suites' naming: a test name states the criterion it
proves and carries its criterion id (AC1, AC2, ...). Where the story adds a new way to read data, also
write the test that the wrong person is refused, now, not later. Run them and show them failing. A test
that passes before the code exists is testing the wrong thing; fix it before going on.

**A criterion about a screen also gets an end-to-end test that drives the screen**, when the project has
an end-to-end test command. A unit test of the code behind the screen does not show the screen works.

**A red test must fail on its assertion.** A test that does not compile, or that stops on a missing
type or method, has not failed yet: it has not run. Add the smallest stub the test needs to compile
(the signature, returning a default), run it again, and show it failing on the assertion, for the
reason the criterion names. That is the red that counts.

**The expected value never comes from the code under test.** Write it as a literal or a hand-checked
fixture. An expectation built with the same function, builder or helper the test is checking passes
whatever that code does.

**No assertion on a mock.** A check that a mock was set up, rendered or returned its canned answer
tests the mock, not the code. Assert what the real code did with it; where the mock is the only thing
being checked, use the real component or delete the assertion. Mock only the slow or external part,
and keep what the criterion depends on real.

**Wait for a condition, never for a time.** In any test that waits on async work, poll for the
condition with a timeout (or use the framework's retrying assertion) rather than sleeping. A fixed
delay is allowed only where timing itself is the criterion (a debounce, a retry interval), with a
comment saying so.

**A test that asserts an absence can pass while proving nothing.** An empty-collection check, a
does-not-contain check, a zero-offenders count: every one is satisfied by a collection that came back
empty for a reason the test never checked, such as a data source not yet populated, a query that
matched nothing, or a filter that silently excluded everything. So every absence assertion gets a
companion in the same test that proves the thing it is searching was actually there: a non-empty check
on the collection, or naming a specific element that must be present.

**A test over content can match the words instead of the claim.** Where the criterion is "given X, when
it is read, then it states Y" (a document, a generated file, a config, a manifest, a response body),
the obvious check looks for Y's words. The negation of Y contains all of Y's words: "the kind is never
restricted to workforce or external" satisfies every search for *kind*, *workforce* and *external*. So
does a rejected alternative in the same document saying the opposite on purpose. Watching the test
fail first does not catch this: before the content exists it fails for the honest reason, and
afterwards it passes for the wrong one.

The fix is cheap: write the criterion as a check that answers yes or no, and test that check twice.
Once against planted text that says the opposite, which must be rejected, proving the check can fail;
and once against the real content, which is the enforcement. Match the whole claim rather than its
words: anchor on the subject and its verb, not on a bag of nouns, and where the decision turns on a
quantity ("one person", not "a list of people") assert the quantity. Where a check should be satisfied
by exactly one document, run it across the set and require the one.

**Do not let a test's data be a list of what you touched.** A test run over the four files you
remember editing cannot report the fifth you forgot. Work out the set instead: scan for the condition
the rule describes and let the scan find the members, so the case you did not think of is the case it
reports.

**No test that cannot fail.** Before you keep a test, name the change to the code that would turn it
red. If no such change exists (the assertion is always true, the expected value is the actual value,
the path is never reached), the test proves nothing: fix it or delete it.
