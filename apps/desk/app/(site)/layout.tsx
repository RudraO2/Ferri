import { SiteFooter } from "./_components/site-footer";
import { SiteNav } from "./_components/site-nav";

// Rendered per request, so newly added character art shows without a rebuild.
export const dynamic = "force-dynamic";

/** The public site: the landing page and its sibling pages share one nav and footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site overflow-x-clip">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
