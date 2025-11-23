# TestID Inspector

A Chrome extension that helps developers inspect and interact with `data-testid` attributes on web pages.

## Features

- 🔍 **Side Panel Inspector**: View all test IDs in a convenient Chrome side panel
- ✨ **Bidirectional Highlighting**: 
  - Hover over UI elements to highlight the corresponding item in the list
  - Hover over list items to highlight the UI element
- 🎯 **Smart Detection**: Automatically detects test IDs even in modals and dynamically loaded content
- 🎨 **Visual Feedback**: Clear visual highlighting with smooth transitions

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension directory

## Usage

1. Click the extension icon in your Chrome toolbar
2. Toggle the extension on (it opens automatically)
3. A small "🧪 IDs" button appears in the top-right corner - click it to open the side panel
4. Hover over UI elements to see them highlighted in the list
5. Hover over list items to highlight the corresponding UI element

## Development

This extension uses:
- **Manifest V3** for Chrome compatibility
- **Shadow DOM** for UI isolation
- **Chrome Side Panel API** for native browser integration
- **Chrome Storage API** for reliable communication between components

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main content script that detects and highlights test IDs
- `sidebar.html/js` - Side panel UI and logic
- `popup.html/js` - Extension toolbar popup
- `background.js` - Service worker for side panel management
- `highlight.css` - Styles for highlighting

## License

MIT

