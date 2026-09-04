// NOTE for the theme engine's `import.meta.glob("./fonts/*.ts")` discovery:
// this test file lives beside the registry files, so the glob must exclude
// `*.test.ts` (e.g. `import.meta.glob(["./fonts/*.ts", "!./fonts/*.test.ts"])`).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import crimson from "./crimson";
import inter from "./inter";
import jetbrains from "./jetbrains";
import outfit from "./outfit";

// Hand-listed on purpose: the registry files are import-free contract modules
// that the theme engine discovers via import.meta.glob — the engine's registry
// is the eventual completeness/shape enforcement point.
const fonts = [inter, jetbrains, outfit, crimson];

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../../..");

/** First family in a CSS font stack, unquoted. */
function firstFamily(stack: string): string {
  const head = stack.split(",")[0] ?? "";
  return head.trim().replace(/^"(.*)"$/, "$1");
}

/** All dynamic-import specifiers in a registry module's source. */
function importSpecifiers(sourceFile: string): string[] {
  const source = readFileSync(resolve(here, sourceFile), "utf8");
  return [...source.matchAll(/import\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1] ?? "");
}

/** The value of a `--token: …;` custom property in src/index.css. */
function indexCssToken(token: string): string {
  const css = readFileSync(resolve(webRoot, "src/index.css"), "utf8");
  const match = css.match(new RegExp(`${token}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`token ${token} not found in src/index.css`);
  return match[1].trim();
}

describe("font registry contract", () => {
  it("every font has string key/label/stack and a boolean display flag", () => {
    for (const font of fonts) {
      expect(typeof font.key).toBe("string");
      expect(font.key.length).toBeGreaterThan(0);
      expect(typeof font.label).toBe("string");
      expect(font.label.length).toBeGreaterThan(0);
      expect(typeof font.stack).toBe("string");
      expect(font.stack.length).toBeGreaterThan(0);
      expect(typeof font.display).toBe("boolean");
    }
  });

  it("keys are unique", () => {
    const keys = fonts.map((font) => font.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every stack ends in a generic CSS family", () => {
    for (const font of fonts) {
      expect(font.stack).toMatch(
        /(?:^|[,\s])(?:serif|sans-serif|monospace|system-ui|ui-serif|ui-sans-serif|ui-monospace|cursive|fantasy|math)$/,
      );
    }
  });

  it("inter (fully eager in main.tsx) has no load thunk", () => {
    expect("load" in inter).toBe(false);
    expect(importSpecifiers("inter.ts")).toEqual([]);
  });

  // Which entries carry a thunk is discovered via `"load" in font` narrowing,
  // not hardcoded — the engine normalizes the same way at runtime.
  it("load() thunks return a resolving promise and are idempotent", async () => {
    let thunks = 0;
    for (const font of fonts) {
      if (!("load" in font)) continue;
      thunks += 1;
      expect(typeof font.load).toBe("function");
      const pending = font.load();
      expect(pending).toBeInstanceOf(Promise);
      await expect(pending).resolves.toBeDefined();
      // Cached: a second call must return the first call's promise, because
      // Vite's preload helper marks a dep "seen" before its stylesheet has
      // finished loading.
      expect(font.load()).toBe(pending);
    }
    expect(thunks).toBe(3);
  });
});

describe("main.tsx eager imports", () => {
  // inter.ts/jetbrains.ts justify their (partial) lack of a load thunk with
  // "main.tsx imports these faces eagerly" — pin that claim.
  it("the faces the registry comments rely on are still imported eagerly", () => {
    const main = readFileSync(resolve(webRoot, "src/main.tsx"), "utf8");
    for (const specifier of [
      "@fontsource-variable/inter/index.css",
      "@fontsource/jetbrains-mono/400.css",
      "@fontsource/jetbrains-mono/500.css",
      "@fontsource/jetbrains-mono/700.css",
    ]) {
      expect(main).toContain(`import "${specifier}"`);
    }
  });
});

describe("index.css token mirror", () => {
  // The engine resets --font-body/--font-mono to these stacks, so drift
  // between the registry and the index.css defaults must fail loudly.
  it("inter.stack mirrors --font-body", () => {
    expect(inter.stack).toBe(indexCssToken("--font-body"));
  });

  it("jetbrains.stack mirrors --font-mono", () => {
    expect(jetbrains.stack).toBe(indexCssToken("--font-mono"));
  });

  it("crimson.stack ends with the --font-serif-body tail", () => {
    expect(crimson.stack.endsWith(indexCssToken("--font-serif-body"))).toBe(true);
  });
});

describe("load() routing", () => {
  // vitest runs with CSS stubbed out, so "the import resolved" alone proves
  // nothing about WHICH stylesheet a thunk pulls. Instead: extract the import
  // specifiers from each module's source, pin them, and assert the CSS file
  // each specifier points at actually declares the stack's first family —
  // a crimson.ts thunk importing outfit's CSS cannot ship.
  const routing = [
    {
      font: jetbrains,
      sourceFile: "jetbrains.ts",
      specifiers: ["@fontsource/jetbrains-mono/600.css", "@fontsource/jetbrains-mono/800.css"],
    },
    {
      font: outfit,
      sourceFile: "outfit.ts",
      specifiers: ["@fontsource-variable/outfit/index.css"],
    },
    {
      font: crimson,
      sourceFile: "crimson.ts",
      specifiers: [
        "@fontsource-variable/crimson-pro/index.css",
        "@fontsource-variable/crimson-pro/wght-italic.css",
      ],
    },
  ];

  for (const { font, sourceFile, specifiers } of routing) {
    it(`${font.key} imports exactly the expected fontsource CSS`, () => {
      expect(importSpecifiers(sourceFile)).toEqual(specifiers);
    });

    it(`${font.key}'s imported CSS declares "${firstFamily(font.stack)}"`, () => {
      for (const specifier of specifiers) {
        const css = readFileSync(resolve(webRoot, "node_modules", specifier), "utf8");
        expect(css).toMatch(new RegExp(`font-family:\\s*'${firstFamily(font.stack)}'`));
      }
    });
  }

  it("outfit's variable weight axis covers the app's 800/900 utilities", () => {
    const css = readFileSync(
      resolve(webRoot, "node_modules/@fontsource-variable/outfit/index.css"),
      "utf8",
    );
    expect(css).toMatch(/font-weight:\s*100 900/);
  });
});
