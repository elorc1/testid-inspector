let refreshInterval = null;
let currentHoveredId = null;
let highlightedItem = null;
let elementMetaMap = new Map(); // Store element metadata for PageObject generation
let activeContextMenu = null; // Track active context menu

// ==================== PageObject Generation ====================

/**
 * Convert test-id to snake_case
 * e.g. "ha-status-icon" -> "ha_status_icon"
 */
function toSnakeCase(testId) {
  return testId.toLowerCase().replace(/-/g, '_');
}

/**
 * Generate PageObject method - always returns WebElement
 */
function generatePageObjectMethod(testId) {
  const snakeName = toSnakeCase(testId);
  const xpath = `//*[@data-testid="${testId}"]`;
  
  return `def get_${snakeName}(self) -> WebElement:
    """
    Get '${snakeName}' web element
    """
    logger.debug("Get '${snakeName}' web element")
    element = self._browser.find_element_by_xpath(
        '${xpath}'
    )
    return element`;
}

// ==================== Context Menu ====================

function createContextMenu() {
  const menu = document.createElement('div');
  menu.className = 'testid-context-menu';
  menu.innerHTML = `
    <div class="context-menu-item" data-action="copy-testid">
      <span class="menu-icon">[id]</span> Copy test-id
    </div>
    <div class="context-menu-item" data-action="copy-xpath">
      <span class="menu-icon">//</span> Copy XPath
    </div>
    <div class="context-menu-item" data-action="copy-pageobject">
      <span class="menu-icon">def</span> Copy PageObject method
    </div>
  `;
  return menu;
}

function showContextMenu(event, testId) {
  event.preventDefault();
  hideContextMenu();
  
  const menu = createContextMenu();
  activeContextMenu = menu;
  
  // Position the menu
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  
  // Handle menu item clicks
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item) return;
    
    const action = item.dataset.action;
    let textToCopy = '';
    
    switch (action) {
      case 'copy-testid':
        textToCopy = `data-testid="${testId}"`;
        break;
      case 'copy-xpath':
        textToCopy = `//*[@data-testid="${testId}"]`;
        break;
      case 'copy-pageobject':
        textToCopy = generatePageObjectMethod(testId);
        break;
    }
    
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showCopyFeedback(item);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  });
  
  document.body.appendChild(menu);
  
  // Adjust position if menu goes off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
  
  // Close menu on outside click
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  if (activeContextMenu && activeContextMenu.parentNode) {
    activeContextMenu.parentNode.removeChild(activeContextMenu);
    activeContextMenu = null;
  }
}

function showCopyFeedback(element) {
  const originalText = element.innerHTML;
  element.innerHTML = '<span class="menu-icon">✅</span> Copied!';
  element.classList.add('copied');
  
  setTimeout(() => {
    hideContextMenu();
  }, 600);
}

