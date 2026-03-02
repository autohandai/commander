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

// Common file extensions for code files
export const CODE_EXTENSIONS = [
  'rs', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
  'go', 'php', 'rb', 'swift', 'kt', 'cs', 'dart', 'vue', 'svelte',
  'html', 'css', 'scss', 'sass', 'less', 'md', 'txt', 'json', 'yaml', 'yml',
  'toml', 'xml', 'sql', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd'
] as const;