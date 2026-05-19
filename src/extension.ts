import * as vscode from 'vscode';
import { buildExcludeMap, findMatchingDirs, type ExcludeMap } from './filter';
import { StatusBarManager } from './statusBar';
import {
  getActiveFilterBaseExclude,
  getWorkspaceFolderExclude,
  getWorkspaceFolderFilesConfig,
  isFilterActiveFromSavedExclude,
  mergeExcludeMaps,
  selectWorkspaceRoot,
  updateFilesExclude,
} from './workspaceConfig';

const SAVED_EXCLUDE_KEY = 'explorerFolderFilter.savedExclude';
const ACTIVE_CONTEXT_KEY = 'explorerFolderFilter.active';
type SavedExclude = ExcludeMap | null;

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  void updateActiveContext(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('explorerFilter.focus', async () => {
      const query = await promptForFilterQuery();
      if (query === undefined) {
        return;
      }

      await applyFilterAndUpdateState(context, statusBar, query);
    }),
    vscode.commands.registerCommand('explorerFilter.clear', async () => {
      const cleared = await clearFilter(context);
      if (cleared) {
        statusBar.hide();
        await updateActiveContext(context);
      }
    }),
    vscode.commands.registerCommand('explorerFilter.toggle', async () => {
      if (isFilterActive(context)) {
        const cleared = await clearFilter(context);
        if (cleared) {
          statusBar.hide();
          await updateActiveContext(context);
        }
        return;
      }

      const query = await promptForFilterQuery();
      if (query === undefined) {
        return;
      }

      await applyFilterAndUpdateState(context, statusBar, query);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up. The user explicitly controls when a filter is cleared.
}

async function promptForFilterQuery(): Promise<string | undefined> {
  const query = await vscode.window.showInputBox({
    prompt: 'Folder name to filter in the Explorer',
    placeHolder: 'e.g. example-folder-name',
    ignoreFocusOut: true,
  });

  if (query === undefined) {
    return undefined;
  }

  const trimmedQuery = query.trim();
  return trimmedQuery || undefined;
}

async function applyFilterAndUpdateState(
  context: vscode.ExtensionContext,
  statusBar: StatusBarManager,
  query: string,
): Promise<void> {
  const applied = await applyFilter(context, query);
  if (applied) {
    statusBar.show(query);
    await updateActiveContext(context);
  }
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
  const currentWorkspaceFolderExclude = getWorkspaceFolderExclude(filesConfig);
  const savedExclude = context.workspaceState.get<SavedExclude>(SAVED_EXCLUDE_KEY);

  if (savedExclude === undefined) {
    await context.workspaceState.update(SAVED_EXCLUDE_KEY, currentWorkspaceFolderExclude ?? null);
  }

  const generatedExclude = buildExcludeMap(workspaceRoot, matchingDirs);
  const baseExclude = getActiveFilterBaseExclude(currentWorkspaceFolderExclude, savedExclude);
  const excludeMap = mergeExcludeMaps(baseExclude, generatedExclude);
  await updateFilesExclude(filesConfig, excludeMap, vscode.ConfigurationTarget.WorkspaceFolder);
  vscode.window.showInformationMessage(`Explorer Folder Filter matched ${matchingDirs.length} folder(s).`);
  return true;
}

async function clearFilter(context: vscode.ExtensionContext): Promise<boolean> {
  const savedExclude = context.workspaceState.get<SavedExclude>(SAVED_EXCLUDE_KEY);
  if (savedExclude === undefined) {
    return false;
  }

  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return false;
  }

  const filesConfig = getWorkspaceFolderFilesConfig(vscode.workspace, workspaceFolder);
  await updateFilesExclude(filesConfig, savedExclude ?? undefined, vscode.ConfigurationTarget.WorkspaceFolder);
  await context.workspaceState.update(SAVED_EXCLUDE_KEY, undefined);
  return true;
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

function isFilterActive(context: vscode.ExtensionContext): boolean {
  return isFilterActiveFromSavedExclude(context.workspaceState.get<SavedExclude>(SAVED_EXCLUDE_KEY));
}

async function updateActiveContext(context: vscode.ExtensionContext): Promise<void> {
  await vscode.commands.executeCommand('setContext', ACTIVE_CONTEXT_KEY, isFilterActive(context));
}
