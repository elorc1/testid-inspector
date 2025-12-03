let enabled = false;
let overlay = null;
let toggleBtn = null;
let refreshInterval = null;
let lastHighlighted = null;
let hoverTimeout = null;
let lastHoveredId = null;
let listItemHoveredElement = null; // Track element highlighted from list hover
let listenersAttached = false; // Track if listeners are attached
let domObserver = null; // MutationObserver for shadow host
let elementMap = new Map(); // Map testid -> element for fast lookup

// Host + shadow root so modals DO NOT override or hide the plugin UI
let shadowHost = null;
let shadowRoot = null;

function createShadowRoot() {
  shadowHost = document.getElementById("testid-inspector-host");
  if (!shadowHost) {
    shadowHost = document.createElement("div");
    shadowHost.id = "testid-inspector-host";
    shadowHost.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
    `;
    
    // Ensure body exists, wait if needed
    const ensureBody = () => {
      if (document.body) {
        document.body.appendChild(shadowHost);
        startDOMObserver();
      } else {
        setTimeout(ensureBody, 100);
      }
    };
    ensureBody();
    
    shadowRoot = shadowHost.attachShadow({ mode: "open" });
    
    // Add styles to shadow root to enable pointer events on children
    const style = document.createElement("style");
    style.textContent = `
      * {
        pointer-events: auto !important;
      }
    `;
    shadowRoot.appendChild(style);
  } else {
    shadowRoot = shadowHost.shadowRoot;
  }
}

function startDOMObserver() {
  if (domObserver) return;
  
  // Monitor if shadow host is removed from DOM and watch for new modals
  domObserver = new MutationObserver((mutations) => {
    if (!shadowHost || !document.body.contains(shadowHost)) {
      // Shadow host was removed, recreate it
      if (enabled) {
        shadowHost = null;
        shadowRoot = null;
        createShadowRoot();
        if (overlay && shadowRoot) {
          // Re-add overlay and toggle button
          shadowRoot.appendChild(overlay);
          shadowRoot.appendChild(toggleBtn);
        }
      }
    }
    
    // Watch for new modals/dialogs being added
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          // If a modal-like element is added, refresh the test ID list
          if (node.matches && (
            node.matches('[role="dialog"]') ||
            node.matches('.modal') ||
            node.classList?.toString().toLowerCase().includes('modal') ||
            node.classList?.toString().toLowerCase().includes('dialog')
          )) {
            // Refresh test ID list to include new modal elements
            if (enabled && refreshInterval) {
              setTimeout(() => {
                if (enabled) populate();
              }, 300);
            }
          }
        }
      });
    });
  });
  
  // Observe body for child removals and additions (including modals in subtree)
  if (document.body) {
    domObserver.observe(document.body, {
      childList: true,
      subtree: true // Changed to true to catch modals in the subtree
    });
  }
  
  // Also observe document for body creation
  if (!document.body) {
    const bodyObserver = new MutationObserver(() => {
      if (document.body && shadowHost && !document.body.contains(shadowHost)) {
        document.body.appendChild(shadowHost);
        if (domObserver && !domObserver.disconnected) {
          domObserver.observe(document.body, {
            childList: true,
            subtree: false
          });
        }
      }
    });
    bodyObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}

let overlayPosition = { x: null, y: null };
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// No longer creating overlay - using side panel instead
function createUI() {
  // This function is kept for compatibility but doesn't create overlay anymore
  // The overlay is replaced by the Chrome side panel
}

function destroyUI() {
  if (refreshInterval) clearInterval(refreshInterval);
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  if (listenersAttached) {
    document.removeEventListener("mouseover", handleHover, true);
    document.removeEventListener("mouseenter", handleHover, true);
    window.removeEventListener("mouseover", handleHover, true);
    document.removeEventListener("click", handleClick, true);
    listenersAttached = false;
  }

  clearActiveHighlight();
  if (listItemHoveredElement) {
    listItemHoveredElement.classList.remove("testid-hover-highlight");
    listItemHoveredElement = null;
  }

  // Remove toggle button
  if (toggleBtn && toggleBtn.parentNode) {
    toggleBtn.parentNode.removeChild(toggleBtn);
    toggleBtn = null;
  }

  // Clean up shadow host if no longer needed
  if (shadowHost && shadowHost.parentNode && !toggleBtn) {
    shadowHost.remove();
    shadowHost = null;
    shadowRoot = null;
  }

  overlay = null;
  refreshInterval = null;
  elementMap.clear();
}

function toggleHighlights() {
  enabled = !enabled;
  document.documentElement.classList.toggle("show-testids", enabled);
  if (enabled) {
    // Only create toggle button, no overlay
    if (!toggleBtn) {
      createShadowRoot();
      toggleBtn = document.createElement("div");
      toggleBtn.id = "testid-toggle";
      toggleBtn.textContent = "🧪 IDs";
      toggleBtn.title = "Click to open TestID Viewer side panel";
      toggleBtn.onclick = () => {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, () => {
          if (chrome.runtime.lastError) {
            console.debug("Error opening side panel:", chrome.runtime.lastError);
          }
        });
      };
      shadowRoot.appendChild(toggleBtn);
    }
    attachPageListeners();
  } else {
    // Clean up toggle button
    if (toggleBtn && toggleBtn.parentNode) {
      toggleBtn.parentNode.removeChild(toggleBtn);
      toggleBtn = null;
    }
  }
}

function collectTestIds() {
  // Collect from main document
  const elements = Array.from(document.querySelectorAll("[data-testid]"));
  
  // Also check for elements in modals, portals, and shadow DOMs
  // Look for common modal containers
  const modalSelectors = [
    '[role="dialog"]',
    '.modal',
    '[class*="Modal"]',
    '[class*="modal"]',
    '[class*="Dialog"]',
    '[class*="dialog"]',
    '[class*="Overlay"]',
    '[class*="overlay"]',
    '[class*="Popup"]',
    '[class*="popup"]',
    '[id*="modal"]',
    '[id*="Modal"]',
    '[id*="dialog"]',
    '[id*="Dialog"]'
  ];
  
  modalSelectors.forEach(selector => {
    try {
      const modals = document.querySelectorAll(selector);
      modals.forEach(modal => {
        const modalElements = modal.querySelectorAll("[data-testid]");
        modalElements.forEach(el => {
          if (!elements.includes(el)) {
            elements.push(el);
          }
        });
      });
    } catch (e) {
      // Ignore selector errors
    }
  });
  
  return elements.map(el => ({
    id: el.getAttribute("data-testid"),
    el,
    // Collect metadata for PageObject generation
    tagName: el.tagName.toLowerCase(),
    type: el.getAttribute("type") || null,
    role: el.getAttribute("role") || null
  }));
}

function clearActiveHighlight() {
  if (lastHighlighted) {
    lastHighlighted.classList.remove("testid-active-highlight");
    lastHighlighted = null;
  }
}

function clearHoverHighlight() {
  if (listItemHoveredElement) {
    listItemHoveredElement.classList.remove("testid-hover-highlight");
    listItemHoveredElement = null;
  }
}

function highlightElement(el) {
  if (!el) return;
  clearActiveHighlight();
  el.classList.add("testid-active-highlight");
  lastHighlighted = el;
}

// No longer populating overlay - side panel handles its own list
function populate() {
  // This function is kept for compatibility but doesn't populate overlay anymore
  // The side panel (sidebar.js) handles its own list population
}

function attachPageListeners() {
  if (listenersAttached) return; // Prevent duplicate listeners
  
  // Use capture phase to catch events even in shadow DOM or modals
  // Also listen on window to catch events from iframes and modals
  document.addEventListener("mouseover", handleHover, true);
  document.addEventListener("mouseenter", handleHover, true);
  window.addEventListener("mouseover", handleHover, true);
  document.addEventListener("click", handleClick, true);
  listenersAttached = true;
}

function handleHover(e) {
  // Don't process hover if it's within our shadow DOM
  if (e.target && e.target.closest && e.target.closest("#testid-inspector-host")) return;
  
  // Find the closest element with data-testid, traversing up the DOM tree
  let target = e.target;
  let maxDepth = 20; // Increased depth for nested modals
  let depth = 0;
  
  while (target && depth < maxDepth) {
    if (target.hasAttribute && target.hasAttribute("data-testid")) {
      break;
    }
    target = target.parentElement;
    depth++;
  }
  
  if (!target || !target.hasAttribute || !target.hasAttribute("data-testid")) return;
  if (!enabled) return;

  const id = target.getAttribute("data-testid");
  if (!id || id === lastHoveredId) return;

  lastHoveredId = id;
  clearTimeout(hoverTimeout);

  // Send message to side panel to highlight the item - reduced delay for better responsiveness
  hoverTimeout = setTimeout(() => {
    const timestamp = Date.now();
    
    console.log('[TestID] Hovering on:', id);
    
    // Use storage to communicate with side panel (more reliable than messages)
    chrome.storage.local.set({ 
      highlightTestId: id,
      highlightTimestamp: timestamp
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[TestID] Storage write error:', chrome.runtime.lastError);
      } else {
        console.log('[TestID] Storage written:', id);
      }
    });
    
    // Also try direct message as backup
    chrome.runtime.sendMessage({ 
      type: "HIGHLIGHT_SIDE_PANEL_ITEM", 
      id: id 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('[TestID] Message error:', chrome.runtime.lastError.message);
      } else {
        console.log('[TestID] Message sent:', id);
      }
    });
  }, 150); // Reduced to 150ms for faster response
}

function handleClick(e) {
  // Don't process click if it's within our shadow DOM
  if (e.target.closest("#testid-inspector-host")) return;
  
  const target = e.target.closest("[data-testid]");
  if (!target || !overlay || !shadowRoot) return;

  const id = target.getAttribute("data-testid");
  const item = shadowRoot.querySelector(`.testid-item[data-testid="${id}"]`);
  if (item) {
    item.style.background = "rgba(0,255,255,0.5)";
    item.style.transition = "background 0.7s";
    setTimeout(() => (item.style.background = ""), 1500);
  }
}

document.addEventListener("mouseleave", () => {
  lastHoveredId = null;
  clearTimeout(hoverTimeout);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TESTIDS") {
    const collected = collectTestIds();
    // Return both simple IDs array (for backward compatibility) and full metadata
    sendResponse({ 
      testIds: collected.map(x => x.id),
      testIdsWithMeta: collected.map(x => ({
        id: x.id,
        tagName: x.tagName,
        type: x.type,
        role: x.role
      }))
    });
    return true; // Keep channel open for async response
  }

  if (msg.type === "HIGHLIGHT") {
    const el = document.querySelector(`[data-testid="${msg.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightElement(el);
    }
    sendResponse({ success: !!el });
    return true;
  }

  if (msg.type === "HOVER_HIGHLIGHT") {
    // Disabled - main functionality is to highlight list items, not UI elements
    // Keeping this for potential future use but not actively highlighting UI
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === "CLEAR_HOVER_HIGHLIGHT") {
    clearHoverHighlight();
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === "TOGGLE_TESTIDS") {
    enabled = msg.enabled ?? false;
    document.documentElement.classList.toggle("show-testids", enabled);
    if (enabled) {
      // Create toggle button and attach listeners
      if (!toggleBtn) {
        createShadowRoot();
        toggleBtn = document.createElement("div");
        toggleBtn.id = "testid-toggle";
        toggleBtn.textContent = "🧪 IDs";
        toggleBtn.title = "Click to open TestID Viewer side panel";
        toggleBtn.onclick = () => {
          chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, () => {
            if (chrome.runtime.lastError) {
              console.debug("Error opening side panel:", chrome.runtime.lastError);
            }
          });
        };
        shadowRoot.appendChild(toggleBtn);
      }
      attachPageListeners();
      console.log('[TestID] Extension enabled, listeners attached');
    } else {
      destroyUI();
      console.log('[TestID] Extension disabled');
    }
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === "HIGHLIGHT_SIDE_PANEL_ITEM") {
    // This message is forwarded from background to side panel
    // Content script doesn't handle it, but we keep it for compatibility
    sendResponse({ success: true });
    return true;
  }
  
  return false; // Don't keep channel open for unknown messages
});

// Load initial state and initialize
chrome.storage.sync.get("testidEnabled", ({ testidEnabled }) => {
  const init = () => {
    if (testidEnabled !== false) {
      enabled = true;
      document.documentElement.classList.add("show-testids");
      // Create toggle button and attach listeners
      if (!toggleBtn) {
        createShadowRoot();
        toggleBtn = document.createElement("div");
        toggleBtn.id = "testid-toggle";
        toggleBtn.textContent = "🧪 IDs";
        toggleBtn.title = "Click to open TestID Viewer side panel";
        toggleBtn.onclick = () => {
          chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, () => {
            if (chrome.runtime.lastError) {
              console.debug("Error opening side panel:", chrome.runtime.lastError);
            }
          });
        };
        shadowRoot.appendChild(toggleBtn);
      }
      attachPageListeners();
      console.log('[TestID] Extension initialized and enabled');
    }
  };
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
});
