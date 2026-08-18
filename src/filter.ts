import * as fs from 'fs';
import * as path from 'path';

const SKIPPED_DIRECTORIES = new Set(['.git', '.vscode', 'node_modules']);

export type ExcludeMap = Record<string, boolean>;

/**
 * Bounds applied to a preview search so typing in the QuickPick can never block
 * the extension host for an unbounded amount of time in a large workspace.
 */
export interface FindMatchingDirsOptions {
  /** Stop collecting once this many matches were found. */
  readonly limit?: number;
  /** Stop walking once this many directories were visited, even without matches. */
  readonly maxVisitedDirs?: number;
  /** Cooperative cancellation, checked once per visited directory. */
  readonly isCancelled?: () => boolean;
}

export interface FindMatchingDirsResult {
  readonly matches: string[];
  /** True when the walk stopped early because `limit` or `maxVisitedDirs` was reached. */
  readonly truncated: boolean;
  /** True when `isCancelled` returned true before the walk finished. */
  readonly cancelled: boolean;
}

export function findMatchingDirs(root: string, query: string): string[] {
  return findMatchingDirsLimited(root, query).matches;
}

export function findMatchingDirsLimited(
  root: string,
  query: string,
  options: FindMatchingDirsOptions = {},
): FindMatchingDirsResult {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return { matches: [], truncated: false, cancelled: false };
  }

  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const state: WalkState = {
    normalizedQuery,
    matches: [],
    // Collect one extra match so an exact-limit result is not reported as truncated.
    limit: limit + 1,
    remainingDirs: options.maxVisitedDirs ?? Number.POSITIVE_INFINITY,
    isCancelled: options.isCancelled,
    truncated: false,
    cancelled: false,
  };

  walkDirectories(root, '', state);

  const overflowed = state.matches.length > limit;
  const matches = state.matches.sort(comparePaths);

  return {
    matches: overflowed ? matches.slice(0, limit) : matches,
    truncated: overflowed || state.truncated,
    cancelled: state.cancelled,
  };
}

export function buildExcludeMap(root: string, matchingPaths: string[]): ExcludeMap {
  const keep = buildKeepSet(matchingPaths);
  const matches = new Set(matchingPaths.map(toPosixPath));
  const exclude: ExcludeMap = {};

  for (const relativeDir of [...keep].sort(comparePaths)) {
    if (matches.has(relativeDir)) {
      continue;
    }

    const absoluteDir = path.join(root, relativeDir);
    const children = readDirectoryChildren(absoluteDir)
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

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

interface WalkState {
  readonly normalizedQuery: string;
  readonly matches: string[];
  readonly limit: number;
  remainingDirs: number;
  readonly isCancelled?: () => boolean;
  truncated: boolean;
  cancelled: boolean;
}

function walkDirectories(root: string, relativeDir: string, state: WalkState): void {
  if (shouldStopWalking(state)) {
    return;
  }

  state.remainingDirs -= 1;
  const absoluteDir = path.join(root, relativeDir);
  const children = readDirectoryChildren(absoluteDir)
    .filter((entry) => entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const name of children) {
    if (shouldStopWalking(state)) {
      return;
    }

    const childPath = joinRelativePath(relativeDir, name);
    if (name.toLocaleLowerCase().includes(state.normalizedQuery)) {
      state.matches.push(childPath);
    }

    walkDirectories(root, childPath, state);
  }
}

function shouldStopWalking(state: WalkState): boolean {
  if (state.cancelled || state.truncated || state.matches.length >= state.limit) {
    return true;
  }

  if (state.isCancelled?.()) {
    state.cancelled = true;
    return true;
  }

  if (state.remainingDirs <= 0) {
    state.truncated = true;
    return true;
  }

  return false;
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

function readDirectoryChildren(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
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
    (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'EPERM')
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
