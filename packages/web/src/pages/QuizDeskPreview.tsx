import { QuizDeskApiProvider } from "../components/admin/quiz-desk/api";
import { fixtureQuizDeskApi } from "../components/admin/quiz-desk/fixtures";
import { QuizDesk } from "../components/admin/quiz-desk/QuizDesk";
import { TopNav } from "../components/TopNav";
import { PageHeader, PageMain, PageShell } from "../components/ui";

// Dev-only preview of the admin Quiz desk over fixtures (schema-parsed), no
// auth or server — for screenshots at laptop and phone width:
//   /dev/quiz-desk?tab=overview|backlog|retired|provenance[&article=a0001|a0042]

export default function QuizDeskPreview() {
  return (
    <QuizDeskApiProvider value={fixtureQuizDeskApi}>
      <PageShell topNav={<TopNav />}>
        <PageMain width="7xl" padding="dense">
          <PageHeader title="Quiz desk" className="mb-4" />
          <QuizDesk />
        </PageMain>
      </PageShell>
    </QuizDeskApiProvider>
  );
}