function highlightItemInList(id) {
  if (!id) {
    console.log('[TestID Side Panel] highlightItemInList called with no id');
    return;
  }
  
  console.log('[TestID Side Panel] highlightItemInList called with:', id);
  
  // Clear previous highlight
  if (highlightedItem) {
    highlightedItem.style.background = "";
    highlightedItem.classList.remove("testid-item-highlighted");
    if (highlightedItem.highlightTimeout) {
      clearTimeout(highlightedItem.highlightTimeout);
    }
    highlightedItem = null;
  }

  // Wait a bit for DOM to be ready if list is still loading
  const findAndHighlight = (retryCount = 0) => {
    let item = null;
    
    // Method 1: Try direct query with CSS.escape
    try {
      item = document.querySelector(`.testid-item[data-testid="${CSS.escape(id)}"]`);
      console.log('[TestID Side Panel] Method 1 (CSS.escape):', item ? 'FOUND' : 'not found');
    } catch (e) {
      console.log('[TestID Side Panel] CSS.escape failed:', e.message);
      // Fallback without CSS.escape
      item = document.querySelector(`.testid-item[data-testid="${id}"]`);
      console.log('[TestID Side Panel] Method 1 (no escape):', item ? 'FOUND' : 'not found');
    }
    
    // Method 2: Search by text content if data attribute doesn't work
    if (!item) {
      const allItems = document.querySelectorAll(".testid-item");
      console.log(`[TestID Side Panel] Method 2: Searching ${allItems.length} items by text`);
      for (const listItem of allItems) {
        const text = listItem.textContent || "";
        const attr = listItem.getAttribute('data-testid');
        
        // Try multiple formats - be more flexible with matching
        const idQuoted = `"${id}"`;
        const idSingleQuoted = `'${id}'`;
        const fullAttr = `data-testid="${id}"`;
        const fullAttrSingle = `data-testid='${id}'`;
        
        // More flexible matching - check if the ID appears anywhere in the text
        if (attr === id ||
            text.includes(idQuoted) || 
            text.includes(idSingleQuoted) ||
            text.includes(fullAttr) ||
            text.includes(fullAttrSingle) ||
            text.trim() === idQuoted ||
            text.trim() === fullAttr ||
            text.endsWith(idQuoted) ||
            text.endsWith(fullAttr)) {
          item = listItem;
          console.log('[TestID Side Panel] Method 2: FOUND by text/attr match');
          break;
        }
      }
    }

    if (item) {
      console.log('[TestID Side Panel] Item FOUND, highlighting');
      highlightedItem = item;
      
      // Clear all other highlights first
      document.querySelectorAll(".testid-item").forEach(i => {
        if (i !== item) {
          i.style.background = "";
          i.classList.remove("testid-item-highlighted");
          if (i.highlightTimeout) {
            clearTimeout(i.highlightTimeout);
          }
        }
      });
      
      // Highlight the item with slower, more deliberate animation
      item.style.background = "rgba(0,255,255,0.6)"; // More visible
      item.style.transition = "background 0.5s ease, outline 0.5s ease";
      item.classList.add("testid-item-highlighted");
      
      // Scroll to item with slower animation
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (item && item.parentNode) {
            try {
              item.scrollIntoView({ 
                behavior: "smooth", 
                block: "center", 
                inline: "nearest" 
              });
              console.log('[TestID Side Panel] Scrolled to item');
            } catch (e) {
              // Fallback scroll
              item.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        }, 100); // Small delay before scrolling
      });

      // Clear highlight after longer duration (6 seconds) for better visibility
      item.highlightTimeout = setTimeout(() => {
        if (item) {
          // Fade out slowly
          item.style.transition = "background 0.8s ease, outline 0.8s ease";
          item.style.background = "";
          item.classList.remove("testid-item-highlighted");
          if (highlightedItem === item) {
            highlightedItem = null;
          }
          console.log('[TestID Side Panel] Highlight cleared after 6s');
        }
      }, 6000); // Increased to 6 seconds for better identification
    } else {
      // Item not found yet, might be loading - retry with limit
      if (retryCount < 15) {
        console.log(`[TestID Side Panel] Item not found, retry ${retryCount + 1}/15`);
        setTimeout(() => findAndHighlight(retryCount + 1), 150);
      } else {
        console.error('[TestID Side Panel] Item NOT FOUND after 15 retries. ID:', id);
        console.log('[TestID Side Panel] Available IDs:', 
          Array.from(document.querySelectorAll('.testid-item')).map(i => i.getAttribute('data-testid')).slice(0, 10)
        );
      }
    }
  };
  
  findAndHighlight();
}

function updateList(testIds, testIdsWithMeta) {
  const list = document.getElementById("list");
  if (!list) return;
  
  list.innerHTML = "";

  if (!testIds || testIds.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.textContent = "No data-testid attributes found";
    emptyMsg.style.color = "#888";
    emptyMsg.style.padding = "10px";
    emptyMsg.style.textAlign = "center";
    list.appendChild(emptyMsg);
    return;
  }

  // Store metadata in map for PageObject generation
  if (testIdsWithMeta) {
    testIdsWithMeta.forEach(item => {
      elementMetaMap.set(item.id, {
        tagName: item.tagName,
        type: item.type,
        role: item.role
      });
    });
  }

  testIds.forEach(id => {
    const div = document.createElement("div");
    div.className = "testid-item";
    
    // Create text span
    const textSpan = document.createElement("span");
    textSpan.className = "testid-text";
    textSpan.textContent = `data-testid="${id}"`;
    div.appendChild(textSpan);
    
    // Create menu button (small, unobtrusive)
    const menuBtn = document.createElement("button");
    menuBtn.className = "testid-menu-btn";
    menuBtn.textContent = "⋮";
    menuBtn.title = "Copy options";
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      showContextMenu(e, id);
    };
    div.appendChild(menuBtn);
    
    // CRITICAL: Set data attribute for reliable lookup
    div.setAttribute("data-testid", id);
    div.dataset.testid = id; // Also set via dataset for compatibility
    
    // Click handler - highlight and copy
    div.onclick = () => {
      sendMessageToTab({ type: "HIGHLIGHT", id }, () => {
        // Copy to clipboard
        navigator.clipboard.writeText(`data-testid="${id}"`).catch(err => {
          // Silent fail
        });
      });
    };

    // Right-click handler for context menu
    div.addEventListener("contextmenu", (e) => {
      showContextMenu(e, id);
    });

    // Hover handlers for bidirectional highlighting (disabled - main focus is list highlighting)
    div.addEventListener("mouseenter", () => {
      if (currentHoveredId !== id) {
        currentHoveredId = id;
        // Disabled UI highlighting - main functionality is list highlighting
        // sendMessageToTab({ type: "HOVER_HIGHLIGHT", id });
      }
    });

    div.addEventListener("mouseleave", () => {
      if (currentHoveredId === id) {
        currentHoveredId = null;
        // sendMessageToTab({ type: "CLEAR_HOVER_HIGHLIGHT" });
      }
    });

    list.appendChild(div);
  });
}

