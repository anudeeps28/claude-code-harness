'use strict';
// Private to the scripts module: reads the paths a test file uses, for check 5 (./tests.js). It is a
// static scan, not an interpreter: it masks comments and regex literals, collects the file's own
// `const x = ...` definitions, and works out what each path expression names, relative to the repo root.
//
// A value is one of:
//   { k: 'repo', p, full }  a path inside the repo (`p` is relative to the root; `full: false` means the
//                           tail after `p` is not known, as in path.join(root, 'agents', name))
//   { k: 'other' }          outside the repo (a temporary folder, the home folder, above the root)
//   { k: 'str', s }         a string that is not yet a path
//   { k: 'free' }           derived from a parameter, a loop variable or a call: the files it names are
//                           found where the value is made, so it is not read here
//   { k: 'unknown' }        input the scan cannot see (process.argv): the one case it reports

const fs = require('node:fs');
const path = require('node:path');
const { resolveTarget } = require('./readmes.js');

const FREE = { k: 'free' };
const UNKNOWN = { k: 'unknown' };
const OTHER = { k: 'other' };

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// The index of the backtick that closes the template literal opened at `i` (or the text's end). `mark` is
// called for each character that is template text, not the inside of a `${...}`.
function scanTemplate(text, i, mark) {
  let j = i + 1;
  let depth = 0;
  while (j < text.length) {
    if (text[j] === '\\') { if (!depth) mark(j, j + 2); j += 2; continue; }
    if (text[j] === '$' && text[j + 1] === '{') { depth++; j += 2; continue; }
    if (depth && text[j] === '}') { depth--; j++; continue; }
    if (!depth && text[j] === '`') break;
    if (!depth) mark(j, j + 1);
    j++;
  }
  return j;
}

// The index just after the `//` or `/* */` comment that starts at `i`.
function scanComment(text, i) {
  const line = text[i + 1] === '/';
  const j = text.indexOf(line ? '\n' : '*/', i + 2);
  if (j === -1) return text.length;
  return line ? j : j + 2;
}

// The index of the slash that closes the regex literal opened at `i` (or the line's end).
function scanRegex(text, i) {
  let j = i + 1;
  let inClass = false;
  while (j < text.length && text[j] !== '\n') {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === '[') inClass = true;
    else if (text[j] === ']') inClass = false;
    else if (text[j] === '/' && !inClass) break;
    j++;
  }
  return j;
}

// The text with comments and the inside of regex literals blanked (newlines kept, so offsets and line
// numbers stay the same). Strings are kept: their text is what a path is made of.
function maskCode(text) {
  const out = text.split('');
  const n = text.length;
  const inString = new Uint8Array(n);
  const mark = (a, b) => inString.fill(1, a, Math.min(b, n));
  const blank = (a, b) => { for (let k = a; k < b; k++) if (text[k] !== '\n') out[k] = ' '; };
  let prev = '';
  let prevWord = '';
  let i = 0;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && (d === '/' || d === '*')) {
      const j = scanComment(text, i);
      blank(i, j);
      i = j;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      mark(i, j + 1);
      i = j + 1;
      prev = c;
      prevWord = '';
    } else if (c === '`') {
      i = scanTemplate(text, i, mark) + 1;
      prev = '`';
      prevWord = '';
    } else if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /^(?:return|typeof|case|in|of|else)$/.test(prevWord))) {
      const j = scanRegex(text, i);
      blank(i + 1, j);
      i = j + 1;
      prev = '/';
      prevWord = '';
    } else {
      if (/[\w$]/.test(c)) {
        prevWord = /[\w$]/.test(prev) && prevWord ? prevWord + c : c;
      } else if (!/\s/.test(c)) {
        prevWord = '';
      }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  return { code: out.join(''), inString };
}

// The index of the bracket that closes the one at `open`, skipping strings; -1 when there is none.
function closeOf(code, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [pairs[code[open]]];
  for (let j = open + 1; j < code.length; j++) {
    const c = code[j];
    if (c === "'" || c === '"' || c === '`') {
      j++;
      while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
    } else if (pairs[c]) {
      stack.push(pairs[c]);
    } else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return j;
    }
  }
  return -1;
}

