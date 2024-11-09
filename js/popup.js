// API endpoint configuration
const API_ENDPOINTS = [
  'http://localhost:3000/api/job-data',
  'https://ai-job-platform-frontend-189284322477.europe-west2.run.app/api/job-data',
  'https://job-ai-platform.vercel.app/api/job-data'
];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  const { savedJob } = await chrome.storage.local.get('savedJob');
  updateUIFromStorage(savedJob);
  
  // Add event listener for close button
  document.getElementById('closePopup')?.addEventListener('click', () => window.close());
});

// Update UI based on saved job data
function updateUIFromStorage(savedJob) {
  const resultDiv = document.getElementById('result');
  const button = document.getElementById('scrapeButton');
  const savedJobInfo = document.getElementById('savedJobInfo');

  // Reset UI elements
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
      
      // Add event listeners
      document.getElementById('clearButton')?.addEventListener('click', clearSavedJob);
      document.getElementById('viewDetailsButton')?.addEventListener('click', toggleJobDetails);
    }
    resultDiv.innerHTML = 'Job details ready to paste!<br/><br/>' +
      '<span class="instructions">Click "Paste Job" in the Jobs AI app to continue.</span>';
    resultDiv.className = 'success-message';
  } else {
    button.textContent = 'Get Job Details';
    resultDiv.textContent = 'Ready to scrape job details';
  }
}

// Toggle job details visibility
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

// Clear saved job data
async function clearSavedJob() {
  // Clear storage
  await chrome.storage.local.clear();
  
  // Reset UI
  const button = document.getElementById('scrapeButton');
  const resultDiv = document.getElementById('result');
  
  button.textContent = 'Get Job Details';
  button.disabled = false;
  resultDiv.textContent = 'Ready to scrape job details';
  resultDiv.className = '';
  
  updateUIFromStorage(null);

  // Notify content script
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, { action: 'clearJobData' });
    }
  } catch (e) {
    console.error('Error clearing content script data:', e);
  }
}

// Try sending job data to endpoints
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

// Send job data to all endpoints
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

// Scrape button click handler
document.getElementById('scrapeButton').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const resultDiv = document.getElementById('result');
  const button = document.getElementById('scrapeButton');

  button.disabled = true;
  resultDiv.className = '';
  resultDiv.textContent = 'Preparing to scrape...';
  
  try {
    console.log('Button clicked, starting scraping process');
    const { savedJob } = await chrome.storage.local.get('savedJob');

    // Check if we have a saved job to send
    if (savedJob) {
      try {
        console.log('Sending saved job data');
        const jobData = {
          title: savedJob.title,
          company: savedJob.company,
          description: savedJob.description,
          link: savedJob.link
        };

        const result = await sendJobData(jobData);
        
        if (result.success) {
          await clearSavedJob();
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

    // Check if we're on LinkedIn jobs
    if (!tab.url.includes('linkedin.com/jobs')) {
      throw new Error('Please navigate to a LinkedIn job posting');
    }

    // Clear any existing data
    await chrome.storage.local.clear();
    
    // Inject content script
    console.log('Injecting content script...');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['js/content-script.js']
    });

    // Wait for script to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Update UI to show scraping status
    resultDiv.textContent = 'Scraping job details...';
    
    // Send scrape request with timeout
    console.log('Sending scrape request...');
    const response = await Promise.race([
      new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'scrapeJob' }, resolve);
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Scraping timed out')), 30000))
    ]);

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to scrape job details');
    }

    const jobInfo = response.data;
    
    // Validate job data
    if (!jobInfo?.title || !jobInfo?.description || jobInfo.description.length < 50) {
      throw new Error('Invalid job data received');
    }

    // Store the job data
    await chrome.storage.local.set({
      savedJob: {
        title: jobInfo.title,
        company: jobInfo.company,
        description: jobInfo.description,
        link: jobInfo.link,
        timestamp: Date.now()
      }
    });

    // Update UI
    updateUIFromStorage({
      title: jobInfo.title,
      company: jobInfo.company,
      description: jobInfo.description,
      link: jobInfo.link
    });

    resultDiv.textContent = 'Job details scraped successfully!';
    resultDiv.className = 'success-message';

  } catch (error) {
    console.error('Scraping error:', error);
    resultDiv.textContent = 'Error: ' + error.message;
    resultDiv.className = 'error-message';
    button.textContent = 'Get Job Details';
    await clearSavedJob();
  } finally {
    button.disabled = false;
  }
});

console.log('Popup script loaded and ready');