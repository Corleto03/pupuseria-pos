import { redirect } from "next/navigation";
import { getSession, HOME_BY_ROLE } from "@/lib/auth";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(HOME_BY_ROLE[user.rol] || "/mesas");
}
