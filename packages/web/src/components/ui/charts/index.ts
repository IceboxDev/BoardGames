// Chart primitives — hand-rolled SVG/DOM, no chart library. Deliberately NOT
// re-exported from `components/ui/index.ts`: charts are heavier than the core
// primitives and every consumer (profile insight pages, Set trainer screens,
// the UI gallery) is lazy-loaded, so keeping them out of the shared barrel
// keeps them out of the shared chunk.

export { BarChartH } from "./BarChartH";
export { type ChartColumn, ColumnChart } from "./ColumnChart";
export { DonutChart } from "./DonutChart";
export { LineChart } from "./LineChart";
export { perfColor } from "./perf-color";
export { Sparkline } from "./Sparkline";
export { chartHex } from "./tone-hex";
export { useThemeVersion } from "./use-theme-version";
