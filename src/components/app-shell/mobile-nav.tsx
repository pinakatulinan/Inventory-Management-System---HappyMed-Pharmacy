"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { BrandWordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NavSection } from "@/lib/nav";

export function MobileNav({
  sections,
  pharmacyName,
  expiringCount,
}: {
  sections: NavSection[];
  pharmacyName: string;
  expiringCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu aria-hidden />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle asChild>
            <BrandWordmark pharmacyName={pharmacyName} subtitle={null} />
          </SheetTitle>
        </SheetHeader>

        <SidebarNav
          sections={sections}
          expiringCount={expiringCount}
          // Close the drawer once a destination is chosen.
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
