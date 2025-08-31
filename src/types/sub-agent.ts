export interface SubAgent {
  name: string;
  description: string;
  color?: string;
  model?: string;
  content: string;
  file_path: string;
}

export interface SubAgentGroup {
  [cliName: string]: SubAgent[];
}