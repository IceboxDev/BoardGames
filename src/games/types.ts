import type { ComponentType, LazyExoticComponent } from "react";

export interface GameDefinition {
  slug: string;
  title: string;
  description: string;
  thumbnail: string;
  component: LazyExoticComponent<ComponentType>;
}
