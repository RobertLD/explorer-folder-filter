import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { buildExcludeMap, findMatchingDirs } from '../src/filter';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe('findMatchingDirs', () => {
  it('finds matching directories recursively with case-insensitive substring matching', () => {
    const root = createFixture({
      'workspace-a/modules/target-folder/base': {},
      'workspace-b/modules/target-folder': {},
      'workspace-b/modules/other-module': {},
    });

    assert.deepEqual(findMatchingDirs(root, 'target'), [
      'workspace-a/modules/target-folder',
      'workspace-b/modules/target-folder',
    ]);
  });

  it('skips generated and editor metadata directories', () => {
    const root = createFixture({
      '.git/hooks/matching-app': {},
      '.vscode/matching-app': {},
      'node_modules/pkg/matching-app': {},
      'services/matching-app': {},
    });

    assert.deepEqual(findMatchingDirs(root, 'matching'), ['services/matching-app']);
  });

  it('returns no matches for blank queries', () => {
    const root = createFixture({
      'services/api': {},
    });

    assert.deepEqual(findMatchingDirs(root, '   '), []);
  });
});

describe('buildExcludeMap', () => {
  it('keeps matching directories and their ancestry while excluding siblings with documented brace globs', () => {
    const root = createFixture({
      'workspace-a/modules/target-folder': {},
      'workspace-a/modules/other-module': {},
      'workspace-a/config': {},
      'workspace-b/modules/target-folder': {},
      'workspace-b/modules/another-module': {},
      'workspace-b/docs': {},
      'shared/tools': {},
    });

    const matches = findMatchingDirs(root, 'target');

    assert.deepEqual(buildExcludeMap(root, matches), {
      shared: true,
      'workspace-a/config': true,
      'workspace-a/modules/other-module': true,
      'workspace-b/docs': true,
      'workspace-b/modules/another-module': true,
    });
  });

  it('keeps the full contents of a matching directory visible', () => {
    const root = createFixture({
      'env/app/deploy': {},
      'env/app/docs': {},
      'env/other': {},
      'shared/tools': {},
    });

    assert.deepEqual(buildExcludeMap(root, ['env']), {
      shared: true,
    });
  });

  it('groups multiple excluded siblings into one brace pattern per parent', () => {
    const root = createFixture({
      'env/app/target': {},
      'env/alpha': {},
      'env/beta': {},
      'env/gamma': {},
      'shared/tools': {},
    });

    assert.deepEqual(buildExcludeMap(root, ['env/app/target']), {
      shared: true,
      'env/{alpha,beta,gamma}': true,
    });
  });

  it('does not exclude files or subdirectories inside matching directories', () => {
    const root = createFixture({
      'env/modules/target-folder/base': {},
      'env/modules/target-folder/overlays/prod': {},
      'env/modules/other-module': {},
      'env/config': {},
    });
    fs.writeFileSync(path.join(root, 'env/modules/target-folder/config.yaml'), 'kind: ConfigMap');

    assert.deepEqual(buildExcludeMap(root, ['env/modules/target-folder']), {
      'env/config': true,
      'env/modules/other-module': true,
    });
  });

  it('escapes documented VS Code glob syntax in excluded directory names', () => {
    const root = createFixture({
      'env/app[one]/target': {},
      'env/app[one]/other': {},
      'env/app,two/target': {},
      'shared/tools': {},
    });

    assert.deepEqual(buildExcludeMap(root, ['env/app[one]/target']), {
      shared: true,
      'env/app[,]two': true,
      'env/app[[]one[]]/other': true,
    });
  });
});

function createFixture(paths: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explorer-folder-filter-'));
  temporaryRoots.push(root);

  for (const relativePath of Object.keys(paths)) {
    fs.mkdirSync(path.join(root, relativePath), { recursive: true });
  }

  return root;
}
