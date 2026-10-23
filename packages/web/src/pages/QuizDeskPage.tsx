import { QuizDesk } from "../components/admin/quiz-desk/QuizDesk";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { PageHeader, PageMain, PageShell } from "../components/ui";

/** `/admin/quiz-desk` — the quiz bank's provenance desk (admin only, via `AuthLayout mode="admin"`). */
export default function QuizDeskPage() {
  return (
    <PageShell topNav={<TopNav back={<TopNavBackButton to="/admin?tab=reports" />} />}>
      <PageMain width="7xl" padding="dense">
        <PageHeader title="Quiz desk" className="mb-4" />
        <QuizDesk />
      </PageMain>
    </PageShell>
  );
}
