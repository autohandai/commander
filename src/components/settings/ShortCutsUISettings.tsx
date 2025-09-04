/**
 * Shortcuts Settings Component
 * Displays all supported keyboard shortcuts in the application
 */

import { Keyboard, Command } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ShortcutItem {
  id: string;
  name: string;
  description: string;
  shortcut: string;
  category: 'global' | 'menu' | 'navigation';
  platform?: 'mac' | 'windows' | 'linux';
}

const shortcuts: ShortcutItem[] = [
  // Global Shortcuts
  {
    id: 'open-settings',
    name: 'Open Settings',
    description: 'Opens the settings dialog',
    shortcut: 'Cmd+,',
    category: 'global',
    platform: 'mac'
  },
  {
    id: 'toggle-chat',
    name: 'Toggle Chat',
    description: 'Opens or closes the chat interface',
    shortcut: 'Cmd+Shift+P',
    category: 'global',
    platform: 'mac'
  },
  {
    id: 'new-chat',
    name: 'New Chat',
    description: 'Start a new chat session (when chat is open)',
    shortcut: 'Cmd+Shift+N',
    category: 'global',
    platform: 'mac'
  },
  
  // Menu Shortcuts
  {
    id: 'new-project',
    name: 'New Project',
    description: 'Create a new project',
    shortcut: 'Cmd+N',
    category: 'menu'
  },
  {
    id: 'clone-project',
    name: 'Clone Project',
    description: 'Clone a repository',
    shortcut: 'Cmd+Shift+N',
    category: 'menu'
  },
  {
    id: 'open-project',
    name: 'Open Project',
    description: 'Open an existing project',
    shortcut: 'Cmd+O',
    category: 'menu'
  },
  {
    id: 'close-project',
    name: 'Close Project',
    description: 'Close the current project',
    shortcut: 'Cmd+W',
    category: 'menu'
  },
  
  // Navigation Shortcuts
  {
    id: 'quit',
    name: 'Quit Application',
    description: 'Exit the application',
    shortcut: 'Cmd+Q',
    category: 'navigation'
  }
];

const formatShortcut = (shortcut: string): React.ReactNode => {
  return shortcut.split('+').map((key, index, array) => (
    <span key={index} className="inline-flex items-center">
      {key === 'Cmd' && <Command className="h-3 w-3 mr-1" />}
      <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs font-mono">
        {key === 'Cmd' ? '⌘' : 
         key === 'Shift' ? '⇧' : 
         key === 'Option' ? '⌥' : 
         key === 'Ctrl' ? '⌃' : key}
      </kbd>
      {index < array.length - 1 && <span className="mx-1 text-muted-foreground">+</span>}
    </span>
  ));
};

const getCategoryIcon = (category: ShortcutItem['category']) => {
  switch (category) {
    case 'global':
      return '🌐';
    case 'menu':
      return '📋';
    case 'navigation':
      return '🧭';
    default:
      return '⌨️';
  }
};

const getCategoryName = (category: ShortcutItem['category']) => {
  switch (category) {
    case 'global':
      return 'Global Shortcuts';
    case 'menu':
      return 'Menu Actions';
    case 'navigation':
      return 'Navigation';
    default:
      return 'Other';
  }
};

export function ShortCutsUISettings() {
  const categories = Array.from(new Set(shortcuts.map(s => s.category)));
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Keyboard className="h-5 w-5" />
          Keyboard Shortcuts
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          All supported keyboard shortcuts in Commander. These shortcuts work globally throughout the application.
        </p>
      </div>

      <div className="space-y-8">
        {categories.map((category) => {
          const categoryShortcuts = shortcuts.filter(s => s.category === category);
          
          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">{getCategoryIcon(category)}</span>
                <h4 className="font-medium text-base">{getCategoryName(category)}</h4>
                <Badge variant="outline" className="text-xs">
                  {categoryShortcuts.length} shortcuts
                </Badge>
              </div>
              
              <div className="grid gap-3">
                {categoryShortcuts.map((shortcut) => (
                  <Card key={shortcut.id} className="border border-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h5 className="font-medium text-sm">{shortcut.name}</h5>
                            {shortcut.platform && (
                              <Badge variant="secondary" className="text-xs">
                                {shortcut.platform}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {shortcut.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {formatShortcut(shortcut.shortcut)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {category !== categories[categories.length - 1] && (
                <Separator className="mt-6" />
              )}
            </div>
          );
        })}
      </div>
      
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            💡 Tips
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            • On Windows/Linux, <kbd className="px-1 py-0.5 bg-background border rounded text-xs">Cmd</kbd> is replaced with <kbd className="px-1 py-0.5 bg-background border rounded text-xs">Ctrl</kbd>
          </p>
          <p className="text-xs text-muted-foreground">
            • Global shortcuts work even when the app is in the background
          </p>
          <p className="text-xs text-muted-foreground">
            • Menu shortcuts are available through the application menu bar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
