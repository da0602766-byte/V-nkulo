import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./secretary.css";
import SmartScrollHeader from "./components/SmartScrollHeader";
import MobileAppInstall from "./components/MobileAppInstall";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VÍNKULO | Gestão para igrejas e comunidades",
  description:
    "Plataforma de gestão, comunicação e organização para igrejas, comunidades e ministérios.",
  robots: {
    index: false,
    follow: false,
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/vinkulo-app-icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Vínkulo",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1722" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('vinkulo-theme');if(t==='CLARO'||t==='ESCURO'){document.documentElement.dataset.pilotTheme=t.toLowerCase();document.documentElement.style.colorScheme=t==='ESCURO'?'dark':'light'}else{document.documentElement.style.colorScheme='light dark'}}catch{}",
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SmartScrollHeader />
        {children}
        <MobileAppInstall />
      </body>
    </html>
  );
}
