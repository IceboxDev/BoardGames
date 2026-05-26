import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Stub react-pdf so the test doesn't need a real worker. The mock records the
// `file` prop on the DOM so we can assert which booklet is being shown.
vi.mock("react-pdf", () => ({
  Document: ({ file, children }: { file: unknown; children?: ReactNode }) => (
    <div data-testid="pdf-doc" data-file={typeof file === "string" ? file : ""}>
      {children}
    </div>
  ),
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: {}, version: "test" },
}));

import { RulesViewer } from "./RulesViewer";

describe("RulesViewer", () => {
  it("renders a single PDF with no tab bar when `url` is a string", () => {
    render(<RulesViewer url="/rules.pdf" onClose={() => {}} />);
    expect(screen.getByTestId("pdf-doc").dataset.file).toBe("/rules.pdf");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("renders one tab per booklet when `url` is an array, defaulting to the first", () => {
    render(
      <RulesViewer
        url={[
          { label: "Rules", url: "/rules.pdf" },
          { label: "Flight Log", url: "/flight-log.pdf" },
        ]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Flight Log" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByTestId("pdf-doc").dataset.file).toBe("/rules.pdf");
  });

  it("clicking a tab switches the PDF and selection", async () => {
    render(
      <RulesViewer
        url={[
          { label: "Rules", url: "/rules.pdf" },
          { label: "Flight Log", url: "/flight-log.pdf" },
        ]}
        onClose={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Flight Log" }));
    expect(screen.getByTestId("pdf-doc").dataset.file).toBe("/flight-log.pdf");
    expect(screen.getByRole("tab", { name: "Flight Log" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "false");
  });
});
