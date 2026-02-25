import { LoginCard } from "@/components/login-card";

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const errorCode = searchParams?.error || null;
  const next = searchParams?.next || null;
  return <LoginCard errorCode={errorCode} next={next} />;
}
