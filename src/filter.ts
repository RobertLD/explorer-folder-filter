import * as fs from 'fs';
import * as path from 'path';
import { OperationCancelledError } from './latestOperation';

const SKIPPED_DIRECTORIES = new Set(['.git', '.vscode', 'node_modules']);
const MAX_CONCURRENT_DIRECTORY_READS = 16;

export type ExcludeMap = Record<string, boolean>;

export async function findMatchingDirs(root: string, query: string, signal: AbortSignal): Promise<string[]> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const matches = await walkDirectories(root, normalizedQuery, signal);
  return matches.sort(comparePaths);
}

export async function buildExcludeMap(
  root: string,
  matchingPaths: string[],
  signal: AbortSignal,
): Promise<ExcludeMap> {
  if (matchingPaths.length === 0) {
    throw new Error('buildExcludeMap requires at least one matching path.');
  }

  const keep = buildKeepSet(matchingPaths);
  const matches = new Set(matchingPaths.map(toPosixPath));
  const exclude: ExcludeMap = {};

  for (const relativeDir of [...keep].sort(comparePaths)) {
    if (matches.has(relativeDir)) {
      continue;
    }

    const children = await readChildDirectoryNames(path.join(root, relativeDir), signal);
    children.sort((left, right) => left.localeCompare(right));

    if (children.length === 0) {
      continue;
    }

    const excludedChildren = children.filter((child) => {
      const childPath = joinRelativePath(relativeDir, child);
      return !keep.has(childPath);
    });

    if (excludedChildren.length === 0) {
      continue;
    }

    const pattern = buildExcludePattern(relativeDir, excludedChildren, children.length);
    exclude[pattern] = true;
  }

  return exclude;
}

export function toWorkspaceRelativeDir(root: string, directory: string): string | undefined {
  const relativeDir = path.relative(root, directory);
  if (!relativeDir) {
    return undefined;
  }

  if (relativeDir === '..' || relativeDir.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDir)) {
    return undefined;
  }

  return toPosixPath(relativeDir);
}

async function walkDirectories(root: string, normalizedQuery: string, signal: AbortSignal): Promise<string[]> {
  const pending: string[] = [''];
  const matches: string[] = [];

  let start = 0;
  while (start < pending.length) {
    const batch = pending.slice(start, start + MAX_CONCURRENT_DIRECTORY_READS);
    start += batch.length;
    const childPathsPerParent = await Promise.all(
      batch.map((relativeDir) => readSearchableChildPaths(root, relativeDir, signal)),
    );

    for (const childPath of childPathsPerParent.flat()) {
      pending.push(childPath);
      if (path.posix.basename(childPath).toLocaleLowerCase().includes(normalizedQuery)) {
        matches.push(childPath);
      }
    }
  }

  return matches;
}

async function readSearchableChildPaths(root: string, relativeDir: string, signal: AbortSignal): Promise<string[]> {
  const childNames = await readChildDirectoryNames(path.join(root, relativeDir), signal);
  return childNames
    .filter((name) => !SKIPPED_DIRECTORIES.has(name))
    .map((name) => joinRelativePath(relativeDir, name));
}

async function readChildDirectoryNames(directory: string, signal: AbortSignal): Promise<string[]> {
  const entries = await readDirectoryChildren(directory, signal);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function buildKeepSet(matchingPaths: string[]): Set<string> {
  const keep = new Set<string>(['']);

  for (const match of matchingPaths) {
    const parts = toPosixPath(match).split('/').filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      keep.add(parts.slice(0, index + 1).join('/'));
    }
  }

  return keep;
}

function buildExcludePattern(parent: string, excludedChildren: string[], totalChildren: number): string {
  const basenamePattern =
    excludedChildren.length === totalChildren
      ? '*'
      : formatBraceGroup(excludedChildren.map(escapeGlobSegment));

  return parent ? `${formatGlobPath(parent)}/${basenamePattern}` : basenamePattern;
}

function formatBraceGroup(segments: string[]): string {
  return segments.length === 1 ? segments[0] : `{${segments.join(',')}}`;
}

function formatGlobPath(value: string): string {
  return toPosixPath(value).split('/').map(escapeGlobSegment).join('/');
}

async function readDirectoryChildren(directory: string, signal: AbortSignal): Promise<fs.Dirent[]> {
  if (signal.aborted) {
    throw new OperationCancelledError();
  }

  try {
    return await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isIgnorableFileSystemError(error)) {
      return [];
    }

    throw error;
  }
}

function isIgnorableFileSystemError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES' || error.code === 'EPERM')
  );
}

function joinRelativePath(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function escapeGlobSegment(value: string): string {
  let escaped = '';

  for (const character of value) {
    switch (character) {
      case '[':
        escaped += '[[]';
        break;
      case ']':
        escaped += '[]]';
        break;
      case '{':
        escaped += '[{]';
        break;
      case '}':
        escaped += '[}]';
        break;
      case ',':
        escaped += '[,]';
        break;
      case '*':
        escaped += '[*]';
        break;
      case '?':
        escaped += '[?]';
        break;
      default:
        escaped += character;
    }
  }

  return escaped;
}

function comparePaths(left: string, right: string): number {
  return left.localeCompare(right);
}
