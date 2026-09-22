import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bundledResources from './resource-registry.mjs';

export class ResourceUnavailableError extends Error {
  constructor() {
    super('이 배포에는 예제 원본 파일이 포함되어 있지 않습니다. 직접 문서를 업로드해 주세요.');
    this.name = 'ResourceUnavailableError';
    this.code = 'RESOURCE_UNAVAILABLE';
    this.status = 503;
  }
}

function resourceName(name) {
  if (typeof name !== 'string' || !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(name) || name.split('/').some(part => part === '.' || part === '..')) {
    throw new TypeError('Invalid bundled resource name.');
  }
  return name;
}

// Paths are resolved only for local Node reads, never while a Worker is loading.
const localRead = name => readFileSync(new URL(`../../${name}`, import.meta.url));
export function createResourceLoader(registry, read = localRead) {
  const bytes = name => {
    resourceName(name);
    if (registry !== null) {
      if (!registry || !Object.hasOwn(registry, name)) throw new ResourceUnavailableError();
      const value = registry[name];
      if (typeof value !== 'string' && !(value instanceof Uint8Array) && !(value instanceof ArrayBuffer)) throw new TypeError('Invalid bundled resource value.');
      return Buffer.from(value);
    }
    return Buffer.from(read(name));
  };
  return { bytes, text: name => bytes(name).toString('utf8') };
}

const resources = createResourceLoader(bundledResources);
export const readResourceText = resources.text;
export const readResourceBytes = resources.bytes;

// Preserve existing test/local fixture injection. Private golden files are absent
// from the default Sites registry and are never discovered or bundled implicitly.
export async function readGoldenResource(name, { root, read } = {}) {
  resourceName(name);
  if (root !== undefined || read !== undefined) {
    const directory = root ?? fileURLToPath(new URL('../../golden/', import.meta.url));
    return (read ?? readFile)(path.join(directory, ...name.split('/')));
  }
  return readResourceBytes(`golden/${name}`);
}