// Helper function to safely send messages to content script
function sendMessageToTab(message, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.debug("Error querying tabs:", chrome.runtime.lastError);
      if (callback) callback();
      return;
    }
    
    if (!tabs || tabs.length === 0) {
      console.debug("No active tab found");
      if (callback) callback();
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be ready yet
        console.debug("Content script not ready:", chrome.runtime.lastError.message);
      }
      if (callback) callback(response);
    });
  });
}

// Fetch test IDs from content script
function refresh() {
  sendMessageToTab({ type: "GET_TESTIDS" }, (response) => {
    if (response && response.testIds) {
      updateList(response.testIds, response.testIdsWithMeta);
    } else {
      // If no response, show empty state
      updateList([], null);
    }
  });
}

// Initialize search filter
function initSearch() {
  const searchInput = document.getElementById("search");
  if (!searchInput) {
    // Retry if DOM not ready
    setTimeout(initSearch, 100);
    return;
  }

  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    [...document.querySelectorAll(".testid-item")].forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(term)
        ? "block"
        : "none";
    });
  });
}

// Start refresh interval
function startRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(refresh, 800);
  // Initial refresh
  refresh();
}

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
});

// Listen for messages from content script to highlight items
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "HIGHLIGHT_ITEM_IN_SIDE_PANEL") {
    if (message.id) {
      highlightItemInList(message.id);
    }
    sendResponse({ success: true });
    return true;
  }
  return false;
});

// Watch for storage changes (more reliable than messages)
let lastProcessedId = null;
let lastProcessedTimestamp = 0;

chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('[TestID Side Panel] Storage changed:', areaName, changes);
  if (areaName === 'local' && changes.highlightTestId) {
    const newId = changes.highlightTestId.newValue;
    const timestamp = changes.highlightTimestamp ? changes.highlightTimestamp.newValue : Date.now();
    
    console.log('[TestID Side Panel] Highlight request:', newId, 'last:', lastProcessedId);
    
    if (newId && (newId !== lastProcessedId || timestamp > lastProcessedTimestamp)) {
      lastProcessedId = newId;
      lastProcessedTimestamp = timestamp;
      console.log('[TestID Side Panel] Processing highlight for:', newId);
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        highlightItemInList(newId);
      }, 50);
    } else {
      console.log('[TestID Side Panel] Skipping duplicate highlight');
    }
  }
});

// Also check storage more frequently to catch updates - this is the primary method
let lastHighlightCheck = 0;
const storagePollInterval = setInterval(() => {
  chrome.storage.local.get(['highlightTestId', 'highlightTimestamp'], (result) => {
    if (result.highlightTestId && result.highlightTimestamp) {
      // Only process if it's a recent highlight (within last 5 seconds) and different from last processed
      const age = Date.now() - result.highlightTimestamp;
      if (age < 5000 && 
          result.highlightTimestamp > lastHighlightCheck &&
          (result.highlightTestId !== lastProcessedId || result.highlightTimestamp > lastProcessedTimestamp)) {
        console.log('[TestID Side Panel] Polling detected highlight:', result.highlightTestId);
        lastHighlightCheck = result.highlightTimestamp;
        lastProcessedId = result.highlightTestId;
        lastProcessedTimestamp = result.highlightTimestamp;
        highlightItemInList(result.highlightTestId);
      }
    }
  });
}, 100); // Check every 100ms for better responsiveness

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  if (storagePollInterval) {
    clearInterval(storagePollInterval);
  }
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initSearch();
    startRefresh();
  });
} else {
  initSearch();
  startRefresh();
}
