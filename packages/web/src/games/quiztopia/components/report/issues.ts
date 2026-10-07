import type { ReportIssue, ReportStatus } from "@boardgames/core/protocol";
import type { CoreTone } from "../../../../components/ui";

// The words for report issues and statuses — shared by the report form, the
// member's report list and the admin queue. The vocabulary itself (which
// issues exist, which fit a question or an article) is the protocol's.

export interface IssueCopy {
  label: string;
  /** One line under the label in the picker. */
  hint: string;
  /** The details field's placeholder, asking for what helps most. */
  placeholder: string;
}

export const ISSUE_COPY: Record<ReportIssue, IssueCopy> = {
  "wrong-answer": {
    label: "Wrong answer",
    hint: "The answer is incorrect, outdated or incomplete.",
    placeholder: "What should the answer be? A link or source helps.",
  },
  "unclear-question": {
    label: "Unclear or wrong question",
    hint: "Ambiguous, misleading, or asks about something untrue.",
    placeholder: "What's confusing — or what should it ask?",
  },
  typo: {
    label: "Typo or formatting",
    hint: "Spelling, grammar, punctuation or a garbled character.",
    placeholder: "Quote the word or phrase that's wrong.",
  },
  translation: {
    label: "Translation mismatch",
    hint: "English and German say different things, or one reads badly.",
    placeholder: "Which version is right, and what's off in the other?",
  },
  "wrong-date": {
    label: "Wrong timeline date",
    hint: "The date this question pins to your timeline is off.",
    placeholder: "What's the right date? A source helps.",
  },
  "bad-source": {
    label: "Bad source link",
    hint: "Broken, irrelevant, or doesn't back up the answer.",
    placeholder: "What's wrong with it? A better source is welcome.",
  },
  "factual-error": {
    label: "Factual error",
    hint: "The article states something that isn't true.",
    placeholder: "Quote the sentence and say what's wrong with it.",
  },
  "wrong-highlight": {
    label: "Answer highlighted in the wrong place",
    hint: "The marked passage doesn't actually give the answer.",
    placeholder: "Which question, and where does the text really answer it?",
  },
  other: {
    label: "Something else",
    hint: "Anything not listed — describe it below.",
    placeholder: "What's wrong? (required)",
  },
};

export const STATUS_COPY: Record<ReportStatus, { label: string; tone: CoreTone | "neutral" }> = {
  open: { label: "Under review", tone: "amber" },
  fixed: { label: "Fixed", tone: "emerald" },
  declined: { label: "Declined", tone: "neutral" },
};
