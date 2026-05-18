import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'explorer-folder-filter-vscode-'));
  createFixtureWorkspace(workspacePath);

  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'vscode/index'),
      launchArgs: [workspacePath, '--disable-workspace-trust'],
      extensionTestsEnv: {
        EXPLORER_FILTER_TEST_WORKSPACE: workspacePath,
      },
    });
  } finally {
    fs.rmSync(workspacePath, { force: true, recursive: true });
  }
}

function createFixtureWorkspace(root: string): void {
  const files = [
    'workspace-a/modules/target-folder/visible.txt',
    'workspace-a/modules/other-module/hidden.txt',
    'workspace-a/config/hidden.txt',
    'workspace-b/modules/target-folder/visible.txt',
    'workspace-b/modules/another-module/hidden.txt',
    'workspace-b/docs/hidden.txt',
    'shared/tools/hidden.txt',
  ];

  for (const file of files) {
    const absolutePath = path.join(root, file);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, file);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
