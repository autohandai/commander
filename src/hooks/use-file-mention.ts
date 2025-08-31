import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileInfo, DirectoryListing, FileMentionOptions } from '@/types/file-mention';

export interface UseFileMentionReturn {
  files: FileInfo[];
  currentDirectory: string;
  loading: boolean;
  error: string | null;
  
  // Core functions
  getCurrentDirectory: () => Promise<string>;
  setCurrentDirectory: (path: string) => Promise<void>;
  listFiles: (options?: FileMentionOptions) => Promise<void>;
  searchFiles: (searchTerm: string, options?: FileMentionOptions) => Promise<void>;
  getFileInfo: (filePath: string) => Promise<FileInfo | null>;
  
  // Utility functions
  clearFiles: () => void;
  clearError: () => void;
}

export const useFileMention = (): UseFileMentionReturn => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [currentDirectory, setCurrentDirectoryState] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const getCurrentDirectory = useCallback(async (): Promise<string> => {
    try {
      setLoading(true);
      clearError();
      
      const directory = await invoke<string>('get_current_working_directory');
      setCurrentDirectoryState(directory);
      return directory;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get current directory';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [clearError]);

  const setCurrentDirectory = useCallback(async (path: string): Promise<void> => {
    try {
      setLoading(true);
      clearError();
      
      await invoke('set_current_working_directory', { path });
      setCurrentDirectoryState(path);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set current directory';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [clearError]);

  const listFiles = useCallback(async (options?: FileMentionOptions): Promise<void> => {
    try {
      setLoading(true);
      clearError();
      
      const listing = await invoke<DirectoryListing>('list_files_in_directory', {
        directoryPath: options?.directory_path,
        extensions: options?.extensions,
        maxDepth: options?.max_depth,
      });

      // Ensure extension is populated for UI consumers
      const filesWithExt = listing.files.map((f) => ({
        ...f,
        extension: f.extension ?? (f.name.includes('.') ? f.name.split('.').pop()?.toLowerCase() : undefined),
      }))
      setFiles(filesWithExt);
      setCurrentDirectoryState(listing.current_directory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list files';
      setError(errorMessage);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [clearError]);

  const searchFiles = useCallback(async (
    searchTerm: string,
    options?: FileMentionOptions
  ): Promise<void> => {
    if (!searchTerm.trim()) {
      setError('Search term cannot be empty');
      return;
    }

    try {
      setLoading(true);
      clearError();

      const listing = await invoke<DirectoryListing>('search_files_by_name', {
        directoryPath: options?.directory_path,
        searchTerm: searchTerm.trim(),
        extensions: options?.extensions,
        maxDepth: options?.max_depth,
      });

      const filesWithExt = listing.files.map((f) => ({
        ...f,
        extension: f.extension ?? (f.name.includes('.') ? f.name.split('.').pop()?.toLowerCase() : undefined),
      }))
      setFiles(filesWithExt);
      setCurrentDirectoryState(listing.current_directory);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search files';
      setError(errorMessage);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [clearError]);

  const getFileInfo = useCallback(async (filePath: string): Promise<FileInfo | null> => {
    try {
      clearError();
      
      const fileInfo = await invoke<FileInfo | null>('get_file_info', { filePath });
      return fileInfo;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get file info';
      setError(errorMessage);
      return null;
    }
  }, [clearError]);

  // Initialize current directory on mount
  useEffect(() => {
    getCurrentDirectory().catch(() => {
      // Error is already handled in getCurrentDirectory
    });
  }, [getCurrentDirectory]);

  return {
    files,
    currentDirectory,
    loading,
    error,
    getCurrentDirectory,
    setCurrentDirectory,
    listFiles,
    searchFiles,
    getFileInfo,
    clearFiles,
    clearError,
  };
};
