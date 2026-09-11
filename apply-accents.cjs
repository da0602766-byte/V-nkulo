const fs = require('fs');

let landing = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// Hero section updates
landing = landing.replace(
  '<span className="text-primary-light">comunidade</span>',
  '<span className="text-accent">comunidade</span>'
);

landing = landing.replace(
  'bg-primary/15 border border-primary/30 rounded-full px-4 py-1.5 mb-8',
  'bg-yellow/15 border border-yellow/30 rounded-full px-4 py-1.5 mb-8'
);
landing = landing.replace(
  '<span className="w-1.5 h-1.5 rounded-full bg-primary-light animate-pulse" />',
  '<span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />'
);
landing = landing.replace(
  '<span className="text-xs font-bold tracking-widest uppercase text-primary-light">',
  '<span className="text-xs font-bold tracking-widest uppercase text-yellow">'
);

// Fio do Dia visual update (desktop)
landing = landing.replace(
  'w-[1px] h-full bg-gradient-to-b from-primary/60 to-primary/10 pointer-events-none hidden md:block animate-drawLine',
  'w-[1px] h-full bg-gradient-to-b from-accent/60 to-accent/10 pointer-events-none hidden md:block animate-drawLine'
);
landing = landing.replace(
  '<span className="text-primary-light">sua comunidade</span>',
  '<span className="text-accent">sua comunidade</span>'
);
landing = landing.replace(
  'w-[1px] bg-gradient-to-b from-transparent via-primary/40 to-transparent -translate-x-1/2 pointer-events-none hidden md:block',
  'w-[1px] bg-gradient-to-b from-transparent via-accent/40 to-transparent -translate-x-1/2 pointer-events-none hidden md:block'
);

// Mobile Fio do Dia Card
landing = landing.replace(
  '<div className="w-0.5 h-16 bg-primary" />',
  '<div className="w-0.5 h-16 bg-accent" />'
);
landing = landing.replace(
  '<div className="w-3.5 h-3.5 rounded-full bg-primary shadow-primary/20 shrink-0 z-10 animate-pulse-glow" />',
  '<div className="w-3.5 h-3.5 rounded-full bg-accent shadow-accent/20 shrink-0 z-10 animate-pulse-glow" style={{ boxShadow: "0 0 16px 4px rgba(249,115,22,0.3)" }} />'
);
landing = landing.replace(
  '<div className="w-[1px] h-32 border-l-2 border-dashed border-primary/30" />',
  '<div className="w-[1px] h-32 border-l-2 border-dashed border-accent/30" />'
);

// Agora event highlight
landing = landing.replace(
  'cor: "text-primary",\n                  bg: "bg-primary/15"',
  'cor: "text-accent",\n                  bg: "bg-accent/15"'
);
landing = landing.replace(
  'ev.now\n                      ? "bg-primary/10 border border-primary/30 p-4 -ml-2"',
  'ev.now\n                      ? "bg-accent/10 border border-accent/30 p-4 -ml-2"'
);
landing = landing.replace(
  '${ev.now ? \'text-primary-light\' : \'text-foreground-muted\'}',
  '${ev.now ? \'text-accent\' : \'text-foreground-muted\'}'
);

// Section labels 
landing = landing.split('text-primary').join('text-primary'); // keep some blue, let's keep SectionLabel as Blue but let's change Mais Popular
// wait, SectionLabel has text-primary. Let's make it text-primary.

// Mais popular tag
landing = landing.replace(
  '<div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground font-bold text-xs tracking-widest uppercase px-5 py-1.5 rounded-full">',
  '<div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow text-[#0F172A] font-bold text-xs tracking-widest uppercase px-5 py-1.5 rounded-full">'
);
landing = landing.replace(
  'p.destaque\n                  ? "bg-gradient-to-b from-surface to-background border-2 border-primary shadow-2xl shadow-primary/20 md:-mt-4"',
  'p.destaque\n                  ? "bg-gradient-to-b from-surface to-background border-2 border-yellow shadow-2xl shadow-yellow/20 md:-mt-4"'
);

fs.writeFileSync('src/pages/LandingPage.tsx', landing);


let reception = fs.readFileSync('src/pages/ReceptionPage.tsx', 'utf8');

reception = reception.replace(
  '<div className="w-[1px] h-[35%] bg-gradient-to-b from-transparent to-primary/50 animate-drawLine" />',
  '<div className="w-[1px] h-[35%] bg-gradient-to-b from-transparent to-accent/50 animate-drawLine" />'
);
reception = reception.replace(
  '<div className="w-[1px] h-[65%] border-l border-dashed border-primary/20" />',
  '<div className="w-[1px] h-[65%] border-l border-dashed border-accent/20" />'
);
reception = reception.replace(
  '<div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse-glow" />',
  '<div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse-glow" style={{ boxShadow: "0 0 16px 4px rgba(249,115,22,0.3)" }} />'
);
reception = reception.replace(
  '<p className="text-xs font-bold tracking-widest uppercase text-primary-light">',
  '<p className="text-xs font-bold tracking-widest uppercase text-yellow">'
);
reception = reception.replace(
  'bg-primary/10 border border-primary/20',
  'bg-yellow/10 border border-yellow/20'
);
reception = reception.replace(
  '<span className="text-primary-light">conectada</span>',
  '<span className="text-accent">conectada</span>'
);
reception = reception.replace(
  'tab === t ? "text-foreground border-primary-light" : "text-foreground-muted border-transparent hover:text-foreground-subtle"',
  'tab === t ? "text-foreground border-accent" : "text-foreground-muted border-transparent hover:text-foreground-subtle"'
);

fs.writeFileSync('src/pages/ReceptionPage.tsx', reception);

let vinkuloMark = `function VinkuloMark({ light, size = 28 }: { light?: boolean; size?: number }) {
  const bg = light ? "#FFFFFF" : "var(--primary)";
  const fg = light ? "var(--primary)" : "#FFFFFF";
  const accent = "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="8" fill={bg} />
      <line x1="14" y1="5" x2="14" y2="12" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.5" fill={accent} />
      <line x1="14" y1="16" x2="14" y2="23" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2" />
      <line x1="7" y1="14" x2="11" y2="14" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="17" y1="14" x2="21" y2="14" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6" cy="14" r="1.5" fill={fg} opacity="0.6" />
      <circle cx="22" cy="14" r="1.5" fill={fg} opacity="0.6" />
    </svg>
  );
}`;

let landing2 = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');
landing2 = landing2.replace(/function VinkuloMark[\s\S]*?<\/svg>\n\s*\);\n}/, vinkuloMark);
fs.writeFileSync('src/pages/LandingPage.tsx', landing2);

let reception2 = fs.readFileSync('src/pages/ReceptionPage.tsx', 'utf8');
reception2 = reception2.replace(/function VinkuloMark\(\) {[\s\S]*?<\/svg>\n\s*\);\n}/, `function VinkuloMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="8" fill="var(--primary)" />
      <line x1="14" y1="5" x2="14" y2="12" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.5" fill="var(--accent)" />
      <line x1="14" y1="16" x2="14" y2="23" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2" />
      <line x1="7" y1="14" x2="11" y2="14" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="17" y1="14" x2="21" y2="14" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6" cy="14" r="1.5" fill="#FFFFFF" opacity="0.6" />
      <circle cx="22" cy="14" r="1.5" fill="#FFFFFF" opacity="0.6" />
    </svg>
  );
}`);
fs.writeFileSync('src/pages/ReceptionPage.tsx', reception2);
