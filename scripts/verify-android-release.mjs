import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Distribution integrity check; APK signatures are verified with apksigner in CI.
const directory = fileURLToPath(new URL('../public/downloads/', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(directory, 'android-release.json'), 'utf8'));
if (manifest.packageName !== 'com.vinkulo.app' || manifest.schemaVersion !== 1) throw new Error('Invalid Android release manifest');
for (const channel of ['stable', 'homologation']) {
  const release = manifest[channel];
  if (!release || !/^VINKULO_ANDROID_[0-9.]+(?:_HOMOLOGACAO)?\.apk$/.test(release.file)
      || !/^[a-f0-9]{64}$/.test(release.sha256) || !Number.isSafeInteger(release.bytes)
      || release.bytes <= 0 || !Number.isSafeInteger(release.versionCode)) throw new Error(`Invalid ${channel} entry`);
  const bytes = await readFile(path.join(directory, release.file));
  if (bytes.length !== release.bytes || createHash('sha256').update(bytes).digest('hex') !== release.sha256) {
    throw new Error(`APK differs from published manifest: ${channel}`);
  }
  if (channel === 'homologation' && !release.file.endsWith('_HOMOLOGACAO.apk')) throw new Error('Homologation artifact must be explicit');
  console.log(`${channel}: ${release.versionName} / code ${release.versionCode} / ${release.bytes} bytes — SHA-256 verified`);
}
if (manifest.homologation.versionCode <= manifest.stable.versionCode) throw new Error('Candidate cannot update the stable APK');
