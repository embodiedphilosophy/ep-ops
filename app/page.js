import { redirect } from 'next/navigation';
// ops.embodiedphilosophy.com → the dashboard (which sends teachers with onboarding to do on to /teach)
export default function Home() { redirect('/ops'); }
