import LoginForm from './LoginForm';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return (
    <main className="ops-login">
      <a href="/ops" className="t-brand">Embodied <span>Philosophy</span></a>
      <h1>Team &amp; teachers</h1>
      <p>Sign in with the email address we have on file for you, whether you’re on the EP team or teaching with us. We’ll send you a sign-in link.</p>
      {sp?.expired && <p className="ops-note">That link has expired. Request a new one below.</p>}
      <LoginForm />
    </main>
  );
}
