import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Instrument_Sans,
} from "next/font/google";
import "./globals.css";
import "./interface-fixes.css";
import "./secretary.css";
import "./visitors.css";
import "./recepcao.css";
import "./landing-vinkulo.css";
import "./mobile-quick-actions.css";
import "./ministry-desktop.css";
import "./owner-workspace.css";
import "./owner-console.css"; // Isolated owner console design.
import "./feed-worship.css";
import "./community-surfaces.css";
import "./access.css";
import "./commerce.css";
import "./owner-reset.css";
import SmartScrollHeader from "./components/SmartScrollHeader";
import MobileAppInstall from "./components/MobileAppInstall";
import GlobalFeedbackLauncher from "./components/GlobalFeedbackLauncher";
import SystemExperienceController from "./components/SystemExperienceController";
import NativeNotificationSync from "./components/NativeNotificationSync";
import { THEME_BOOTSTRAP_SCRIPT } from "./lib/theme-preference";

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
              THEME_BOOTSTRAP_SCRIPT + "try{const r=document.documentElement;const z=Number(localStorage.getItem('vinkulo:font-scale'));if(Number.isFinite(z)&&z>=.85&&z<=1.25){r.style.zoom=String(z);r.style.setProperty('--vinkulo-ui-scale',String(z));r.style.setProperty('--vinkulo-ui-scale-inverse',String(1/z));r.dataset.vinkuloScale=z>1?'ampliado':z<1?'reduzido':'normal'}const g=Number(localStorage.getItem('vinkulo:glass-opacity'));if(Number.isFinite(g)&&g>=55&&g<=88)r.style.setProperty('--vinkulo-glass-alpha',String(g/100));if(localStorage.getItem('vinkulo:data-saver')==='true')r.dataset.dataSaver='true'}catch{}",
          }}
        />
      </head>
      <body
        className={`${instrumentSans.variable} ${bricolageGrotesque.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <a className="skip-to-content" href="#main-content">Pular para o conteúdo principal</a>
        <SmartScrollHeader />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <SystemExperienceController />
        <NativeNotificationSync />
        <GlobalFeedbackLauncher />
        <MobileAppInstall />
      </body>
    </html>
  );
}
