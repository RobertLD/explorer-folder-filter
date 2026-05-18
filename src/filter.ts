import * as fs from 'fs';
import * as path from 'path';

const SKIPPED_DIRECTORIES = new Set(['.git', '.vscode', 'node_modules']);

export type ExcludeMap = Record<string, boolean>;

export function findMatchingDirs(root: string, query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const matches: string[] = [];
  walkDirectories(root, '', normalizedQuery, matches);
  return matches.sort(comparePaths);
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

function walkDirectories(
  root: string,
  relativeDir: string,
  normalizedQuery: string,
  matches: string[],
): void {
  const absoluteDir = path.join(root, relativeDir);

  for (const entry of readDirectoryChildren(absoluteDir)) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const childPath = joinRelativePath(relativeDir, entry.name);
    if (entry.name.toLocaleLowerCase().includes(normalizedQuery)) {
      matches.push(childPath);
    }

    walkDirectories(root, childPath, normalizedQuery, matches);
  }
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
