import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { startLogoPreview } from './logo-transition-preview.mjs';
const { chromium } = await import(process.env.VINKULO_PLAYWRIGHT_MODULE || 'playwright');
const preview = process.env.VINKULO_QA_BASE ? null : await startLogoPreview(4189);
const base = process.env.VINKULO_QA_BASE || preview.base;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
await fs.mkdir('outputs/install-icons', { recursive: true });
try {
  const downloads = await browser.newContext();
  const releaseResponse = await downloads.request.get(base + '/downloads/android-release.json');
  assert.equal(releaseResponse.status(), 200);
  const release = (await releaseResponse.json()).homologation;
  assert.equal(release.versionName, '1.24.0');
  const apk = await downloads.request.get(base + '/downloads/' + release.file);
  assert.equal(apk.status(), 200);
  const bytes = await apk.body();
  assert.equal(bytes.length, release.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), release.sha256);
  results.push('APK download matches the signed release artifact size and SHA-256');
  await downloads.close();
  for (const version of ['1.23.0', '1.24.0']) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    await context.addInitScript(version => { window.VinkuloAndroid = {version}; }, version);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    assert.equal((await page.goto(base + '/login')).status(), 200);
    await page.waitForFunction(() => document.querySelector('.platform-loading-transition')?.dataset.phase === 'idle');
    const manifest = await page.evaluate(async () => {
      const response = await fetch(document.querySelector('link[rel="manifest"]').href);
      if (!response.ok) throw Error('Manifest HTTP ' + response.status);
      return response.json();
    });
    assert.equal(manifest.id, '/');
    assert.deepEqual(manifest.icons.map(icon => icon.src), ['/icons/vinkulo-192-v3.png','/icons/vinkulo-512-v3.png']);
    for (const icon of manifest.icons) {
      const pixels = await page.evaluate(async url => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image,0,0);
        return {width:image.width,height:image.height,cornerAlpha:ctx.getImageData(0,0,1,1).data[3]};
      }, icon.src);
      assert.equal(pixels.width, Number(icon.sizes.split('x')[0]));
      assert.equal(pixels.cornerAlpha, 0);
    }
    assert.ok(await page.locator('link[rel="icon"]').evaluateAll(icons => icons.some(icon => icon.href.endsWith('/icons/vinkulo-favicon-32-v3.png'))));
    assert.ok((await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).endsWith('/icons/vinkulo-apple-180-v3.png'));
    const notice = page.getByRole('complementary', { name: 'Atualização do aplicativo Android' });
    if (version === '1.23.0') {
      await notice.waitFor();
      assert.equal(await notice.getByRole('link', {name: 'Baixar atualização'}).getAttribute('href'), '/downloads/VINKULO_ANDROID_1.24.0_HOMOLOGACAO.apk');
      for (const width of [390, 768, 1864]) {
        await page.setViewportSize({width, height: 1000});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const controls = await notice.locator('a,button').evaluateAll(elements => elements.map(element => {const r=element.getBoundingClientRect();return {width:r.width,height:r.height};}));
        assert.ok(controls.every(r => r.width >= 43.9 && r.height >= 43.9), JSON.stringify({width, controls}));
        await page.screenshot({path:`outputs/install-icons/android-update-${width}.png`});
        results.push('Update notice, download and touch targets at ' + width + 'px');
      }
      await notice.getByRole('button', {name: 'Fechar aviso de atualização'}).click();
      await notice.waitFor({state:'detached'});
    } else {
      assert.equal(await notice.count(), 0);
      results.push('Android 1.24 does not request another icon update');
    }
    assert.deepEqual(errors, []);
    results.push('Manifest and browser icons are correct for Android ' + version);
    await context.close();
  }
  await fs.writeFile('outputs/install-icons/qa-results.json', JSON.stringify({base, results}, null, 2));
  console.log(JSON.stringify({base, checks:results.length, results}, null, 2));
} finally { await browser.close(); await preview?.close(); }
