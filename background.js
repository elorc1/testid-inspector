// Background service worker for Chrome extension
// Handles side panel opening and state management

// Configure side panel on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    path: 'sidebar.html',
    enabled: true
  });
});

// Listen for messages from popup, content script, or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.sidePanel.open({ windowId: tabs[0].windowId });
        sendResponse({ success: true });
      }
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'HIGHLIGHT_SIDE_PANEL_ITEM') {
    // Forward message to side panel to highlight item
    chrome.runtime.sendMessage({
      type: 'HIGHLIGHT_ITEM_IN_SIDE_PANEL',
      id: message.id
    }).catch(() => {
      // Side panel might not be open, that's OK
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'TOGGLE_SIDE_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        // Check if side panel is open by trying to get its options
        chrome.sidePanel.getOptions({ tabId: tabs[0].id }, (options) => {
          if (options && options.enabled === false) {
            chrome.sidePanel.setOptions({ 
              tabId: tabs[0].id,
              enabled: true,
              path: 'sidebar.html'
            });
          }
          chrome.sidePanel.open({ windowId: tabs[0].windowId });
          sendResponse({ success: true });
        });
      }
    });
    return true;
  }
});

