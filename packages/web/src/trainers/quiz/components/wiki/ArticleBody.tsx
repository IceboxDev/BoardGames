import { Fragment, type ReactNode } from "react";
import { cn } from "../../../../lib/cn";
import type { DomainTone } from "../../domains";
import { AnswerMark } from "../common/AnswerMark";
import { type ArticleBlock, type ArticleSegment, inlineRuns } from "./article-segments";

// Renders the segmented article: paragraphs, the closing reference table,
// bullet lists — with every fact's answer as an interactive mark wherever it
// sit (running text, a table cell, a list item). `print` sets it for the
// paper's columns: answers underlined in the section's ink and a drop cap on
// the first paragraph. `after(i)` sets something between blocks (a photo),
// and `endMark` closes the last paragraph.

type Props = {
  blocks: readonly ArticleBlock[];
  tone: DomainTone;
  /** The passage anchor of fact `q` (its fact id), the target of `#<factId>` links. */
  anchorOf: (q: number) => string;
  questionText: (q: number) => string;
  shown: readonly boolean[];
  onOpen: (q: number) => void;
  /** Index of the block after which the read sentinel is placed. */
  sentinelAfter: number;
  setSentinel: (el: HTMLDivElement | null) => void;
  print?: boolean;
  /** The section whose ink underlines a `print` answer. */
  domain?: string;
  /** Set after block `i` (a figure between paragraphs). */
  after?: (blockIndex: number) => ReactNode;
  /** Printed at the end of the last paragraph (the feature's end mark). */
  endMark?: ReactNode;
};

export function ArticleBody({
  blocks,
  tone,
  anchorOf,
  questionText,
  shown,
  onOpen,
  sentinelAfter,
  setSentinel,
  print = false,
  domain,
  after,
  endMark,
}: Props) {
  const inline = (segments: readonly ArticleSegment[]): ReactNode =>
    inlineRuns(segments).map(({ seg, bold, italic }) => {
      let node: ReactNode =
        seg.kind === "text" ? (
          seg.text
        ) : (
          <span id={anchorOf(seg.q)} className="scroll-mt-24">
            <AnswerMark
              tone={tone}
              label={`Q${seg.q + 1}`}
              question={questionText(seg.q)}
              active={shown[seg.q]}
              onClick={() => onOpen(seg.q)}
              variant={print ? "print" : "tint"}
              domain={domain}
            >
              {seg.text}
            </AnswerMark>
          </span>
        );
      if (italic) node = <em>{node}</em>;
      if (bold) node = <strong className="font-semibold text-fg-strong">{node}</strong>;
      return <Fragment key={seg.offset}>{node}</Fragment>;
    });

  let lastParagraph = -1;
  blocks.forEach((b, i) => {
    if (b.kind === "paragraph") lastParagraph = i;
  });
  return (
    <>
      {blocks.map((block, bi) => (
        <Fragment key={block.offset}>
          {block.kind === "paragraph" && (
            <p
              data-block={print ? bi : undefined}
              className={cn(print && "mb-4", print && bi === 0 && "drop-cap")}
            >
              {inline(block.segments)}
              {bi === lastParagraph && endMark}
              {/* Sits on the last line's baseline: photos line their foot up with it. */}
              {print && <span data-para-end aria-hidden="true" className="inline-block" />}
            </p>
          )}
          {block.kind === "list" &&
            (block.ordered ? (
              <ol className={cn("flex list-decimal flex-col gap-1 pl-5", print && "mb-3")}>
                {block.items.map((item, i) => (
                  <li key={item[0]?.offset ?? i}>{inline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul className={cn("flex list-disc flex-col gap-1 pl-5", print && "mb-3")}>
                {block.items.map((item, i) => (
                  <li key={item[0]?.offset ?? i}>{inline(item)}</li>
                ))}
              </ul>
            ))}
          {block.kind === "table" && (
            <div className={cn("-mx-1 overflow-x-auto", print && "mb-4 clear-both")}>
              <table
                className={cn(
                  "w-full min-w-[24rem] border-collapse text-sm",
                  print && "font-news tabular-nums",
                )}
              >
                {block.header && (
                  <thead>
                    <tr className="border-b border-line-strong text-left">
                      {block.header.map((cell, i) => (
                        <th
                          key={cell[0]?.offset ?? i}
                          scope="col"
                          className="px-2 py-1.5 align-top font-semibold text-fg-strong"
                        >
                          {inline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={row[0]?.[0]?.offset ?? ri} className="border-b border-line">
                      {row.map((cell, ci) => (
                        <td key={cell[0]?.offset ?? ci} className="px-2 py-1.5 align-top">
                          {inline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {bi === sentinelAfter && <div ref={setSentinel} aria-hidden="true" />}
          {after?.(bi)}
        </Fragment>
      ))}
    </>
  );
}
