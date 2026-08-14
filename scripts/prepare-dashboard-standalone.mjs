import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardRoot = path.join(repositoryRoot, 'apps', 'dashboard');
const standaloneRoot = path.join(dashboardRoot, '.next', 'standalone', 'apps', 'dashboard');

async function copyDirectoryIfPresent(source, destination) {
  try {
    if (!(await stat(source)).isDirectory()) return;
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

await copyDirectoryIfPresent(path.join(dashboardRoot, '.next', 'static'), path.join(standaloneRoot, '.next', 'static'));
await copyDirectoryIfPresent(path.join(dashboardRoot, 'public'), path.join(standaloneRoot, 'public'));
