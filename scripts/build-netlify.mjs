import { mkdir, cp } from 'node:fs/promises';
// Publish only public files, never local analytics storage or repository files.
await mkdir('web', { recursive: true });
for (const name of ['index.html', 'analytics.html', 'privacy.html', 'assets', 'data']) {
  await cp(name, `web/${name}`, { recursive: true });
}
