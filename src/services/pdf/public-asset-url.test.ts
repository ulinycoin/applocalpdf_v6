import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePublicAssetUrl } from './public-asset-url';

test('resolvePublicAssetUrl prefixes the deployed base path', () => {
  // The app is mounted at /app; a root-absolute font URL is a 404 in production.
  assert.equal(
    resolvePublicAssetUrl('fonts/Roboto-Regular.ttf', '/app/'),
    '/app/fonts/Roboto-Regular.ttf',
  );
  assert.equal(
    resolvePublicAssetUrl('fonts/Roboto-Regular.ttf', '/app'),
    '/app/fonts/Roboto-Regular.ttf',
  );
  assert.equal(resolvePublicAssetUrl('/fonts/x.ttf', '/app/'), '/app/fonts/x.ttf');
  assert.equal(resolvePublicAssetUrl('fonts/x.ttf', '/'), '/fonts/x.ttf');
});
