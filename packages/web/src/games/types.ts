import type { ComponentType, LazyExoticComponent } from "react";

export interface AccentColor {
  border: string;
  hoverBg: string;
  arrow: string;
  gradient: string;
}

export interface GameDefinition {
  slug: string;
  title: string;
  description: string;
  thumbnail: string;
  backgroundImage?: string;
  accentColor: AccentColor;
  component: LazyExoticComponent<ComponentType>;
  mode: "remote" | "local";
}
