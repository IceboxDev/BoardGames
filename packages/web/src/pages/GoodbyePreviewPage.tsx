import GoodbyePage from "./GoodbyePage";

/** `/goodbye` — the admin's look at the goodbye screen while the site is
 *  still awake. */
export default function GoodbyePreviewPage() {
  return <GoodbyePage onlineAccess admin preview />;
}
