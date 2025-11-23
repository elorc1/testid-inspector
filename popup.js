const toggleBtn = document.getElementById("toggle");
const statusDiv = document.getElementById("status");

// Initialize UI
function init() {
  if (!toggleBtn || !statusDiv) {
    console.error("Required elements not found");
    return;
  }

  // Load saved state
  chrome.storage.sync.get("testidEnabled", (result) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading state:", chrome.runtime.lastError);
      updateUI(true); // Default to enabled on error
      return;
    }
    
    const testidEnabled = result.testidEnabled;
    // Default to true if not set (first time use)
    updateUI(testidEnabled !== false);
  });
}

function updateUI(enabled) {
  if (!toggleBtn || !statusDiv) return;
  
  toggleBtn.textContent = enabled ? "Turn OFF" : "Turn ON";
  toggleBtn.className = enabled ? "" : "off";
  statusDiv.textContent = enabled ? "🔍 TestID Viewer" : "🚫 TestID Viewer";
  statusDiv.style.color = enabled ? "#0ff" : "#888";
}

async function toggleState() {
  try {
    const result = await chrome.storage.sync.get("testidEnabled");
    if (chrome.runtime.lastError) {
      console.error("Error reading state:", chrome.runtime.lastError);
      return;
    }

    const currentState = result.testidEnabled;
    const newState = currentState === false ? true : false;
    
    await chrome.storage.sync.set({ testidEnabled: newState });
    if (chrome.runtime.lastError) {
      console.error("Error saving state:", chrome.runtime.lastError);
      return;
    }

    // Open side panel
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, (response) => {
      if (chrome.runtime.lastError) {
        console.debug("Error opening side panel:", chrome.runtime.lastError);
      }
    });

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.debug("Error querying tabs:", chrome.runtime.lastError);
        updateUI(newState); // Update UI anyway
        return;
      }

      if (!tabs || tabs.length === 0) {
        console.debug("No active tab found");
        updateUI(newState);
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_TESTIDS", enabled: newState }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script might not be ready yet - this is OK
          console.debug("Content script not ready:", chrome.runtime.lastError.message);
        }
        updateUI(newState);
      });
    });
  } catch (error) {
    console.error("Error toggling state:", error);
  }
}

// Attach event listener
if (toggleBtn) {
  toggleBtn.addEventListener("click", toggleState);
} else {
  console.error("Toggle button not found");
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
