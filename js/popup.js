document.addEventListener('DOMContentLoaded', async () => {
  const { savedJob } = await chrome.storage.local.get('savedJob');
  updateUIFromStorage(savedJob);
  
  // Add event listener for close button
  document.getElementById('closePopup').addEventListener('click', () => window.close());
});

// API endpoint configuration
const API_ENDPOINTS = [
  'http://localhost:3000/api/job-data',
  'https://ai-job-platform-frontend-189284322477.europe-west2.run.app/api/job-data',
  'https://job-ai-platform.vercel.app/api/job-data'
];

async function tryEndpoint(endpoint, jobData) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobData)
    });
    
    if (response.ok) {
      return { success: true, endpoint };
    }
    return { success: false, error: `Failed to send data to ${endpoint}` };
  } catch (error) {
    console.error(`Error with endpoint ${endpoint}:`, error);
    return { success: false, error: error.message };
  }
}

async function sendJobData(jobData) {
  let lastError = null;
  
  for (const endpoint of API_ENDPOINTS) {
    const result = await tryEndpoint(endpoint, jobData);
    if (result.success) {
      console.log(`Successfully sent data to ${endpoint}`);
      return { success: true, endpoint };
    }
    lastError = result.error;
  }
  
  throw new Error(`All endpoints failed. Last error: ${lastError}`);
}

function updateUIFromStorage(savedJob) {
  const resultDiv = document.getElementById('result');
  const button = document.getElementById('scrapeButton');
  const savedJobInfo = document.getElementById('savedJobInfo');

  // Reset UI elements first
  button.disabled = false;
  resultDiv.className = '';
  savedJobInfo.innerHTML = '';

  if (savedJob) {
    button.textContent = 'Paste Job';
    if (savedJob.title) {
      savedJobInfo.innerHTML = `
        <div class="saved-job">
          <h3>Currently Saved Job:</h3>
          <p>${savedJob.title}</p>
          <p>${savedJob.company}</p>
          <div class="button-group">
            <button id="viewDetailsButton" class="secondary-button">View Details</button>
            <button id="clearButton" class="secondary-button">Clear Saved Job</button>
          </div>
          <div id="jobDetailsContainer" class="job-details-container" style="display: none;">
            <h4>Job Description:</h4>
            <div class="job-description-text">${savedJob.description}</div>
            <p class="job-link"><strong>Link:</strong> <a href="${savedJob.link}" target="_blank">${savedJob.link}</a></p>
          </div>
        </div>
      `;
      
      // Add event listeners for the buttons
      document.getElementById('clearButton').addEventListener('click', clearSavedJob);
      document.getElementById('viewDetailsButton').addEventListener('click', toggleJobDetails);
    }
    resultDiv.innerHTML = 'Job details ready to paste!<br/><br/>' +
      '<span class="instructions">Click "Paste Job" in the Jobs AI app to continue.</span>';
    resultDiv.className = 'success-message';
  } else {
    button.textContent = 'Get Job Details';
    resultDiv.textContent = 'Ready to scrape job details';
  }
}

function toggleJobDetails() {
  const detailsContainer = document.getElementById('jobDetailsContainer');
  const viewDetailsButton = document.getElementById('viewDetailsButton');
  
  if (detailsContainer.style.display === 'none') {
    detailsContainer.style.display = 'block';
    viewDetailsButton.textContent = 'Hide Details';
  } else {
    detailsContainer.style.display = 'none';
    viewDetailsButton.textContent = 'View Details';
  }
}

async function clearSavedJob() {
  // Clear both storage and UI
  await chrome.storage.local.clear(); // Clear all storage instead of just removing 'savedJob'
  const button = document.getElementById('scrapeButton');
  button.textContent = 'Get Job Details';
  button.disabled = false;
  updateUIFromStorage(null);
  
  // Force refresh the active tab to ensure clean state
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.tabs.sendMessage(tab.id, { action: 'clearJobData' });
  }
  
  // Reset the result div
  const resultDiv = document.getElementById('result');
  resultDiv.textContent = 'Ready to scrape job details';
  resultDiv.className = '';
}

async function isContentScriptLoaded(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return response && response.success;
  } catch (error) {
    console.log('Content script not loaded:', error);
    return false;
  }
}

function sendMessageToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

document.getElementById('scrapeButton').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const resultDiv = document.getElementById('result');
  const button = document.getElementById('scrapeButton');

  button.disabled = true;
  resultDiv.className = '';
  
  try {
    console.log('Button clicked, starting scraping process');
    const { savedJob } = await chrome.storage.local.get('savedJob');

    if (savedJob) {
      try {
        console.log('Attempting to send saved job data');
        const jobData = {
          title: savedJob.title,
          company: savedJob.company,
          description: savedJob.description,
          link: savedJob.link
        };

        const result = await sendJobData(jobData);
        
        if (result.success) {
          await clearSavedJob(); // Use the new clearSavedJob function
          resultDiv.innerHTML = `Data sent successfully to ${result.endpoint}! You can close this popup.`;
          resultDiv.className = 'success-message';
        }
      } catch (error) {
        console.error('Error sending data:', error);
        resultDiv.textContent = `Error sending data: ${error.message}`;
        resultDiv.className = 'error-message';
      }
      return;
    }

    if (!tab.url.includes('linkedin.com/jobs')) {
      throw new Error('Please navigate to a LinkedIn job posting');
    }

    resultDiv.textContent = 'Scraping job details...';
    
    console.log('Checking if content script is loaded');
    const isLoaded = await isContentScriptLoaded(tab.id);
    if (!isLoaded) {
      console.log('Content script not loaded, injecting it now');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['js/content-script.js']
      });
      // Wait a short time for the content script to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Clear any existing job data before scraping
    await chrome.storage.local.clear();

    console.log('Sending scrapeJob message to content script');
    const response = await sendMessageToContentScript(tab.id, { action: 'scrapeJob' });
    console.log('Received response from content script:', response);

    if (!response || !response.success) {
      throw new Error(response?.error || 'Unknown error occurred while scraping');
    }

    const jobInfo = response.data;
    
    if (!jobInfo || !jobInfo.description || jobInfo.description.trim() === '') {
      throw new Error('No job description found. Please make sure the job details are loaded.');
    }

    // Store the new job data
    await chrome.storage.local.set({
      savedJob: {
        title: jobInfo.title,
        company: jobInfo.company,
        description: jobInfo.description,
        link: jobInfo.link,
        timestamp: Date.now() // Add timestamp to track when the job was saved
      }
    });

    updateUIFromStorage({
      title: jobInfo.title,
      company: jobInfo.company,
      description: jobInfo.description,
      link: jobInfo.link
    });

    resultDiv.textContent = 'Job details scraped successfully!';
    resultDiv.className = 'success-message';

  } catch (error) {
    console.error('Error in scraping process:', error);
    resultDiv.textContent = 'Error: ' + error.message;
    resultDiv.className = 'error-message';
    button.textContent = 'Get Job Details';
    await clearSavedJob(); // Use the new clearSavedJob function
  } finally {
    button.disabled = false;
  }
});

console.log('Popup script loaded and ready');