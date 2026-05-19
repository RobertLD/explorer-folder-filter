import type { ExcludeMap } from './filter';

export interface WorkspaceFolderLike {
  readonly uri: unknown;
}

export interface FilesConfigurationLike {
  get<T>(section: string): T | undefined;
  inspect?<T>(section: string): WorkspaceConfigurationInspection<T> | undefined;
  update(section: string, value: unknown, target: unknown): Thenable<void> | Promise<void>;
}

export interface WorkspaceConfigurationInspection<T> {
  readonly workspaceFolderValue?: T;
}

export interface WorkspaceLike<TFolder extends WorkspaceFolderLike> {
  readonly workspaceFolders: readonly TFolder[] | undefined;
  getConfiguration(section: string, scope?: unknown): FilesConfigurationLike;
}

export interface WorkspaceRootSelection<TFolder extends WorkspaceFolderLike> {
  readonly folder: TFolder | undefined;
  readonly isMultiRoot: boolean;
}

export function selectWorkspaceRoot<TFolder extends WorkspaceFolderLike>(
  folders: readonly TFolder[] | undefined,
): WorkspaceRootSelection<TFolder> {
  return {
    folder: folders?.[0],
    isMultiRoot: (folders?.length ?? 0) > 1,
  };
}

export function getWorkspaceFolderFilesConfig<TFolder extends WorkspaceFolderLike>(
  workspace: WorkspaceLike<TFolder>,
  folder: TFolder,
): FilesConfigurationLike {
  return workspace.getConfiguration('files', folder.uri);
}

export function mergeExcludeMaps(baseExclude: ExcludeMap, generatedExclude: ExcludeMap): ExcludeMap {
  return {
    ...baseExclude,
    ...generatedExclude,
  };
}

export function getActiveFilterBaseExclude(
  currentExclude: ExcludeMap | undefined,
  savedExclude: ExcludeMap | null | undefined,
): ExcludeMap {
  return savedExclude === undefined ? currentExclude ?? {} : savedExclude ?? {};
}

export function isFilterActiveFromSavedExclude(savedExclude: ExcludeMap | null | undefined): boolean {
  return savedExclude !== undefined;
}

export function getWorkspaceFolderExclude(filesConfig: FilesConfigurationLike): ExcludeMap | undefined {
  return filesConfig.inspect?.<ExcludeMap>('exclude')?.workspaceFolderValue;
}

export async function updateFilesExclude(
  filesConfig: FilesConfigurationLike,
  excludeMap: ExcludeMap | undefined,
  configurationTarget: unknown,
): Promise<void> {
  await filesConfig.update('exclude', excludeMap, configurationTarget);
}
