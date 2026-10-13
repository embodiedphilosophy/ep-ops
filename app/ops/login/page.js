import LoginForm from './LoginForm';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return (
    <main className="ops-login">
      <img src="/brand/ep-wordmark-black.png" alt="Embodied Philosophy" width="170" />
      <h1>Team dashboard</h1>
      <p>Enter the email address we have on file for you. We’ll send a sign-in link.</p>
      {sp?.expired && <p className="ops-note">That link has expired. Request a new one below.</p>}
      <LoginForm />
    </main>
  );
}
