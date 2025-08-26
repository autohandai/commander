# Project Changes History

## Settings Modal Improvements - Round 2

### Issues Identified:
1. Settings modal width is too small - content not fully visible
2. Some UI components in settings are not using shadcn/ui components (native select, etc.)
3. Need to ensure all form elements use proper shadcn/ui components

### Changes Made:

#### 2025-08-26 - Settings Modal Width & Component Updates
- **Issue**: Modal width too narrow, content cramped and not fully visible
- **Solution**: Increased modal width from `max-w-7xl` to larger size for better content visibility
- **Issue**: Native HTML select elements instead of shadcn/ui Select components
- **Solution**: Replaced native select with shadcn/ui Select component for theme selection
- **Issue**: Inconsistent component usage throughout settings
- **Solution**: Audited and replaced all non-shadcn/ui components with proper shadcn/ui equivalents

### Technical Details:
- Modal size adjusted in `DialogContent` className
- Theme selection converted from native `<select>` to shadcn/ui `<Select>`
- Ensured consistent component library usage throughout settings modal
- All form controls now use shadcn/ui components for consistency

### Files Modified:
- `/src/components/SettingsModal.tsx` - Main settings modal component
- `/history.md` - This history file created

### Additional Fixes Applied:

#### 2025-08-26 - Critical Loading Issues Fixed
- **Issue**: LLMs tab and System Prompts failing to load due to provider status checking errors
- **Solution**: Fixed inconsistent `providerStatuses[id]` access - added optional chaining `?.installed`
- **Issue**: Modal width still too narrow for content visibility
- **Solution**: Further increased width from 1400px to 1600px, left panel from w-72 to w-80
- **Result**: Settings now load properly, LLMs tab displays providers, System Prompts accessible

#### Technical Fixes:
- Fixed provider status checks in sorting logic (added `?.installed` optional chaining)
- Fixed auto-fetch logic for consistent provider status checking
- Increased modal dimensions for better UX:
  - Width: `max-w-[1600px] w-[99vw]`
  - Left panel: `w-80` (320px)
- All provider status checks now consistently use optional chaining

#### 2025-08-26 - Fixed LLM Settings Deserialization Error
- **Issue**: LLMs tab showing "Failed to deserialize settings; missing field 'system_prompts'" error
- **Root Cause**: Existing saved settings in Tauri store didn't have the new `system_prompts` field
- **Solution**: Added `#[serde(default)]` attribute to `system_prompts` field in Rust LLMSettings struct
- **Result**: Settings now load properly, backwards compatible with old saved data
- **Technical Fix**: Used serde default to provide empty HashMap when field is missing

#### 2025-08-26 - Major UX Improvements: OpenRouter & System Prompts
- **Issue 1**: OpenRouter required API key to view available models 
- **Solution**: Modified `fetch_openrouter_models()` to work without API key authentication
- **Result**: Users can now browse all OpenRouter models before deciding to configure API key

- **Issue 2**: System prompts were per-provider, adding complexity
- **Solution**: Changed to single global system prompt in General settings
- **Technical Changes**:
  - Updated Rust struct: `system_prompts: HashMap<String, String>` → `system_prompt: String`
  - Updated TypeScript interface to match
  - Moved system prompt textarea from separate tab to General settings
  - Removed System Prompts tab entirely
  - Updated `updateSystemPrompt()` to take single prompt parameter
- **Result**: Simplified UX with one system prompt used across all providers

- **Additional Improvements**:
  - Modal width increased to 90% viewport width with 1600px max
  - OpenRouter models auto-fetch when LLMs tab opens (no API key needed)
  - Improved auto-fetch logic to handle different provider requirements

### Previous History:
- ✅ LLM provider support (OpenAI, OpenRouter, Ollama)
- ✅ Model selection dropdowns with cost display
- ✅ System prompts per provider with persistence
- ✅ Native Tauri v2 implementation with proper plugins
- ✅ Auto-fetch models in parallel when settings open
- ✅ Provider sorting by configuration status
- ✅ Window management and dragging functionality
- ✅ Sidebar implementation and resizing features