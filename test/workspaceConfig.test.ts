import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExcludeMap } from '../src/filter';
import {
  getActiveFilterBaseExclude,
  getWorkspaceFolderFilesConfig,
  mergeExcludeMaps,
  selectWorkspaceRoot,
  updateFilesExclude,
  type FilesConfigurationLike,
  type WorkspaceFolderLike,
} from '../src/workspaceConfig';

describe('workspace config helpers', () => {
  it('preserves existing excludes when applying generated filter excludes', () => {
    const existingExclude: ExcludeMap = {
      '**/.terraform': true,
      '**/.cache': true,
    };
    const generatedExclude: ExcludeMap = {
      packages: true,
      'services/{api,worker}': true,
    };

    assert.deepEqual(mergeExcludeMaps(existingExclude, generatedExclude), {
      '**/.terraform': true,
      '**/.cache': true,
      packages: true,
      'services/{api,worker}': true,
    });
  });

  it('lets generated filter excludes override same-pattern existing excludes while active', () => {
    assert.deepEqual(mergeExcludeMaps({ services: false }, { services: true }), {
      services: true,
    });
  });

  it('uses the originally saved excludes when a filter is re-run while active', () => {
    const originalExclude: ExcludeMap = {
      '**/.terraform': true,
    };
    const currentFilteredExclude: ExcludeMap = {
      '**/.terraform': true,
      packages: true,
      'services/old-match': true,
    };

    assert.equal(getActiveFilterBaseExclude(currentFilteredExclude, originalExclude), originalExclude);
    assert.deepEqual(mergeExcludeMaps(originalExclude, { 'services/new-match': true }), {
      '**/.terraform': true,
      'services/new-match': true,
    });
  });

  it('uses current excludes as the baseline when no filter is active', () => {
    const currentExclude: ExcludeMap = {
      '**/.cache': true,
    };

    assert.equal(getActiveFilterBaseExclude(currentExclude, undefined), currentExclude);
  });

  it('restores the exact saved exclude map to the workspace folder target', async () => {
    const savedExclude: ExcludeMap = {
      '**/.cache': true,
      services: false,
    };
    const workspaceFolderTarget = Symbol('WorkspaceFolder');
    const updates: Array<{ section: string; value: unknown; target: unknown }> = [];
    const filesConfig: FilesConfigurationLike = {
      get: () => undefined,
      update: async (section, value, target) => {
        updates.push({ section, value, target });
      },
    };

    await updateFilesExclude(filesConfig, savedExclude, workspaceFolderTarget);

    assert.deepEqual(updates, [
      {
        section: 'exclude',
        value: savedExclude,
        target: workspaceFolderTarget,
      },
    ]);
  });

  it('gets files configuration scoped to the selected workspace folder URI', () => {
    const folder: WorkspaceFolderLike = {
      uri: { fsPath: '/workspace/root' },
    };
    const filesConfig: FilesConfigurationLike = {
      get: () => undefined,
      update: async () => undefined,
    };
    const calls: Array<{ section: string; scope: unknown }> = [];
    const workspace = {
      workspaceFolders: [folder],
      getConfiguration: (section: string, scope?: unknown) => {
        calls.push({ section, scope });
        return filesConfig;
      },
    };

    assert.equal(getWorkspaceFolderFilesConfig(workspace, folder), filesConfig);
    assert.deepEqual(calls, [
      {
        section: 'files',
        scope: folder.uri,
      },
    ]);
  });

  it('selects the first workspace folder and reports multi-root workspaces', () => {
    const first = { uri: { fsPath: '/first' } };
    const second = { uri: { fsPath: '/second' } };

    assert.deepEqual(selectWorkspaceRoot([first, second]), {
      folder: first,
      isMultiRoot: true,
    });
  });

  it('returns no selected folder for empty workspaces', () => {
    assert.deepEqual(selectWorkspaceRoot(undefined), {
      folder: undefined,
      isMultiRoot: false,
    });
    assert.deepEqual(selectWorkspaceRoot([]), {
      folder: undefined,
      isMultiRoot: false,
    });
  });
});
