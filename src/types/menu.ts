// Menu event types for Tauri native menu integration
export type MenuEventName = 
  | 'menu://new-project'
  | 'menu://clone-project' 
  | 'menu://open-project'
  | 'menu://close-project'
  | 'menu://delete-project';

export type MenuEventPayload<T extends MenuEventName> = T extends 'menu://open-project' 
  ? string 
  : undefined;