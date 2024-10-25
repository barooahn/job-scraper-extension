document.addEventListener('DOMContentLoaded', async () => {
  const { savedJob } = await chrome.storage.local.get('savedJob');
  updateUIFromStorage(savedJob);
  
  // Add event listener for close button
  document.getElementById('closePopup').addEventListener('click', () => window.close());
});

function updateUIFromStorage(savedJob) {
  const resultDiv = document.getElementById('result');
  const button = document.getElementById('scrapeButton');
  const savedJobInfo = document.getElementById('savedJobInfo');

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
    savedJobInfo.innerHTML = '';
    resultDiv.textContent = 'Ready to scrape job details';
    resultDiv.className = '';
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
  await chrome.storage.local.remove('savedJob');
  updateUIFromStorage(null);
}
async function isContentScriptLoaded(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return true;
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
        console.log('Sending saved job data to server');
        const response = await fetch('http://localhost:3000/api/job-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: savedJob.title,
            company: savedJob.company,
            description: savedJob.description,
            link: savedJob.link
          })
        });

        if (response.ok) {
          await chrome.storage.local.remove('savedJob');
          updateUIFromStorage(null);
          resultDiv.innerHTML = 'Data sent successfully! You can close this popup.';
          resultDiv.className = 'success-message';
        } else {
          throw new Error('Failed to send data');
        }
      } catch (error) {
        console.error('Error sending data:', error);
        resultDiv.textContent = 'Error sending data. Please try again.';
        resultDiv.className = 'error-message';
      }
      return;
    }

    if (!tab.url.includes('linkedin.com')) {
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
    }

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

    await chrome.storage.local.set({
      savedJob: {
        title: jobInfo.title,
        company: jobInfo.company,
        description: jobInfo.description,
        link: jobInfo.link
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
    await chrome.storage.local.remove('savedJob');
  } finally {
    button.disabled = false;
  }
});

console.log('Popup script loaded and ready');
