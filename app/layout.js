import './globals.css';

// ep-ops: the team dashboard (/ops) and teacher onboarding (/teach). No public-site nav, footer or support chat.
export const metadata = {
  title: 'Team — Embodied Philosophy',
  robots: { index: false, follow: false },
  metadataBase: new URL(process.env.OPS_URL || 'https://ops.embodiedphilosophy.com'),
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#FAF5EB' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body><main>{children}</main></body>
    </html>
  );
}
