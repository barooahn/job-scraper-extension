// Keep track of tabs where content script is injected
const injectedTabs = new Set();

// Listen for external messages (from web app)
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    console.log('Received external message:', message);
    console.log('Sender:', sender);
    if (message.action === 'ping') {
      console.log('Responding to ping message');
      sendResponse({ success: true, message: 'Extension is active' });
    } else {
      console.log('Unknown action received:', message.action);
    }
    return true; // Required for async response
  }
);

// Listen for installation events
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed. Reason:', details.reason);
  console.log('Installation details:', details);
});

// Listen for when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
  console.log('Current tab:', tab);
  
  // Send a message to the content script
  chrome.tabs.sendMessage(tab.id, { action: 'scrapeJob' }, (response) => {
    console.log('Received response from content script:', response);
    if (chrome.runtime.lastError) {
      console.error('Error sending message to content script:', chrome.runtime.lastError);
    } else if (response && response.success) {
      console.log('Job data received:', response.data);
    } else {
      console.error('Error scraping job data:', response ? response.error : 'Unknown error');
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const isFromContentScript = sender.tab && sender.tab.id;
  const logPrefix = isFromContentScript ? `[Tab ${sender.tab.id}]` : '[Popup]';

  if (message.type === 'CONTENT_READY') {
    if (isFromContentScript) {
      injectedTabs.add(sender.tab.id);
      console.log(`${logPrefix} Content script ready`);
    }
  } else if (message.type === 'JOB_DATA_UPDATE') {
    console.log(`${logPrefix} Job data update received:`);
    console.log(JSON.stringify(message.jobData, null, 2));
    console.log('Data ready to be sent to app');
    sendResponse({ success: true, message: 'Job data received by background script' });
  } else if (message.type === 'CONTENT_LOG') {
    console.log(`${logPrefix} ${message.message}`);
  } else {
    console.log(`${logPrefix} Unknown message type received:`, message.type);
    sendResponse({ success: false, message: 'Unknown message type' });
  }
  
  return true; // Indicates that we will send a response asynchronously
});

// Function to check if a URL is a LinkedIn job page
function isLinkedInJobPage(url) {
  return url.startsWith('https://www.linkedin.com/jobs/') ||
         url.startsWith('https://www.linkedin.com/job/') ||
         url.startsWith('https://www.linkedin.com/jobs/view/') ||
         url.startsWith('https://www.linkedin.com/jobs/search/');
}

// Send a ping message to the content script every 5 seconds
async function pingContentScript() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (tab && isLinkedInJobPage(tab.url)) {
      console.log('Checking content script on LinkedIn job page:', tab.url);
      if (!injectedTabs.has(tab.id)) {
        console.log('Injecting content script...');
        try {
          await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            files: ['js/content-script.js']
          });
          console.log("Content script injected successfully");
        } catch (injectionError) {
          console.error("Failed to inject content script:", injectionError);
        }
      } else {
        console.log('Content script already injected in this tab');
      }
    } else {
      console.log('Not on a LinkedIn job page, skipping check');
    }
  } catch (error) {
    console.error("Error in pingContentScript:", error);
  }
}

// Start checking for content script every 5 seconds
setInterval(pingContentScript, 5000);

console.log('Background script loaded and ready');
