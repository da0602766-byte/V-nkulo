const fs = require('fs');
const path = require('path');

const replacements = {
  '#B25A33': '#2563EB', // primary
  '#D9784C': '#3B82F6', // primary light
  '#8F4526': '#1D4ED8', // primary dark
  '#0B0D10': '#FFFFFF', // bg main
  '#15181D': '#F8FAFC', // bg subtle
  '#1A1E24': '#F1F5F9', // bg subtle 2
  '#1A110D': '#F8FAFC', // gradient start in pricing
  '#2E353E': '#E2E8F0', // border
  '#EDF1F5': '#0F172A', // text main
  '#98A3B0': '#475569', // text secondary
  '#6B7C89': '#94A3B8', // text muted
  '#F9EBE3': '#FFFFFF', // light contrast
  'rgba(178,90,51': 'rgba(37,99,235', // rgba primary
  'rgba(255,255,255,0.05)': 'rgba(0,0,0,0.02)',
  'rgba(255,255,255,0.08)': 'rgba(0,0,0,0.04)',
  'shadow-black/50': 'shadow-slate-200/50',
  'shadow-black/10': 'shadow-slate-300/30'
};

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  for (const [key, value] of Object.entries(replacements)) {
    // Escape special regex characters
    const safeKey = key.replace(/[\[\]\(\)\/]/g, '\\$&');
    const regex = new RegExp(safeKey, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, value);
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
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.css')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));
