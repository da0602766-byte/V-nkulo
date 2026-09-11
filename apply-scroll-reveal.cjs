const fs = require('fs');

let landing = fs.readFileSync('src/pages/LandingPage.tsx', 'utf8');

// Add import
if (!landing.includes('import ScrollReveal')) {
  landing = landing.replace(
    'import { useState } from "react";',
    'import { useState } from "react";\nimport ScrollReveal from "../components/ScrollReveal";'
  );
}

// 1. Números Section
landing = landing.replace(
  '<div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">',
  '<ScrollReveal className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">'
);
landing = landing.replace(
  '</div>\n      </section>\n\n      {/* MÓDULOS */}',
  '</ScrollReveal>\n      </section>\n\n      {/* MÓDULOS */}'
);

// 2. Módulos Section
landing = landing.replace(
  '<div className="text-center md:text-left mb-12">',
  '<ScrollReveal className="text-center md:text-left mb-12">'
);
landing = landing.replace(
  '</p>\n        </div>\n\n        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">',
  '</p>\n        </ScrollReveal>\n\n        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">'
);

// Módulos items (wrap each card in a ScrollReveal)
landing = landing.replace(
  /\{MODULES\.map\(\(m\) => \(\s*<div\s*key=\{m\.label\}/g,
  '{MODULES.map((m, idx) => (\n            <ScrollReveal key={m.label} delay={idx * 100}>\n              <div'
);
// We need to close the ScrollReveal for modules
landing = landing.replace(
  /\{m\.desc\}\n\s*<\/div>\n\s*<\/div>\n\s*\)\)}/g,
  '{m.desc}\n              </div>\n            </div>\n            </ScrollReveal>\n          ))}'
);

// 3. Fio Section
landing = landing.replace(
  '<div className="relative max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">\n          <div>',
  '<div className="relative max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">\n          <ScrollReveal direction="right">'
);
landing = landing.replace(
  '</ul>\n          </div>\n\n          {/* Fio ilustrado (Mobile UI Demo) */}',
  '</ul>\n          </ScrollReveal>\n\n          {/* Fio ilustrado (Mobile UI Demo) */}'
);
landing = landing.replace(
  '<div className="bg-surface border border-border rounded-[2rem] p-6 flex gap-5 shadow-2xl relative">',
  '<ScrollReveal direction="left" delay={200}>\n          <div className="bg-surface border border-border rounded-[2rem] p-6 flex gap-5 shadow-2xl relative">'
);
landing = landing.replace(
  '</div>\n          </div>\n        </div>\n      </section>',
  '</div>\n          </div>\n          </ScrollReveal>\n        </div>\n      </section>'
);

// 4. Papéis Section
landing = landing.replace(
  '<div className="text-center mb-16">\n          <SectionLabel>Para quem é</SectionLabel>',
  '<ScrollReveal className="text-center mb-16">\n          <SectionLabel>Para quem é</SectionLabel>'
);
landing = landing.replace(
  '</h2>\n        </div>\n\n        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">',
  '</h2>\n        </ScrollReveal>\n\n        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">'
);
// Wrap papéis cards
landing = landing.replace(
  /\{\[\s*\{\s*role: "Pastor e liderança"[\s\S]*?\]\.map\(\(r\) => \(\s*<div key=\{r\.role\}/,
  (match) => match.replace('].map((r) => (\n            <div key={r.role}', '].map((r, idx) => (\n            <ScrollReveal key={r.role} delay={idx * 150}>\n            <div')
);
landing = landing.replace(
  /\{item\}\n\s*<\/span>\n\s*<\/li>\n\s*\)\)}\n\s*<\/ul>\n\s*<\/div>\n\s*\)\)}/g,
  '{item}\n                    </span>\n                  </li>\n                ))}\n              </ul>\n            </div>\n            </ScrollReveal>\n          ))}'
);

// 5. Depoimentos Section
landing = landing.replace(
  '<div className="max-w-7xl mx-auto text-center mb-16">\n          <SectionLabel>Depoimentos</SectionLabel>',
  '<ScrollReveal className="max-w-7xl mx-auto text-center mb-16">\n          <SectionLabel>Depoimentos</SectionLabel>'
);
landing = landing.replace(
  '</h2>\n        </div>\n\n        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">',
  '</h2>\n        </ScrollReveal>\n\n        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">'
);
landing = landing.replace(
  /\{DEPOIMENTOS\.map\(\(d\) => \(\s*<div key=\{d\.nome\}/g,
  '{DEPOIMENTOS.map((d, idx) => (\n            <ScrollReveal key={d.nome} delay={idx * 150}>\n            <div'
);
landing = landing.replace(
  /\{d\.cargo\} · \{d\.igreja\}<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*\)\)}/g,
  '{d.cargo} · {d.igreja}</div>\n                </div>\n              </div>\n            </div>\n            </ScrollReveal>\n          ))}'
);

// 6. Planos Section
landing = landing.replace(
  '<div className="text-center mb-16">\n          <SectionLabel>Planos</SectionLabel>',
  '<ScrollReveal className="text-center mb-16">\n          <SectionLabel>Planos</SectionLabel>'
);
landing = landing.replace(
  '</p>\n        </div>\n\n        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">',
  '</p>\n        </ScrollReveal>\n\n        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">'
);
landing = landing.replace(
  /\{PLANOS\.map\(\(p\) => \(\s*<div\s*key=\{p\.nome\}/g,
  '{PLANOS.map((p, idx) => (\n            <ScrollReveal key={p.nome} delay={idx * 150}>\n            <div'
);
landing = landing.replace(
  /\{p\.cta\}\n\s*<\/button>\n\s*<\/div>\n\s*\)\)}/g,
  '{p.cta}\n              </button>\n            </div>\n            </ScrollReveal>\n          ))}'
);

// 7. FAQ Section
landing = landing.replace(
  '<div className="text-center mb-12">\n          <SectionLabel>Dúvidas</SectionLabel>',
  '<ScrollReveal className="text-center mb-12">\n          <SectionLabel>Dúvidas</SectionLabel>'
);
landing = landing.replace(
  '</h2>\n        </div>\n\n        <div className="flex flex-col gap-4">',
  '</h2>\n        </ScrollReveal>\n\n        <div className="flex flex-col gap-4">'
);
landing = landing.replace(
  /\{\[\s*\{\s*q: "Preciso instalar[\s\S]*?\]\.map\(\(faq, i\) => \(\s*<div key=\{i\}/,
  (match) => match.replace('].map((faq, i) => (\n            <div key={i}', '].map((faq, i) => (\n            <ScrollReveal key={i} delay={i * 100}>\n            <div')
);
landing = landing.replace(
  /\{faq\.a\}\n\s*<\/p>\n\s*<\/div>\n\s*<\/div>\n\s*\)\)}/g,
  '{faq.a}\n                </p>\n              </div>\n            </div>\n            </ScrollReveal>\n          ))}'
);

// 8. CTA Final
landing = landing.replace(
  '<div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">',
  '<ScrollReveal className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">'
);
landing = landing.replace(
  'Criar conta grátis →\n          </button>\n        </div>\n      </section>',
  'Criar conta grátis →\n          </button>\n        </ScrollReveal>\n      </section>'
);

fs.writeFileSync('src/pages/LandingPage.tsx', landing);
