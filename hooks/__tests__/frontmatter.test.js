const test = require('node:test');
const assert = require('node:assert');
const { parse } = require('../lib/frontmatter');

test('parses simple key: value pairs', () => {
  const fm = parse('---\nname: foo\nmodel: opus\n---\nbody');
  assert.deepEqual(fm, { name: 'foo', model: 'opus' });
});

test('strips double-quoted values', () => {
  const fm = parse('---\nname: "Hello world"\n---');
  assert.equal(fm.name, 'Hello world');
});

test('strips single-quoted values', () => {
  const fm = parse("---\nname: 'foo'\n---");
  assert.equal(fm.name, 'foo');
});

test('returns empty object when no frontmatter', () => {
  assert.deepEqual(parse('just body text'), {});
});

test('returns empty object on malformed frontmatter (no closing ---)', () => {
  assert.deepEqual(parse('---\nname: foo\nbody'), {});
});

test('skips comment lines and blanks inside frontmatter', () => {
  const fm = parse('---\n# comment\nname: foo\n\nmodel: sonnet\n---');
  assert.deepEqual(fm, { name: 'foo', model: 'sonnet' });
});

test('handles CRLF line endings', () => {
  const fm = parse('---\r\nname: foo\r\nmodel: opus\r\n---\r\nbody');
  assert.deepEqual(fm, { name: 'foo', model: 'opus' });
});

test('handles colons in values', () => {
  const fm = parse('---\ndescription: Use this when X: do Y\n---');
  assert.equal(fm.description, 'Use this when X: do Y');
});

test('ignores keys without a colon', () => {
  const fm = parse('---\nname: foo\nbroken-line\nmodel: opus\n---');
  assert.deepEqual(fm, { name: 'foo', model: 'opus' });
});

test('does not parse fields after the closing ---', () => {
  const fm = parse('---\nname: foo\n---\nlater: ignored');
  assert.deepEqual(fm, { name: 'foo' });
});