// Split at a top-level separator character (outside strings and brackets).
function splitTop(text, sep) {
  const parts = [];
  let start = 0;
  for (let j = 0; j < text.length; j++) {
    const c = text[j];
    if (c === "'" || c === '"' || c === '`') {
      j++;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
    } else if (c === '(' || c === '[' || c === '{') {
      const end = closeOf(text, j);
      if (end === -1) break;
      j = end;
    } else if (c === sep) {
      parts.push(text.slice(start, j).trim());
      start = j + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

// The text of an expression that starts at `start`: to a `;`, or to a line end when no bracket is open and
// the next line does not carry the expression on.
function readExpr(code, start) {
  let j = start;
  while (j < code.length) {
    const c = code[j];
    if (c === "'" || c === '"' || c === '`') {
      j++;
      while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
    } else if (c === '(' || c === '[' || c === '{') {
      const end = closeOf(code, j);
      if (end === -1) return code.slice(start, j);
      j = end;
    } else if (c === ';') {
      break;
    } else if (c === '\n') {
      const before = code.slice(start, j).trimEnd();
      const next = /^\s*(\S)/.exec(code.slice(j))?.[1];
      if (!/[+\-*/%?:.,&|=]$/.test(before) && !(next && /[.+?:|&]/.test(next))) break;
    }
    j++;
  }
  return code.slice(start, j).trim();
}

// The file's own definitions: name -> { expr } or { imp: spec, name }. A name defined twice with two
// different texts is ambiguous (two scopes): it is left out, so it reads as free.
function definitions(code) {
  const defs = new Map();
  const ambiguous = new Set();
  const put = (name, def) => {
    if (defs.has(name) && JSON.stringify(defs.get(name)) !== JSON.stringify(def)) ambiguous.add(name);
    else defs.set(name, def);
  };
  const decl = /(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  let m;
  while ((m = decl.exec(code))) put(m[1], { expr: readExpr(code, m.index + m[0].length) });
  const destructured = /(?<![\w$.])(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)/g;
  while ((m = destructured.exec(code))) {
    for (const item of m[1].split(',')) {
      const parts = item.split(':').map((s) => s.trim());
      if (parts[0]) put(parts[parts.length - 1], { imp: m[3], name: parts[0] });
    }
  }
  for (const name of ambiguous) defs.delete(name);
  return defs;
}

const norm = (p) => {
  const n = path.posix.normalize(p || '.');
  return n === '.' ? '' : n.replace(/\/+$/, '');
};

// path.join / path.resolve over evaluated arguments.
function joinValues(values, resolve) {
  let cur = null;
  for (const v of values) {
    if (!cur) {
      if (v.k === 'str') cur = v.s.startsWith('/') ? OTHER : { k: 'repo', p: norm(v.s), full: true, rel: !resolve };
      else cur = v;
      if (cur.k !== 'repo') return cur;
    } else if (v.k === 'str') {
      if (resolve && v.s.startsWith('/')) return OTHER;
      if (cur.full) cur = { ...cur, p: norm(path.posix.join(cur.p, v.s)) };
    } else if (v.k === 'other') {
      return OTHER;
    } else {
      cur = { ...cur, full: false };
    }
    if (cur.p === '..' || cur.p.startsWith('../')) return OTHER;
  }
  return cur || FREE;
}

// `a + b`: strings and paths joined as text.
function concatValues(values) {
  let cur = null;
  for (const v of values) {
    if (!cur) {
      cur = v;
      if (cur.k !== 'repo' && cur.k !== 'str') return cur;
    } else if (v.k === 'str' && cur.k === 'str') {
      cur = { k: 'str', s: cur.s + v.s };
    } else if (v.k === 'str' && cur.k === 'repo' && cur.full) {
      cur = { k: 'repo', p: norm(cur.p + v.s), full: true };
    } else if (cur.k === 'str') {
      cur = FREE;
    } else {
      cur = { k: 'repo', p: cur.p, full: false };
    }
  }
  return cur || FREE;
}

const unquote = (s) => {
  const m = /^(['"`])([\s\S]*)\1$/.exec(s);
  return m ? m[2].replace(/\\(.)/g, '$1') : null;
};

// Evaluate one expression of the file `ctx.rel`. ctx: { root, rel, defs, files, seen }.
function evaluate(expr, ctx, depth = 0) {
  let text = expr.trim();
  if (!text || depth > 12) return FREE;
  while (text.startsWith('(') && closeOf(text, 0) === text.length - 1) text = text.slice(1, -1).trim();
  const plus = splitTop(text, '+');
  if (plus.length > 1) return concatValues(plus.map((p) => evaluate(p, ctx, depth + 1)));
  if (/^'(?:[^'\\]|\\.)*'$|^"(?:[^"\\]|\\.)*"$/.test(text)) return { k: 'str', s: unquote(text) };
  if (text.startsWith('`') && text.endsWith('`')) return evaluateTemplate(text.slice(1, -1), ctx, depth);
  const call = /^path\.(?:posix\.)?(join|resolve)\s*\(/.exec(text);
  if (call && closeOf(text, call[0].length - 1) === text.length - 1) {
    const args = splitTop(text.slice(call[0].length, -1), ',').filter((a) => a !== '');
    return joinValues(args.map((a) => evaluate(a, ctx, depth + 1)), call[1] === 'resolve');
  }
  const dir = /^path\.dirname\s*\(([\s\S]*)\)$/.exec(text);
  if (dir) {
    const v = evaluate(dir[1], ctx, depth + 1);
    return v.k === 'repo' && v.full ? { k: 'repo', p: norm(path.posix.dirname(v.p || '.')), full: true } : v;
  }
  if (text === '__dirname') return { k: 'repo', p: norm(path.posix.dirname(ctx.rel)), full: true };
  if (text === '__filename') return { k: 'repo', p: ctx.rel, full: true };
  if (/^process\.cwd\s*\(\s*\)$/.test(text)) return { k: 'repo', p: '', full: true };
  if (/^(?:os\.(?:tmpdir|homedir)|fs\.mkdtempSync|fs\.realpathSync|process\.env)\b/.test(text)) return OTHER;
  if (/^process\.argv\b/.test(text)) return UNKNOWN;
  if (/^[A-Za-z_$][\w$]*$/.test(text)) return evaluateName(text, ctx, depth);
  const member = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(text);
  if (member) return evaluateMember(member[1], member[2], ctx, depth);
  return FREE;
}

function evaluateTemplate(body, ctx, depth) {
  const parts = [];
  let j = 0;
  let buf = '';
  while (j < body.length) {
    if (body[j] === '\\') { buf += body[j + 1] || ''; j += 2; continue; }
    if (body[j] === '$' && body[j + 1] === '{') {
      const end = closeOf(body, j + 1);
      if (end === -1) return FREE;
      if (buf) parts.push({ k: 'str', s: buf });
      buf = '';
      parts.push(evaluate(body.slice(j + 2, end), ctx, depth + 1));
      j = end + 1;
    } else {
      buf += body[j++];
    }
  }
  if (buf) parts.push({ k: 'str', s: buf });
  return concatValues(parts);
}

function evaluateName(name, ctx, depth) {
  const def = ctx.defs.get(name);
  if (!def) return FREE;
  const key = `${ctx.rel}#${name}`;
  if (ctx.seen.has(key)) return FREE;
  ctx.seen.add(key);
  try {
    return def.imp ? evaluateImport(def.imp, def.name, ctx, depth) : evaluate(def.expr, ctx, depth + 1);
  } finally {
    ctx.seen.delete(key);
  }
}

// A name another test file defines, read through `require('./x.js')`.
function evaluateImport(spec, name, ctx, depth) {
  if (!/^\.{1,2}\//.test(spec)) return FREE;
  const target = resolveTarget(ctx.root, ctx.rel, spec);
  if (!target) return FREE;
  const other = fileContext(ctx.root, target, ctx.files);
  return evaluateName(name, { ...other, seen: ctx.seen }, depth + 1);
}

function evaluateMember(obj, prop, ctx, depth) {
  const def = ctx.defs.get(obj);
  const spec = def && def.expr ? /^require\(\s*(['"])([^'"]+)\1\s*\)$/.exec(def.expr) : null;
  return spec ? evaluateImport(spec[2], prop, ctx, depth) : FREE;
}

function fileContext(root, rel, files) {
  if (!files.has(rel)) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const { code, inString } = maskCode(text);
    files.set(rel, { root, rel, code, inString, defs: definitions(code) });
  }
  const { code, inString, defs } = files.get(rel);
  return { root, rel, code, inString, defs, files, seen: new Set() };
}

// The calls that read a file or folder (fs.*, with or without `promises`), and the bare Sync names.
const READ_CALL_SRC = /(?<![\w$])(?:(?:fs|fsp|fs\.promises|promises)\.(?:readFileSync|readFile|readdirSync|readdir|existsSync|statSync|lstatSync|stat|lstat|readlinkSync|realpathSync|accessSync|access|openSync|opendirSync|createReadStream|copyFileSync|cpSync|globSync)|(?:readFileSync|readdirSync|existsSync|statSync))\s*\(/;
const PATH_CALL_SRC = /(?<![\w$.])path\.(?:posix\.)?(?:join|resolve)\s*\(/;
// Each scan makes its own /g regexes: a shared one keeps its lastIndex between calls.
const freshGlobal = (re) => new RegExp(re.source, 'g');

// The local helpers that take a rest parameter (`const read = (...p) => fs.readFileSync(path.join(OWN, ...p))`):
// [{ name, params, rest, body }]. A call to one is read with its literal arguments put in (see readsOf).
const WRAPPER_SRC = /(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^()]*\.\.\.[^()]*)\)\s*=>\s*|(?<![\w$.])function\s+([A-Za-z_$][\w$]*)\s*\(([^()]*\.\.\.[^()]*)\)\s*(?=\{)/;

function wrappersOf(code) {
  const out = [];
  for (const m of code.matchAll(freshGlobal(WRAPPER_SRC))) {
    const isArrow = m[1] !== undefined;
    const names = (isArrow ? m[2] : m[4]).split(',').map((x) => x.trim()).filter(Boolean);
    const end = m.index + m[0].length;
    const close = isArrow ? -1 : closeOf(code, end);
    const body = isArrow ? readExpr(code, end) : code.slice(end, close + 1);
    const rest = names.find((x) => x.startsWith('...'));
    out.push({ name: isArrow ? m[1] : m[3], params: names.filter((x) => x !== rest), rest: rest.slice(3), body });
  }
  return out;
}

// The wrapper's body with one call's arguments put in place of its parameters.
function expandWrapper(w, args) {
  let body = w.body.replace(new RegExp(`\\.\\.\\.${w.rest.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'), args.slice(w.params.length).join(', '));
  w.params.forEach((param, i) => {
    body = body.replace(new RegExp(`(?<![\\w$.])${param.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'), `(${args[i] || 'undefined'})`);
  });
  return body;
}

// The reads a wrapper's call sites make: each call is read as the wrapper's body with its arguments put in,
// reported at the call's line.
function wrapperReads(ctx, readsIn) {
  const reads = [];
  for (const w of wrappersOf(ctx.code)) {
    const re = new RegExp(`(?<![\\w$.])(?<!function\\s)${w.name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
    for (const m of ctx.code.matchAll(re)) {
      const open = m.index + m[0].length - 1;
      const end = closeOf(ctx.code, open);
      if (end === -1 || ctx.inString[m.index]) continue;
      const args = splitTop(ctx.code.slice(open + 1, end), ',').filter((a) => a !== '');
      const { code, inString } = maskCode(expandWrapper(w, args));
      const line = lineOf(ctx.code, m.index);
      for (const r of readsIn({ ...ctx, code, inString })) reads.push({ line, value: r.value });
    }
  }
  return reads;
}

// Everything a file reads: [{ line, value }] for each read call's first argument and each path.join /
// path.resolve call. A call of a local wrapper with a rest parameter counts as the reads its body makes
// with that call's arguments. `ctx` comes from fileContext.
function readsOf(ctx) {
  return [...scanReads(ctx), ...wrapperReads(ctx, scanReads)];
}

function scanReads(ctx) {
  const reads = [];
  const argOf = (open) => {
    const end = closeOf(ctx.code, open);
    return end === -1 ? '' : splitTop(ctx.code.slice(open + 1, end), ',')[0];
  };
  for (const isPath of [false, true]) {
    for (const m of ctx.code.matchAll(freshGlobal(isPath ? PATH_CALL_SRC : READ_CALL_SRC))) {
      const open = m.index + m[0].length - 1;
      const arg = isPath ? ctx.code.slice(m.index, closeOf(ctx.code, open) + 1) : argOf(open);
      if (!arg || ctx.inString[m.index]) continue;
      let value = evaluate(arg, ctx);
      if (isPath) {
        // A relative path.join('agents', x) is a fragment that is joined to a folder elsewhere.
        if (value.k === 'repo' && value.rel) continue;
      } else if (value.k === 'str') {
        value = literalRead(value.s);
      } else if (value.k === 'repo' && value.rel) {
        value = { ...value, rel: false };
      }
      reads.push({ line: lineOf(ctx.code, m.index), value });
    }
  }
  return reads;
}

// A literal path given to a read call is relative to the working directory, which is the repo root when the
// tests run. One that climbs out of the root names no file the check can place, so it is reported.
function literalRead(s) {
  if (s.startsWith('/')) return OTHER;
  const p = norm(s);
  return p === '..' || p.startsWith('../') ? UNKNOWN : { k: 'repo', p, full: true };
}

const REQUIRE_SRC = /(?<![\w$.])(?:require(?:\.resolve)?|import)\s*\(/;

// Every require / require.resolve / import() in the file: [{ line, spec }] with the literal specifier,
// or { line, value } when the argument is an expression (a name defined in the file, say).
function requiresOf(ctx) {
  const out = [];
  for (const m of ctx.code.matchAll(freshGlobal(REQUIRE_SRC))) {
    if (ctx.inString[m.index]) continue;
    const open = m.index + m[0].length - 1;
    const end = closeOf(ctx.code, open);
    if (end === -1) continue;
    const arg = splitTop(ctx.code.slice(open + 1, end), ',')[0];
    const line = lineOf(ctx.code, m.index);
    const lit = /^'([^'\n]*)'$|^"([^"\n]*)"$/.exec(arg);
    if (lit) out.push({ line, spec: lit[1] === undefined ? lit[2] : lit[1] });
    else if (arg) out.push({ line, value: evaluate(arg, ctx) });
  }
  return out;
}

module.exports = { fileContext, readsOf, requiresOf };
