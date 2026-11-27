import * as vscode from 'vscode';
import { buildExcludeMap, findMatchingDirs, toWorkspaceRelativeDir, type ExcludeMap } from './filter';
import { LatestOperationQueue, OperationCancelledError } from './latestOperation';
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

const operations = new LatestOperationQueue();

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  void updateActiveContext(context);

  context.subscriptions.push(
    registerReportingCommand('explorerFilter.focus', () => promptAndFilter(context, statusBar)),
    registerReportingCommand('explorerFilter.clear', () => clearFilterAndUpdateState(context, statusBar)),
    registerReportingCommand('explorerFilter.toggle', async () => {
      if (isFilterActive(context)) {
        await clearFilterAndUpdateState(context, statusBar);
        return;
      }

      await promptAndFilter(context, statusBar);
    }),
    registerReportingCommand('explorerFilter.focusFolder', (clickedUri?: vscode.Uri, selectedUris?: vscode.Uri[]) =>
      focusOnFolders(context, statusBar, clickedUri, selectedUris),
    ),
  );
}

function registerReportingCommand<TArgs extends unknown[]>(
  command: string,
  handler: (...args: TArgs) => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (...args: TArgs) => {
    try {
      await handler(...args);
    } catch (error) {
      if (error instanceof OperationCancelledError) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Explorer Folder Filter: ${message}`);
    }
  });
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

async function promptAndFilter(context: vscode.ExtensionContext, statusBar: StatusBarManager): Promise<void> {
  const query = await promptForFilterQuery();
  if (query === undefined) {
    return;
  }

  const workspaceFolder = requireWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  await withCancellableProgress(`Explorer Folder Filter: searching for "${query}"`, async (signal) => {
    const matchingDirs = await findMatchingDirs(workspaceFolder.uri.fsPath, query, signal);
    if (matchingDirs.length === 0) {
      vscode.window.showWarningMessage(`No folders found matching "${query}".`);
      return;
    }

    await applyFolderFilter(context, statusBar, workspaceFolder, matchingDirs, query, signal);
    vscode.window.showInformationMessage(`Explorer Folder Filter matched ${matchingDirs.length} folder(s).`);
  });
}

async function focusOnFolders(
  context: vscode.ExtensionContext,
  statusBar: StatusBarManager,
  clickedUri: vscode.Uri | undefined,
  selectedUris: vscode.Uri[] | undefined,
): Promise<void> {
  if (!clickedUri) {
    vscode.window.showWarningMessage('Right-click a folder in the Explorer to focus on it.');
    return;
  }

  const workspaceFolder = requireWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }

  const relativeDirs: string[] = [];
  for (const uri of selectFocusTargets(clickedUri, selectedUris)) {
    const relativeDir = await resolveFocusableFolder(workspaceFolder, uri);
    if (relativeDir === undefined) {
      return;
    }

    relativeDirs.push(relativeDir);
  }

  const label = formatFocusLabel(relativeDirs);
  await withCancellableProgress(`Explorer Folder Filter: focusing on ${label}`, (signal) =>
    applyFolderFilter(context, statusBar, workspaceFolder, relativeDirs, label, signal),
  );
}

function selectFocusTargets(clickedUri: vscode.Uri, selectedUris: vscode.Uri[] | undefined): vscode.Uri[] {
  const clickedKey = clickedUri.toString();
  if (selectedUris?.some((uri) => uri.toString() === clickedKey)) {
    return selectedUris;
  }

  return [clickedUri];
}

function formatFocusLabel(relativeDirs: string[]): string {
  if (relativeDirs.length === 1) {
    return relativeDirs[0];
  }

  return `${relativeDirs.length} folders`;
}

async function resolveFocusableFolder(
  workspaceFolder: vscode.WorkspaceFolder,
  uri: vscode.Uri,
): Promise<string | undefined> {
  const relativeDir = toWorkspaceRelativeDir(workspaceFolder.uri.fsPath, uri.fsPath);
  if (relativeDir === undefined) {
    vscode.window.showWarningMessage(
      `Explorer Folder Filter can only focus folders below the root of the first workspace folder (${workspaceFolder.name}).`,
    );
    return undefined;
  }

  const stat = await vscode.workspace.fs.stat(uri);
  if ((stat.type & vscode.FileType.Directory) === 0) {
    vscode.window.showWarningMessage(`"${relativeDir}" is not a folder. Select only folders to focus on them.`);
    return undefined;
  }

  return relativeDir;
}

async function withCancellableProgress(
  title: string,
  task: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = operations.start();
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    async (_progress, token) => {
      const subscription = token.onCancellationRequested(() => controller.abort());
      try {
        await task(controller.signal);
      } finally {
        subscription.dispose();
      }
    },
  );
}

async function applyFolderFilter(
  context: vscode.ExtensionContext,
  statusBar: StatusBarManager,
  workspaceFolder: vscode.WorkspaceFolder,
  matchingDirs: string[],
  label: string,
  signal: AbortSignal,
): Promise<void> {
  const generatedExclude = await buildExcludeMap(workspaceFolder.uri.fsPath, matchingDirs, signal);

  await operations.commit(signal, async () => {
    const filesConfig = getWorkspaceFolderFilesConfig(vscode.workspace, workspaceFolder);
    const currentWorkspaceFolderExclude = getWorkspaceFolderExclude(filesConfig);
    const savedExclude = context.workspaceState.get<SavedExclude>(SAVED_EXCLUDE_KEY);

    if (savedExclude === undefined) {
      await context.workspaceState.update(SAVED_EXCLUDE_KEY, currentWorkspaceFolderExclude ?? null);
    }

    const baseExclude = getActiveFilterBaseExclude(currentWorkspaceFolderExclude, savedExclude);
    const excludeMap = mergeExcludeMaps(baseExclude, generatedExclude);
    try {
      await updateFilesExclude(filesConfig, excludeMap, vscode.ConfigurationTarget.WorkspaceFolder);
    } catch (error) {
      if (savedExclude === undefined) {
        await context.workspaceState.update(SAVED_EXCLUDE_KEY, undefined);
      }

      throw error;
    }

    statusBar.show(label);
    await updateActiveContext(context);
  });
}

async function clearFilterAndUpdateState(
  context: vscode.ExtensionContext,
  statusBar: StatusBarManager,
): Promise<void> {
  const controller = operations.start();
  await operations.commit(controller.signal, async () => {
    const cleared = await clearFilter(context);
    if (cleared) {
      statusBar.hide();
      await updateActiveContext(context);
    }
  });
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

function requireWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('Open a workspace folder before filtering the Explorer.');
  }

  return workspaceFolder;
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
