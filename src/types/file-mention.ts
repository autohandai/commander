export interface FileInfo {
  name: string;
  path: string;
  relative_path: string;
  is_directory: boolean;
  extension?: string;
}

export interface DirectoryListing {
  current_directory: string;
  files: FileInfo[];
}

export interface FileMentionOptions {
  directory_path?: string;
  extensions?: string[];
  max_depth?: number;
}

export interface FileSearchOptions extends FileMentionOptions {
  search_term: string;
}

// Common file extensions for code files
export const CODE_EXTENSIONS = [
  'rs', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
  'go', 'php', 'rb', 'swift', 'kt', 'cs', 'dart', 'vue', 'svelte',
  'html', 'css', 'scss', 'sass', 'less', 'md', 'txt', 'json', 'yaml', 'yml',
  'toml', 'xml', 'sql', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd'
] as const;

export type CodeExtension = typeof CODE_EXTENSIONS[number];

// Helper functions for working with file mentions
export const formatFileForMention = (file: FileInfo): string => {
  return `@${file.relative_path}`;
};

export const extractFilePathFromMention = (mention: string): string => {
  return mention.startsWith('@') ? mention.slice(1) : mention;
};

export const isValidFileMention = (mention: string): boolean => {
  return mention.startsWith('@') && mention.length > 1;
};