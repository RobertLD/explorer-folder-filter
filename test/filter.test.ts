import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { buildExcludeMap, findMatchingDirs, toWorkspaceRelativeDir } from '../src/filter';
import { OperationCancelledError } from '../src/latestOperation';

const neverAborted = new AbortController().signal;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe('findMatchingDirs', () => {
  it('finds matching directories recursively with case-insensitive substring matching', async () => {
    const root = createFixture({
      'workspace-a/modules/target-folder/base': {},
      'workspace-b/modules/target-folder': {},
      'workspace-b/modules/other-module': {},
    });

    assert.deepEqual(await findMatchingDirs(root, 'target', neverAborted), [
      'workspace-a/modules/target-folder',
      'workspace-b/modules/target-folder',
    ]);
  });

  it('skips generated and editor metadata directories', async () => {
    const root = createFixture({
      '.git/hooks/matching-app': {},
      '.vscode/matching-app': {},
      'node_modules/pkg/matching-app': {},
      'services/matching-app': {},
    });

    assert.deepEqual(await findMatchingDirs(root, 'matching', neverAborted), ['services/matching-app']);
  });

  it('finds every match when a directory has more children than one read batch', async () => {
    const fixture: Record<string, unknown> = {};
    const expected: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      const name = `group-${String(index).padStart(2, '0')}`;
      fixture[`${name}/nested/target`] = {};
      expected.push(`${name}/nested/target`);
    }
    const root = createFixture(fixture);

    assert.deepEqual(await findMatchingDirs(root, 'target', neverAborted), expected);
  });

  it('skips directories that cannot be read', { skip: process.getuid?.() === 0 }, async () => {
    const root = createFixture({
      'locked/target': {},
      'open/target': {},
    });
    const lockedDir = path.join(root, 'locked');
    fs.chmodSync(lockedDir, 0o000);

    try {
      assert.deepEqual(await findMatchingDirs(root, 'target', neverAborted), ['open/target']);
    } finally {
      fs.chmodSync(lockedDir, 0o755);
    }
  });

  it('returns no matches for blank queries', async () => {
    const root = createFixture({
      'services/api': {},
    });

    assert.deepEqual(await findMatchingDirs(root, '   ', neverAborted), []);
  });
});

describe('buildExcludeMap', () => {
  it('keeps matching directories and their ancestry while excluding siblings with documented brace globs', async () => {
    const root = createFixture({
      'workspace-a/modules/target-folder': {},
      'workspace-a/modules/other-module': {},
      'workspace-a/config': {},
      'workspace-b/modules/target-folder': {},
      'workspace-b/modules/another-module': {},
      'workspace-b/docs': {},
      'shared/tools': {},
    });

    const matches = await findMatchingDirs(root, 'target', neverAborted);

    assert.deepEqual(await buildExcludeMap(root, matches, neverAborted), {
      shared: true,
      'workspace-a/config': true,
      'workspace-a/modules/other-module': true,
      'workspace-b/docs': true,
      'workspace-b/modules/another-module': true,
    });
  });

  it('keeps the full contents of a matching directory visible', async () => {
    const root = createFixture({
      'env/app/deploy': {},
      'env/app/docs': {},
      'env/other': {},
      'shared/tools': {},
    });

    assert.deepEqual(await buildExcludeMap(root, ['env'], neverAborted), {
      shared: true,
    });
  });

  it('groups multiple excluded siblings into one brace pattern per parent', async () => {
    const root = createFixture({
      'env/app/target': {},
      'env/alpha': {},
      'env/beta': {},
      'env/gamma': {},
      'shared/tools': {},
    });

    assert.deepEqual(await buildExcludeMap(root, ['env/app/target'], neverAborted), {
      shared: true,
      'env/{alpha,beta,gamma}': true,
    });
  });

  it('does not exclude files or subdirectories inside matching directories', async () => {
    const root = createFixture({
      'env/modules/target-folder/base': {},
      'env/modules/target-folder/overlays/prod': {},
      'env/modules/other-module': {},
      'env/config': {},
    });
    fs.writeFileSync(path.join(root, 'env/modules/target-folder/config.yaml'), 'kind: ConfigMap');

    assert.deepEqual(await buildExcludeMap(root, ['env/modules/target-folder'], neverAborted), {
      'env/config': true,
      'env/modules/other-module': true,
    });
  });

  it('rejects an empty list of matching paths instead of hiding every folder', async () => {
    const root = createFixture({
      'services/api': {},
    });

    await assert.rejects(buildExcludeMap(root, [], neverAborted), /at least one matching path/);
  });

  it('keeps a selected parent fully visible when its child is also selected', async () => {
    const root = createFixture({
      'env/app/target': {},
      'env/app/other': {},
      'shared/tools': {},
    });

    assert.deepEqual(await buildExcludeMap(root, ['env/app', 'env/app/target'], neverAborted), {
      shared: true,
    });
  });

  it('escapes documented VS Code glob syntax in excluded directory names', async () => {
    const root = createFixture({
      'env/app[one]/target': {},
      'env/app[one]/other': {},
      'env/app,two/target': {},
      'shared/tools': {},
    });

    assert.deepEqual(await buildExcludeMap(root, ['env/app[one]/target'], neverAborted), {
      shared: true,
      'env/app[,]two': true,
      'env/app[[]one[]]/other': true,
    });
  });
});

describe('scan cancellation', () => {
  it('rejects findMatchingDirs when the signal is already aborted', async () => {
    const root = createFixture({
      'services/api': {},
    });

    await assert.rejects(findMatchingDirs(root, 'api', AbortSignal.abort()), OperationCancelledError);
  });

  it('rejects buildExcludeMap when the signal is already aborted', async () => {
    const root = createFixture({
      'services/api': {},
      'services/web': {},
    });

    await assert.rejects(buildExcludeMap(root, ['services/api'], AbortSignal.abort()), OperationCancelledError);
  });

  it('rejects findMatchingDirs when the signal aborts during the scan', async () => {
    const root = createFixture({
      'a/b/c/d/e/f/target': {},
      'g/h/i/j/k/l/target': {},
    });
    const controller = new AbortController();
    const scan = findMatchingDirs(root, 'target', controller.signal);
    controller.abort();

    await assert.rejects(scan, OperationCancelledError);
  });
});

describe('toWorkspaceRelativeDir', () => {
  const root = path.join(os.tmpdir(), 'workspace');

  it('returns the POSIX relative path of a nested folder', () => {
    assert.equal(toWorkspaceRelativeDir(root, path.join(root, 'services', 'api')), 'services/api');
  });

  it('rejects the workspace root itself', () => {
    assert.equal(toWorkspaceRelativeDir(root, root), undefined);
  });

  it('rejects folders outside the workspace root', () => {
    assert.equal(toWorkspaceRelativeDir(root, path.join(os.tmpdir(), 'other', 'api')), undefined);
    assert.equal(toWorkspaceRelativeDir(root, path.dirname(root)), undefined);
  });

  it('accepts folders whose names start with two dots', () => {
    assert.equal(toWorkspaceRelativeDir(root, path.join(root, '..hidden')), '..hidden');
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
