import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'WeDo Cleaning Services | A Fresher Sydney Starts Here',description:'We do clean. You do life. Home, end of lease and commercial cleaning in Sydney, with care in every corner.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body className="antialiased">{children}</body></html>}
