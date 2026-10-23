import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleImage } from "./ArticleImage";

const IMAGE = {
  url: "https://upload.wikimedia.org/x.jpg",
  pageUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
  alt: {
    en: "Bertolt Brecht in 1954",
    de: "Bertolt Brecht 1954",
    ru: "Бертольт Брехт в 1954 году",
  },
  caption: {
    en: "Brecht wrote the Kinderhymne.",
    de: "Brecht schrieb die Kinderhymne.",
    ru: "Брехт написал «Детский гимн».",
  },
  credit: "Bundesarchiv",
};

describe("ArticleImage", () => {
  it("shows the picture with its caption and credit in the reader's language", () => {
    render(<ArticleImage image={IMAGE} lang="ru" />);
    const img = screen.getByRole("img", { name: "Бертольт Брехт в 1954 году" });
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(screen.getByText(/Брехт написал/)).toBeInTheDocument();
    expect(screen.getByText(/Bundesarchiv/)).toBeInTheDocument();
  });

  it("disappears when the picture fails to load", () => {
    const { container } = render(<ArticleImage image={IMAGE} lang="en" variant="thumb" />);
    fireEvent.error(screen.getByRole("img"));
    expect(container).toBeEmptyDOMElement();
  });
});
