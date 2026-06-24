import { PageHeader } from "../ui/PageHeader";

// The setup-screen hero. A thin `PageHeader` preset (centered, xl) so setup
// titles share the app's single heading primitive instead of a parallel
// hand-rolled <h2>. The fixed-height scroll container is SetupLayout's job —
// this owns only the title block (no PageMain).
export function SetupHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <PageHeader align="center" size="xl" title={title} subtitle={subtitle} className="mb-10" />
  );
}
