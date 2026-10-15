import './invite.css';
export const metadata = { title: 'Invitation — Embodied Philosophy', robots: { index: false, follow: false } };
export default function InviteLayout({ children }) {
  return <div className="inv-root"><header className="inv-top"><img src="/brand/ep-wordmark-black.png" alt="Embodied Philosophy" height="28" /></header><main className="inv">{children}</main></div>;
}
