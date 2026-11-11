import { useQuery } from "@tanstack/react-query";
import { qk } from "../lib/query-keys";
import { adminFetchMemorialPreview } from "../lib/site";
import GoodbyePage from "./GoodbyePage";

/** `/goodbye` — the admin's look at the goodbye screen while the site is
 *  still awake, with the totals hibernating now would freeze. */
export default function GoodbyePreviewPage() {
  const { data } = useQuery({
    queryKey: qk.adminSitePreview(),
    queryFn: ({ signal }) => adminFetchMemorialPreview(signal),
  });
  return <GoodbyePage memorial={data ?? null} onlineAccess admin preview />;
}
