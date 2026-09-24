import { Fragment, type ReactNode } from "react";
import type { BandTone } from "../../bands";
import { AnswerMark } from "../common/AnswerMark";
import { type ArticleBlock, type ArticleSegment, inlineRuns } from "./article-segments";

// Renders the segmented article: paragraphs, the closing reference table,
// bullet lists — with the five answers as interactive marks wherever they
// sit (running text, a table cell, a list item).

type Props = {
  blocks: readonly ArticleBlock[];
  tone: BandTone;
  questionText: (q: number) => string;
  shown: readonly boolean[];
  onOpen: (q: number) => void;
  /** Index of the block after which the read sentinel is placed. */
  sentinelAfter: number;
  setSentinel: (el: HTMLDivElement | null) => void;
};

export function ArticleBody({
  blocks,
  tone,
  questionText,
  shown,
  onOpen,
  sentinelAfter,
  setSentinel,
}: Props) {
  const inline = (segments: readonly ArticleSegment[]): ReactNode =>
    inlineRuns(segments).map(({ seg, bold, italic }) => {
      let node: ReactNode =
        seg.kind === "text" ? (
          seg.text
        ) : (
          <span id={`q${seg.q + 1}`} className="scroll-mt-24">
            <AnswerMark
              tone={tone}
              label={`Q${seg.q + 1}`}
              question={questionText(seg.q)}
              active={shown[seg.q]}
              onClick={() => onOpen(seg.q)}
            >
              {seg.text}
            </AnswerMark>
          </span>
        );
      if (italic) node = <em>{node}</em>;
      if (bold) node = <strong className="font-semibold text-fg-strong">{node}</strong>;
      return <Fragment key={seg.offset}>{node}</Fragment>;
    });

  return (
    <>
      {blocks.map((block, bi) => (
        <Fragment key={block.offset}>
          {block.kind === "paragraph" && <p>{inline(block.segments)}</p>}
          {block.kind === "list" &&
            (block.ordered ? (
              <ol className="flex list-decimal flex-col gap-1 pl-5">
                {block.items.map((item, i) => (
                  <li key={item[0]?.offset ?? i}>{inline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {block.items.map((item, i) => (
                  <li key={item[0]?.offset ?? i}>{inline(item)}</li>
                ))}
              </ul>
            ))}
          {block.kind === "table" && (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
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
        </Fragment>
      ))}
    </>
  );
}
