(() => {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const keys = {'bg':'bg','surface':'surface','surface-2':'soft','text':'ink','muted':'muted','line':'line','primary':'primary','on-primary':'on-primary','link':'link'};
  let theme = null;
  function apply() {
    Object.values(keys).concat(['accent-soft']).forEach(key => root.style.removeProperty('--' + key));
    root.removeAttribute('data-palette');
    if (!theme) return;
    const colors = theme[media.matches ? 'dark' : 'light'];
    Object.entries(keys).forEach(([key, variable]) => root.style.setProperty('--' + variable, colors[key]));
    root.style.setProperty('--accent-soft', colors['surface-2']);
    root.setAttribute('data-palette', theme.paletteId);
  }
  window.VinkuloTheme = state => {
    const value = state.prepared && state.theme;
    theme = value && value.version === 1 && /^[A-Z_]{3,20}$/.test(value.paletteId)
      && ['light','dark'].every(mode => value[mode] && Object.keys(keys).every(key => /^#[0-9a-f]{6}$/i.test(value[mode][key]))) ? value : null;
    apply();
  };
  if (media.addEventListener) media.addEventListener('change', apply); else media.addListener(apply);
})();
