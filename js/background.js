// Listen for external messages (from web app)
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    console.log('Received external message:', message);
    if (message.action === 'ping') {
      sendResponse({ success: true, message: 'Extension is active' });
    }
    return true; // Required for async response
  }
);

// Listen for installation events
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

// Listen for when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
});

// Log when background script loads
console.log('Background script loaded and ready');