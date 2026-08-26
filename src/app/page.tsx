import { redirect } from "next/navigation";

export default function RootPage() {
  // The dashboard is the real front door; the layout there handles auth.
  redirect("/dashboard");
}
