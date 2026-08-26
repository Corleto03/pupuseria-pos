import LoginForm from "@/components/LoginForm";
import { getSession, HOME_BY_ROLE } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(HOME_BY_ROLE[user.rol] || "/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
