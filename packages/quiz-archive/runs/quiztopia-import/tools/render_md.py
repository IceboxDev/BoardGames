#!/usr/bin/env python3
"""Render quiz-card JSON files to Markdown and build INDEX.md.

usage: render_md.py <json_dir> <md_dir> <index_path>
"""
import json
import os
import sys


def render(card: dict) -> str:
    out = [f"# {card['image']}", ""]
    for s in card["sets"]:
        out.append(f"## {s['n']}. {s['category_en']} / {s['category_de']}")
        out.append("")
        if s.get("notes"):
            out.append(f"> Notes: {s['notes']}")
            out.append("")
        out.append("| # | Question (DE) | Question (EN) | Answer (DE) | Answer (EN) |")
        out.append("|---|---|---|---|---|")
        for j, q in enumerate(s["questions"]):
            mark = "**orig**" if q.get("original") else str(j + 1)
            cell = lambda v: v.replace("|", "\\|").replace("\n", " ")  # noqa: E731
            out.append(
                f"| {mark} | {cell(q['de'])} | {cell(q['en'])} | {cell(q['answer_de'])} | {cell(q['answer_en'])} |"
            )
        out.append("")
        out.append(f"### {s['article_title_en']}")
        out.append("")
        out.append(s["article_en"].strip())
        out.append("")
        out.append(f"### {s['article_title_de']}")
        out.append("")
        out.append(s["article_de"].strip())
        out.append("")
    return "\n".join(out) + "\n"


def main() -> None:
    json_dir, md_dir, index_path = sys.argv[1:4]
    os.makedirs(md_dir, exist_ok=True)
    index = ["# Quiz cards", ""]
    files = sorted(f for f in os.listdir(json_dir) if f.endswith(".json"))
    for f in files:
        with open(os.path.join(json_dir, f), encoding="utf-8") as fh:
            try:
                card = json.load(fh)
            except Exception as e:  # noqa: BLE001
                index.append(f"- {f} — INVALID JSON ({e})")
                continue
        stem = f[:-5]
        with open(os.path.join(md_dir, stem + ".md"), "w", encoding="utf-8") as fh:
            fh.write(render(card))
        index.append(f"## [{stem}](md/{stem}.md)")
        index.append("")
        for s in card.get("sets", []):
            q0 = s["questions"][0]
            index.append(f"- **{s['category_en']}** — {q0['de']} → *{q0['answer_de']}*")
        index.append("")
    with open(index_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(index) + "\n")
    print(f"rendered {len(files)} cards")


if __name__ == "__main__":
    main()
