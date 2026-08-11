import'./globals.css';import'./command-center.css';import'./nav-extra.css';import Nav from'@/components/nav';
export const metadata={title:'Gizmo Command Center',description:'Gizmo OS operational command center'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Nav/><main className="main-shell">{children}</main></body></html>}
