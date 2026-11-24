import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const shipped = (path) => pkg.files.some((f) => path === f || path.startsWith(f.endsWith('/') ? f : f + '/'));

test('the app icon is where the server looks: in public/, which it serves', () => {
  // With a public/ directory the server resolves appIcon against it.
  const icon = pkg.signalk.appIcon.replace(/^\.\//, '');
  assert.ok(!icon.startsWith('public/'), 'appIcon is relative to public/ already');
  const file = new URL('../public/' + icon, import.meta.url);
  assert.ok(statSync(file).isFile());
  assert.ok(shipped('public/' + icon));
});

test('the screenshots exist and ship', () => {
  assert.ok(pkg.signalk.screenshots.length > 0);
  pkg.signalk.screenshots.forEach((s) => {
    const path = s.replace(/^\.\//, '');
    assert.ok(statSync(new URL('../' + path, import.meta.url)).isFile(), path);
    assert.ok(shipped(path), path + ' is not in files');
  });
});

test('the keywords put it in the App Store', () => {
  ['signalk-node-server-plugin', 'signalk-webapp', 'signalk-category-plotter-extensions'].forEach((k) => {
    assert.ok(pkg.keywords.includes(k), k);
  });
});
