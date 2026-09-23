import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function compile(path, globals = {}, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Event, ...globals, require: name => {
    if (!(name in dependencies)) throw new Error(`Dependência inesperada: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
function themeEnvironment({ dark = false, blocked = false, values = {} } = {}) {
  const events = new EventTarget();
  const media = new EventTarget();
  media.matches = dark;
  const stored = new Map(Object.entries(values));
  const localStorage = {
    getItem(key) { if (blocked) throw Error('blocked'); return stored.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('blocked'); stored.set(key, value); },
    removeItem(key) { if (blocked) throw Error('blocked'); stored.delete(key); },
  };
  const root = { dataset: {}, style: {}, removeAttribute(name) { if (name === 'data-pilot-theme') delete this.dataset.pilotTheme; } };
  const window = { localStorage, matchMedia: () => media, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) };
  const globals = { window, document: { documentElement: root }, localStorage, matchMedia: window.matchMedia };
  return { api: compile('app/lib/theme-preference.ts', globals), root, stored, media, events, globals };
}

test('tema: bootstrap e hidratação concordam com preferência explícita, automática e antiga', () => {
  for (const [values, dark, expected] of [
    [{ 'vinkulo-theme': 'CLARO' }, true, 'light'],
    [{ 'vinkulo-theme': 'ESCURO' }, false, 'dark'],
    [{ 'vinkulo-theme': 'AUTO', 'vinkulo-login-theme': 'escuro' }, false, 'light'],
    [{ 'vinkulo-login-theme': 'escuro' }, false, 'dark'],
    [{ 'vinkulo-theme': 'inválido' }, true, 'dark'],
  ]) {
    const f = themeEnvironment({ values, dark });
    vm.runInNewContext(f.api.THEME_BOOTSTRAP_SCRIPT, f.globals);
    const before = f.api.getThemeSnapshot();
    assert.equal(f.root.dataset.theme, expected);
    f.api.applyTheme(f.api.readThemePreference());
    assert.equal(f.api.getThemeSnapshot(), before);
    assert.equal(f.root.style.colorScheme, expected);
  }
});

test('tema: controles recebem a mesma atualização e preservam preferências pessoais', () => {
  const f = themeEnvironment();
  let first = '', second = '';
  const stopFirst = f.api.subscribeThemePreference(() => { first = f.api.getThemeSnapshot(); });
  const stopSecond = f.api.subscribeThemePreference(() => { second = f.api.getThemeSnapshot(); });
  f.api.saveThemePreference('ESCURO', ' Pessoa@Example.test ');
  assert.equal(first, 'ESCURO:dark'); assert.equal(second, first);
  assert.equal(f.stored.get('vinkulo:theme:pessoa@example.test'), 'ESCURO');
  f.api.saveThemePreference('CLARO', 'outra@example.test');
  assert.equal(f.api.readThemePreference('pessoa@example.test'), 'ESCURO');
  assert.equal(f.api.readThemePreference('outra@example.test'), 'CLARO');
  assert.equal(f.api.readThemePreference(), 'CLARO');
  stopFirst(); stopSecond();
});

test('tema: armazenamento bloqueado não impede a primeira pintura nem a troca', () => {
  const f = themeEnvironment({ blocked: true, dark: true });
  vm.runInNewContext(f.api.THEME_BOOTSTRAP_SCRIPT, f.globals);
  assert.equal(f.root.dataset.theme, 'dark');
  assert.doesNotThrow(() => f.api.saveThemePreference('CLARO'));
  assert.equal(f.api.readThemePreference(), 'CLARO');
  assert.equal(f.root.style.colorScheme, 'light');
});

test('tema: acompanha o sistema apenas em AUTO e recebe mudanças de outra aba', () => {
  const f = themeEnvironment();
  const stop = f.api.subscribeThemePreference(() => {});
  f.api.applyTheme('AUTO');
  f.media.matches = true; f.media.dispatchEvent(new Event('change'));
  assert.equal(f.root.dataset.theme, 'dark');
  f.api.saveThemePreference('CLARO');
  f.media.dispatchEvent(new Event('change'));
  assert.equal(f.root.dataset.theme, 'light');
  f.stored.set('vinkulo-theme', 'ESCURO');
  const storage = new Event('storage'); Object.defineProperty(storage, 'key', { value: 'vinkulo-theme' });
  f.events.dispatchEvent(storage);
  assert.equal(f.root.dataset.theme, 'dark');
  f.api.saveThemePreference('AUTO');
  assert.equal(f.root.dataset.pilotTheme, undefined);
  stop(); f.media.matches = false; f.media.dispatchEvent(new Event('change'));
  assert.equal(f.root.dataset.theme, 'dark', 'remove listeners ao desmontar');
});

function contrast(a, b) {
  const luminance = hex => {
    const value = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
    const linear = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function palettes(path, marker) {
  const css = read(path);
  return [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(match => match[2].includes(marker))
    .map(match => Object.fromEntries([...match[2].matchAll(/(--[\w-]+)\s*:\s*(#[\da-fA-F]{3,6})\s*[;}]/g)].map(m => [m[1], m[2]])));
}
test('contraste: tokens de texto, ação e foco atendem os limites nas duas paletas', () => {
  for (const [path, marker, prefix, pairs] of [
    ['app/interface-fixes.css', '--auth-canvas:', 'auth', [['ink', 'surface'], ['muted', 'surface'], ['muted', 'input'], ['link', 'surface'], ['on-action', 'action'], ['line', 'input', 3]]],
    ['app/landing-vinkulo.css', '--lp-bg:', 'lp', [['text', 'bg'], ['subtle', 'surface'], ['muted', 'surface'], ['blue', 'surface'], ['orange', 'bg', 3], ['on-action', 'action'], ['focus', 'bg', 3]]],
  ]) {
    let resolved = {};
    const variants = palettes(path, marker);
    assert.equal(variants.length, 2, path);
    for (const variant of variants) {
      resolved = { ...resolved, ...variant };
      for (const [fg, bg, minimum = 4.5] of pairs) {
        const ratio = contrast(resolved[`--${prefix}-${fg}`], resolved[`--${prefix}-${bg}`]);
        assert.ok(ratio >= minimum, `${path} ${fg}/${bg}: ${ratio.toFixed(2)} < ${minimum}`);
      }
    }
  }
});

function carousel() {
  const states = [], effects = [], jobs = new Map(), media = new EventTarget(), document = new EventTarget();
  let stateIndex = 0, effectIndex = 0, nextJob = 0;
  document.visibilityState = 'visible'; media.matches = false;
  const react = {
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useEffect(callback, deps) { const i = effectIndex++; const previous = effects[i]; if (!previous || deps.some((v, j) => v !== previous.deps[j])) { previous?.cleanup?.(); effects[i] = { deps, callback }; } },
  };
  const jsx = (type, props) => ({ type, props });
  const compiledCarousel = compile('app/components/CommunityDirectoryCarousel.tsx', { document, window: {
    matchMedia: () => media, setInterval: callback => { jobs.set(++nextJob, callback); return nextJob; }, clearInterval: id => jobs.delete(id),
  } }, { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, './StableLink': { default: 'a' }, './PublicIcon': { default: 'svg' } });
  const communities = [1, 2].map(id => ({ id, nome: `Comunidade ${id}`, slug: `comunidade-${id}`, cidade: 'Cidade', descricao: 'Descrição', eventosPublicos: 0 }));
  const render = () => {
    stateIndex = 0; effectIndex = 0;
    const tree = compiledCarousel.default({ communities });
    for (const effect of effects) if (effect.callback) { effect.cleanup = effect.callback(); effect.callback = null; }
    return tree;
  };
  const walk = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
  const pauseButton = tree => walk(tree).find(node => node.props.className === 'directory-carousel-pause');
  return { render, jobs, document, media, pauseButton, walk };
}

test('carrossel: pausa explícita persiste após mouse e foco saírem', () => {
  const f = carousel(); let tree = f.render(); assert.equal(f.jobs.size, 1);
  tree.props.onMouseEnter(); tree = f.render(); assert.equal(f.jobs.size, 0);
  f.pauseButton(tree).props.onClick(); tree = f.render();
  tree.props.onMouseLeave(); tree.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null });
  tree = f.render(); assert.equal(f.jobs.size, 0);
  assert.equal(f.pauseButton(tree).props['aria-pressed'], true);
  f.pauseButton(tree).props.onClick(); f.render(); assert.equal(f.jobs.size, 1);
});

test('carrossel: teclado, aba oculta e movimento reduzido suspendem a rotação', () => {
  const f = carousel(); let tree = f.render();
  tree.props.onFocusCapture(); tree = f.render(); assert.equal(f.jobs.size, 0);
  tree.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null }); f.render();
  assert.equal(f.jobs.size, 1);
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange')); f.render();
  assert.equal(f.jobs.size, 0);
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange')); f.render();
  assert.equal(f.jobs.size, 1);
  f.media.matches = true; f.media.dispatchEvent(new Event('change')); tree = f.render();
  assert.equal(f.jobs.size, 0); assert.equal(f.pauseButton(tree), undefined);
});

test('carrossel: navegação manual e toque no conteúdo pausam sem inverter o botão', () => {
  const f = carousel(); let tree = f.render();
  const next = f.walk(tree).find(node => node.props['aria-label'] === 'Próxima comunidade');
  next.props.onClick(); tree = f.render();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.pauseButton(tree).props['aria-pressed'], true);
  f.pauseButton(tree).props.onClick(); tree = f.render();
  assert.equal(f.jobs.size, 1);
  const viewport = f.walk(tree).find(node => node.props.className === 'directory-carousel-viewport');
  viewport.props.onTouchStart(); tree = f.render();
  assert.equal(f.jobs.size, 0);
  assert.equal(tree.props.onTouchStart, undefined, 'toque no botão não dispara pausa no ancestral');
  f.pauseButton(tree).props.onClick(); f.render();
  assert.equal(f.jobs.size, 1);
});
