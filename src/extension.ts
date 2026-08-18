import * as vscode from 'vscode';
import { buildExcludeMap, findMatchingDirs, findMatchingDirsLimited, type ExcludeMap } from './filter';
import {
  DEFAULT_MAX_VISITED_DIRS,
  DEFAULT_PREVIEW_LIMIT,
  showFilterPicker,
  type FilterQuickPickItem,
  type QuickPickLike,
} from './filterPicker';
import { addQueryToHistory, normalizeQueryHistory } from './queryHistory';
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
const QUERY_HISTORY_KEY = 'explorerFolderFilter.queryHistory';
type SavedExclude = ExcludeMap | null;

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  void updateActiveContext(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('explorerFilter.focus', async () => {
      await runFilterFlow(context, statusBar);
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

      await runFilterFlow(context, statusBar);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up. The user explicitly controls when a filter is cleared.
}

/**
 * Resolves the workspace folder once and reuses it for both the preview and the
 * apply step, so the preview always describes the tree the filter will act on.
 */
async function runFilterFlow(
  context: vscode.ExtensionContext,
  statusBar: StatusBarManager,
): Promise<void> {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('Open a workspace folder before filtering the Explorer.');
    return;
  }

  const query = await promptForFilterQuery(context, workspaceFolder.uri.fsPath);
  if (query === undefined) {
    return;
  }

  const applied = await applyFilter(context, workspaceFolder, query);
  if (!applied) {
    return;
  }

  statusBar.show(query);
  await rememberQuery(context, query);
  await updateActiveContext(context);
}

function promptForFilterQuery(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): Promise<string | undefined> {
  return showFilterPicker({
    quickPick: vscode.window.createQuickPick<
      vscode.QuickPickItem & FilterQuickPickItem
    >() as unknown as QuickPickLike,
    history: readQueryHistory(context),
    search: (query, isCancelled) =>
      findMatchingDirsLimited(workspaceRoot, query, {
        limit: DEFAULT_PREVIEW_LIMIT,
        maxVisitedDirs: DEFAULT_MAX_VISITED_DIRS,
        isCancelled,
      }),
    setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
  });
}

function readQueryHistory(context: vscode.ExtensionContext): string[] {
  return normalizeQueryHistory(context.workspaceState.get<unknown>(QUERY_HISTORY_KEY));
}

async function rememberQuery(context: vscode.ExtensionContext, query: string): Promise<void> {
  await context.workspaceState.update(
    QUERY_HISTORY_KEY,
    addQueryToHistory(readQueryHistory(context), query),
  );
}

async function applyFilter(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  query: string,
): Promise<boolean> {
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
