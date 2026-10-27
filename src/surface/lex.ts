/**
 * Turns a source file into the characters that are actually code.
 * String literals and comments are spaces, so a `{` or `/*` inside them
 * cannot move brace depth or swallow the rest of the file.
 * A template `${...}` keeps its braces: they balance, and they are not a block.
 */

export type LexLang = "js" | "go" | "rust" | "java" | "py";

export type LexState = {
  mode: "code" | "block" | "sq" | "dq" | "template" | "raw" | "triple";
  /** Brace depth of the current template interpolation. 0 means we are not in one. */
  expr: number;
  triple: '"' | "'" | "";
};

export const LEX_START: LexState = { mode: "code", expr: 0, triple: "" };

export function lexLang(file: string): LexLang {
  if (file.endsWith(".py")) return "py";
  if (file.endsWith(".go")) return "go";
  if (file.endsWith(".rs")) return "rust";
  if (file.endsWith(".java") || file.endsWith(".kt")) return "java";
  return "js";
}

export function scanLine(line: string, state: LexState, lang: LexLang): { code: string; state: LexState } {
  const out: string[] = [];
  let mode = state.mode;
  let expr = state.expr;
  let triple = state.triple;
  let i = 0;

  const space = (count = 1) => {
    for (let n = 0; n < count; n++) out.push(" ");
  };
  const at = (offset: number) => line[i + offset] ?? "";

  while (i < line.length) {
    const char = line[i] ?? "";
    const next = at(1);

    if (mode === "block") {
      if (char === "*" && next === "/") {
        space(2);
        i += 2;
        mode = "code";
        continue;
      }
      space();
      i += 1;
      continue;
    }

    if (mode === "triple") {
      if (line.startsWith(triple.repeat(3), i)) {
        space(3);
        i += 3;
        mode = "code";
        triple = "";
        continue;
      }
      space();
      i += 1;
      continue;
    }

    if (mode === "sq" || mode === "dq") {
      const quote = mode === "sq" ? "'" : '"';
      if (char === "\\") {
        space(Math.min(2, line.length - i));
        i += 2;
        continue;
      }
      if (char === quote) {
        space();
        i += 1;
        mode = "code";
        continue;
      }
      space();
      i += 1;
      continue;
    }

    if (mode === "raw") {
      if (char === "`") {
        space();
        i += 1;
        mode = "code";
        continue;
      }
      space();
      i += 1;
      continue;
    }

    if (mode === "template") {
      if (char === "\\") {
        space(Math.min(2, line.length - i));
        i += 2;
        continue;
      }
      if (char === "`") {
        space();
        i += 1;
        mode = "code";
        continue;
      }
      if (char === "$" && next === "{") {
        space();
        out.push("{");
        i += 2;
        expr += 1;
        mode = "code";
        continue;
      }
      space();
      i += 1;
      continue;
    }

    if (expr > 0 && char === "{") {
      expr += 1;
      out.push("{");
      i += 1;
      continue;
    }
    if (expr > 0 && char === "}") {
      expr -= 1;
      out.push("}");
      i += 1;
      if (expr === 0) mode = "template";
      continue;
    }

    if (lang !== "py" && char === "/" && next === "/") {
      space(line.length - i);
      break;
    }
    if (lang !== "py" && char === "/" && next === "*") {
      space(2);
      i += 2;
      mode = "block";
      continue;
    }
    if (lang === "py" && char === "#") {
      space(line.length - i);
      break;
    }
    if (lang === "py" && (line.startsWith('"""', i) || line.startsWith("'''", i))) {
      triple = char === '"' ? '"' : "'";
      space(3);
      i += 3;
      mode = "triple";
      continue;
    }
    if (char === '"') {
      space();
      i += 1;
      mode = "dq";
      continue;
    }
    if (char === "'" && lang !== "rust") {
      space();
      i += 1;
      mode = "sq";
      continue;
    }
    if (char === "'" && lang === "rust") {
      if (next === "\\" && at(3) === "'") {
        space(4);
        i += 4;
        continue;
      }
      if (next !== "" && at(2) === "'") {
        space(3);
        i += 3;
        continue;
      }
      out.push(char);
      i += 1;
      continue;
    }
    if (char === "`" && lang === "go") {
      space();
      i += 1;
      mode = "raw";
      continue;
    }
    if (char === "`" && lang === "js") {
      space();
      i += 1;
      mode = "template";
      continue;
    }

    out.push(char);
    i += 1;
  }

  if (mode === "sq" || mode === "dq") mode = "code";
  return { code: out.join(""), state: { mode, expr, triple } };
}

/** One code line per source line. Strings and comments are blank. */
export function codeLines(text: string, file: string): string[] {
  const lang = lexLang(file);
  let state = LEX_START;
  return text.split(/\r?\n/).map((line) => {
    const next = scanLine(line, state, lang);
    state = next.state;
    return next.code;
  });
}
