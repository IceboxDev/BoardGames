# Board Games

A collection of browser-based board games built with React, TypeScript, and Tailwind CSS.

## Games

- **Pandemic** — Cooperative disease-fighting board game with an interactive world map
- **Exploding Kittens** — A strategic kitty-powered card game of luck and betrayal
- **Set** — Find matching patterns in a grid of shape cards

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to play.

## Production Build

```bash
npm run build
npm run preview
```

## Adding a New Game

1. Create a folder under `src/games/` (e.g. `src/games/my-game/`)
2. Build your game as a React component (e.g. `MyGame.tsx`)
3. Create an `index.ts` that default-exports a `GameDefinition`:

```typescript
import { lazy } from "react";
import type { GameDefinition } from "../types";

export default {
  slug: "my-game",
  title: "My Game",
  description: "A short description",
  thumbnail: "",
  component: lazy(() => import("./MyGame")),
} satisfies GameDefinition;
```

The home menu and routing update automatically — no other files need to change.

## Tech Stack

- [Vite](https://vite.dev) — build tool
- [React](https://react.dev) — UI framework
- [TypeScript](https://www.typescriptlang.org) — type safety
- [Tailwind CSS](https://tailwindcss.com) — styling
- [React Router](https://reactrouter.com) — client-side routing
