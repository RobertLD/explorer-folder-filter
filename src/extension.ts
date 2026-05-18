import * as vscode from 'vscode';
import { buildExcludeMap, findMatchingDirs, type ExcludeMap } from './filter';
import { StatusBarManager } from './statusBar';
import {
  getActiveFilterBaseExclude,
  getWorkspaceFolderFilesConfig,
  mergeExcludeMaps,
  selectWorkspaceRoot,
  updateFilesExclude,
} from './workspaceConfig';

const SAVED_EXCLUDE_KEY = 'explorerFolderFilter.savedExclude';

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('explorerFilter.focus', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Folder name to filter in the Explorer',
        placeHolder: 'e.g. example-folder-name',
        ignoreFocusOut: true,
      });

      if (query === undefined) {
        return;
      }

      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return;
      }

      const applied = await applyFilter(context, trimmedQuery);
      if (applied) {
        statusBar.show(trimmedQuery);
      }
    }),
    vscode.commands.registerCommand('explorerFilter.clear', async () => {
      await clearFilter(context);
      statusBar.hide();
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up. The user explicitly controls when a filter is cleared.
}

async function applyFilter(context: vscode.ExtensionContext, query: string): Promise<boolean> {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('Open a workspace folder before filtering the Explorer.');
    return false;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const matchingDirs = findMatchingDirs(workspaceRoot, query);
  if (matchingDirs.length === 0) {
    vscode.window.showWarningMessage(`No folders found matching "${query}".`);
    return false;
  }

  const filesConfig = getWorkspaceFolderFilesConfig(vscode.workspace, workspaceFolder);
  const currentExclude = filesConfig.get<ExcludeMap>('exclude') ?? {};
  const savedExclude = context.workspaceState.get<ExcludeMap>(SAVED_EXCLUDE_KEY);

  if (savedExclude === undefined) {
    await context.workspaceState.update(SAVED_EXCLUDE_KEY, currentExclude);
  }

  const generatedExclude = buildExcludeMap(workspaceRoot, matchingDirs);
  const baseExclude = getActiveFilterBaseExclude(currentExclude, savedExclude);
  const excludeMap = mergeExcludeMaps(baseExclude, generatedExclude);
  await updateFilesExclude(filesConfig, excludeMap, vscode.ConfigurationTarget.WorkspaceFolder);
  vscode.window.showInformationMessage(`Explorer Folder Filter matched ${matchingDirs.length} folder(s).`);
  return true;
}

async function clearFilter(context: vscode.ExtensionContext): Promise<void> {
  const savedExclude = context.workspaceState.get<ExcludeMap>(SAVED_EXCLUDE_KEY);
  if (savedExclude === undefined) {
    return;
  }

  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const filesConfig = getWorkspaceFolderFilesConfig(vscode.workspace, workspaceFolder);
  await updateFilesExclude(filesConfig, savedExclude, vscode.ConfigurationTarget.WorkspaceFolder);
  await context.workspaceState.update(SAVED_EXCLUDE_KEY, undefined);
}

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const selection = selectWorkspaceRoot(vscode.workspace.workspaceFolders);
  if (!selection.folder) {
    return undefined;
  }

  if (selection.isMultiRoot) {
    vscode.window.showInformationMessage('Explorer Folder Filter is using the first workspace folder.');
  }

  return selection.folder;
}
