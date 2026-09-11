const fs = require('fs');
const path = require('path');

const replacements = {
  'bg-[#FFFFFF]': 'bg-background',
  'bg-[#F8FAFC]': 'bg-surface',
  'bg-[#F1F5F9]': 'bg-surface-subtle',
  'text-[#0F172A]': 'text-foreground',
  'text-[#475569]': 'text-foreground-subtle',
  'text-[#94A3B8]': 'text-foreground-muted',
  'border-[#E2E8F0]': 'border-border',
  'bg-[#2563EB]': 'bg-primary',
  'text-[#2563EB]': 'text-primary',
  'border-[#2563EB]': 'border-primary',
  'bg-[#1D4ED8]': 'bg-primary-hover',
  'bg-[#3B82F6]': 'bg-primary-light',
  'text-[#3B82F6]': 'text-primary-light',
  'text-[#FFFFFF]': 'text-primary-foreground',
  // Some opacities might need updates
  'bg-[#2563EB]/15': 'bg-primary/15',
  'bg-[#2563EB]/10': 'bg-primary/10',
  'border-[#2563EB]/30': 'border-primary/30',
  'border-[#2563EB]/20': 'border-primary/20',
  'text-[#FFFFFF]/80': 'text-primary-foreground/80',
  'shadow-[#2563EB]/20': 'shadow-primary/20',
  'ring-[#2563EB]/50': 'ring-primary/50',
  'from-[#2563EB]/60': 'from-primary/60',
  'to-[#2563EB]/10': 'to-primary/10',
  'from-[#2563EB]/40': 'from-primary/40',
  'border-[#E2E8F0]/50': 'border-border/50',
  'border-[#E2E8F0]/30': 'border-border/30',
  'bg-[#E2E8F0]/50': 'bg-border/50',
  'shadow-[#2563EB]/30': 'shadow-primary/30',
  'hover:bg-[#1D4ED8]': 'hover:bg-primary-hover',
  'hover:bg-[#E2E8F0]/50': 'hover:bg-border/50',
  'hover:border-[#2563EB]/50': 'hover:border-primary/50',
  'hover:border-[#2563EB]/30': 'hover:border-primary/30',
  'hover:text-[#3B82F6]': 'hover:text-primary-light',
  'hover:text-[#FFFFFF]': 'hover:text-primary-foreground',
  'hover:bg-[#F1F5F9]': 'hover:bg-surface-subtle',
  'focus:border-[#2563EB]': 'focus:border-primary',
  'focus:ring-[#2563EB]/50': 'focus:ring-primary/50',
  'placeholder:text-[#E2E8F0]': 'placeholder:text-border',
  'to-[#FFFFFF]': 'to-background',
  'from-[#F8FAFC]': 'from-surface',
  'stroke="#FFFFFF"': 'stroke="currentColor"', // better for svgs
};

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  for (const [key, value] of Object.entries(replacements)) {
    // We want to replace exactly the string. Using split/join is safe.
    if (content.includes(key)) {
      content = content.split(key).join(value);
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));
