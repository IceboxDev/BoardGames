import { describe, expect, it } from "vitest";
import { fieldIn, inLang, inLangs } from "./text.ts";

describe("quiz text", () => {
  const text = { en: "Gold", de: "Gold", ru: "Золото" };
  it("picks one language, Russian falling back to English", () => {
    expect(inLang("ru", text)).toBe("Золото");
    expect(inLang("ru", { en: "Gold", de: "Gold" })).toBe("Gold");
    expect(inLang("de", { en: "Silver", de: "Silber" })).toBe("Silber");
  });

  it("gives primary then secondary, dropping a duplicate", () => {
    expect(inLangs({ primary: "ru", secondary: "de" }, text)).toEqual(["Золото", "Gold"]);
    expect(inLangs({ primary: "en", secondary: "de" }, text)).toEqual(["Gold"]);
    expect(inLangs({ primary: "en", secondary: null }, text)).toEqual(["Gold"]);
  });

  it("reads an article field by base name", () => {
    const a = { titleEn: "Gold", titleDe: "Gold (DE)", titleRu: undefined };
    expect(fieldIn(a, "title", "de")).toBe("Gold (DE)");
    expect(fieldIn(a, "title", "ru")).toBe("Gold");
  });
});
