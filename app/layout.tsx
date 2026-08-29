import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Instrument_Sans,
} from "next/font/google";
import "./globals.css";
import "./secretary.css";
import SmartScrollHeader from "./components/SmartScrollHeader";
import MobileAppInstall from "./components/MobileAppInstall";
import GlobalFeedbackLauncher from "./components/GlobalFeedbackLauncher";

const instrumentSans = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    { media: "(prefers-color-scheme: light)", color: "#F7F5FB" },
    { media: "(prefers-color-scheme: dark)", color: "#181022" },
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
              "try{const r=document.documentElement,t=localStorage.getItem('vinkulo-theme'),d=t==='ESCURO'||(t!=='CLARO'&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.theme=d?'dark':'light';if(t==='CLARO'||t==='ESCURO')r.dataset.pilotTheme=t.toLowerCase();else delete r.dataset.pilotTheme;r.style.colorScheme=d?'dark':'light';const z=Number(localStorage.getItem('vinkulo:font-scale'));if(Number.isFinite(z)&&z>=.85&&z<=1.25){r.style.zoom=String(z);r.style.setProperty('--vinkulo-ui-scale',String(z));r.style.setProperty('--vinkulo-ui-scale-inverse',String(1/z));r.dataset.vinkuloScale=z>1?'ampliado':z<1?'reduzido':'normal'}}catch{}",
          }}
        />
      </head>
      <body
        className={`${instrumentSans.variable} ${bricolageGrotesque.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <SmartScrollHeader />
        {children}
        <GlobalFeedbackLauncher />
        <MobileAppInstall />
      </body>
    </html>
  );
}
