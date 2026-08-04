import './globals.css';
import Nav from '@/components/nav';

export const metadata = { title: 'Agent Foundry', description: 'Secure AI development control plane' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Nav/><main className="main-shell">{children}</main></body></html>;
}
