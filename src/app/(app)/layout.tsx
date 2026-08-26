import { MobileNav } from "@/components/app-shell/mobile-nav";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { BrandWordmark } from "@/components/brand";
import { requireUser } from "@/lib/auth/session";
import { navigationFor } from "@/lib/nav";
import { countBatchesNeedingAttention } from "@/lib/queries/expiry";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The real authentication check. The proxy only sees whether a cookie
  // exists; this validates it against the database.
  const user = await requireUser();

  const settings = await getSettings();
  const sections = navigationFor(user.role);
  const expiringCount = await countBatchesNeedingAttention(settings);

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <BrandWordmark
            pharmacyName={settings.pharmacyName}
            subtitle={null}
          />
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <SidebarNav sections={sections} expiringCount={expiringCount} />
        </div>

        <div className="border-t p-2">
          <UserMenu name={user.name} email={user.email} role={user.role} />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-2 border-b bg-background px-4 lg:hidden">
          <MobileNav
            sections={sections}
            pharmacyName={settings.pharmacyName}
            expiringCount={expiringCount}
          />
          <BrandWordmark
            pharmacyName={settings.pharmacyName}
            subtitle={null}
          />
        </header>

        <main className="flex-1 bg-secondary/40 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
