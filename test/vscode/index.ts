import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildExcludeMap, findMatchingDirs } from '../../src/filter';

export async function run(): Promise<void> {
  await testGeneratedBraceExcludesAreHonoredByVSCode();
}

async function testGeneratedBraceExcludesAreHonoredByVSCode(): Promise<void> {
  const workspaceRoot = process.env.EXPLORER_FILTER_TEST_WORKSPACE;
  assert.ok(workspaceRoot, 'EXPLORER_FILTER_TEST_WORKSPACE must be set');

  const matches = await findMatchingDirs(workspaceRoot, 'target-folder', new AbortController().signal);
  assert.deepEqual(matches, [
    'workspace-a/modules/target-folder',
    'workspace-b/modules/target-folder',
  ]);

  const excludeMap = await buildExcludeMap(workspaceRoot, matches, new AbortController().signal);
  assert.deepEqual(excludeMap, {
    shared: true,
    'workspace-a/config': true,
    'workspace-a/modules/other-module': true,
    'workspace-b/docs': true,
    'workspace-b/modules/another-module': true,
  });

  await vscode.workspace
    .getConfiguration('files')
    .update('exclude', excludeMap, vscode.ConfigurationTarget.Workspace);

  const visibleFiles = await vscode.workspace.findFiles('**/*.txt', undefined);
  const relativeFiles = visibleFiles
    .map((uri) => path.relative(workspaceRoot, uri.fsPath).split(path.sep).join('/'))
    .sort();

  assert.deepEqual(relativeFiles, [
    'workspace-a/modules/target-folder/visible.txt',
    'workspace-b/modules/target-folder/visible.txt',
  ]);
}
