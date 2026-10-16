// Safe expression parser/evaluator for facade rules.
// Hand-written on purpose: rule sets will eventually hold user-typed text, so no eval / new Function.
const MAX_LEN = 256;
const MAX_NEST = 32;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const BUILTINS = {
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
};
const BIN_PREC = {
  "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 5, "-": 5, "*": 6, "/": 6, "%": 6,
};
const TOKEN = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_]\w*)|(&&|\|\||<=|>=|==|!=|[-+*/%<>!?:(),.]))/y;

function tokenize(src) {
  const out = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`bad expression "${src}" near index ${pos}`);
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ k: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ k: "id", v: m[2] });
    else out.push({ k: "op", v: m[3] });
  }
  return out;
}

function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  let nest = 0; // parser recursion depth: input like "((((..." must not overflow the stack
  const enter = () => {
    if (++nest > MAX_NEST) throw new Error(`expression too deep (more than ${MAX_NEST} levels) in "${src.slice(0, 40)}"`);
  };
  const isOp = (v) => toks[i]?.k === "op" && toks[i].v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`expected "${v}" in "${src}"`);
    i++;
  };

  function ternary() {
    enter();
    const c = binary(1);
    if (!isOp("?")) {
      nest--;
      return c;
    }
    i++;
    const a = ternary();
    expect(":");
    const b = ternary();
    nest--;
    return { t: "cond", c, a, b };
  }
  function binary(minPrec) {
    let left = unary();
    for (;;) {
      const tk = toks[i];
      const prec = tk?.k === "op" ? BIN_PREC[tk.v] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      i++;
      const right = binary(prec + 1);
      left = { t: "bin", op: tk.v, a: left, b: right };
    }
  }
  function unary() {
    enter();
    let node;
    if (isOp("!") || isOp("-")) {
      const op = toks[i++].v;
      node = { t: "un", op, a: unary() };
    } else {
      node = primary();
    }
    nest--;
    return node;
  }
  function primary() {
    const tk = toks[i++];
    if (!tk) throw new Error(`unexpected end of "${src}"`);
    if (tk.k === "num") return { t: "num", v: tk.v };
    if (tk.k === "id") {
      if (isOp("(")) {
        i++;
        const args = [];
        if (!isOp(")")) {
          args.push(ternary());
          while (isOp(",")) {
            i++;
            args.push(ternary());
          }
        }
        expect(")");
        return { t: "call", name: tk.v, args };
      }
      const path = [tk.v];
      while (isOp(".")) {
        i++;
        const n = toks[i++];
        if (n?.k !== "id") throw new Error(`expected a name after "." in "${src}"`);
        path.push(n.v);
      }
      return { t: "id", path };
    }
    if (tk.v === "(") {
      const e = ternary();
      expect(")");
      return e;
    }
    throw new Error(`unexpected "${tk.v}" in "${src}"`);
  }

  const ast = ternary();
  if (i < toks.length) throw new Error(`unexpected "${toks[i].v}" in "${src}"`);
  return ast;
}

function check(n) {
  switch (n.t) {
    case "id":
      for (const p of n.path) if (FORBIDDEN.has(p)) throw new Error(`forbidden name "${p}"`);
      break;
    case "call":
      if (!Object.hasOwn(BUILTINS, n.name) && n.name !== "rand") throw new Error(`unknown function "${n.name}"`);
      n.args.forEach(check);
      break;
    case "un":
      check(n.a);
      break;
    case "bin":
      check(n.a);
      check(n.b);
      break;
    case "cond":
      check(n.c);
      check(n.a);
      check(n.b);
      break;
  }
}

const cache = new Map();

/** Parse + check an expression string once; throws a readable Error if it is invalid. */
export function compile(src) {
  if (typeof src === "string" && src.length > MAX_LEN) throw new Error(`expression too long (${src.length} characters, the limit is ${MAX_LEN})`);
  let ast = cache.get(src);
  if (!ast) {
    ast = parse(src);
    check(ast);
    cache.set(src, ast);
  }
  return ast;
}

function run(n, scope, fns) {
  switch (n.t) {
    case "num":
      return n.v;
    case "id": {
      let v = scope;
      for (const p of n.path) {
        if (v === null || typeof v !== "object" || !Object.hasOwn(v, p)) {
          throw new Error(`unknown identifier "${n.path.join(".")}"`);
        }
        v = v[p];
      }
      return v;
    }
    case "call": {
      const f = n.name === "rand" ? fns.rand : BUILTINS[n.name];
      if (typeof f !== "function") throw new Error(`function "${n.name}" is not available here`);
      return f(...n.args.map((a) => run(a, scope, fns)));
    }
    case "un": {
      const a = run(n.a, scope, fns);
      return n.op === "!" ? !a : -a;
    }
    case "cond":
      return run(n.c, scope, fns) ? run(n.a, scope, fns) : run(n.b, scope, fns);
    case "bin": {
      if (n.op === "&&") return run(n.a, scope, fns) && run(n.b, scope, fns);
      if (n.op === "||") return run(n.a, scope, fns) || run(n.b, scope, fns);
      const a = run(n.a, scope, fns);
      const b = run(n.b, scope, fns);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
        case "==": return a === b;
        case "!=": return a !== b;
      }
    }
  }
  throw new Error(`bad node ${n.t}`);
}

/** Evaluate an expression string (numbers and booleans pass through). `fns.rand` supplies rand(). */
export function evalExpr(src, scope = {}, fns = {}) {
  if (typeof src === "number" || typeof src === "boolean") return src;
  if (typeof src !== "string") throw new Error(`expression must be a string or number, got ${typeof src}`);
  return run(compile(src), scope, fns);
}
