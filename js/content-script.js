console.log('LinkedIn Job Scraper: Content script loaded');

let lastSentJobData = null;

// Function to send logs to the background script
function sendLogToBackground(message) {
  chrome.runtime.sendMessage({type: 'CONTENT_LOG', message: message});
}

// Notify background script that content script is ready
chrome.runtime.sendMessage({type: 'CONTENT_READY'});

// All scraping functions in one content script
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractContent(element) {
  if (!element) return '';
  
  const textParts = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: function(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) textParts.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'BR' || node.tagName === 'P' || node.tagName === 'DIV') {
        textParts.push('\n');
      } else if (node.tagName === 'LI') {
        textParts.push('\n• ');
      }
    }
  }

  return cleanText(textParts.join(' '));
}

function scrapeJobInfo() {
  sendLogToBackground('Starting job info scraping...');

  const selectors = {
    title: [
      '[data-job-title]',
      '.jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title',
      '.topcard__title',
      '.jobs-search__job-details h2',
      '.jobs-search-results-list__title',
      '.job-view-layout h1',
      '.jobs-unified-top-card__job-title',
      '.ember-view [data-test-job-card-title]'
    ],
    company: [
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '.job-card-container__company-name',
      '.jobs-details-top-card__company-url',
      '.ember-view [data-test-job-card-company-name]',
      '.jobs-unified-top-card__subtitle-primary-grouping .jobs-unified-top-card__company-name'
    ],
    description: [
      '.jobs-description',
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.show-more-less-html__markup',
      '#job-details > span',
      '.jobs-box__html-content > span',
      '.description__text',
      '[data-job-description]',
      '.job-view-layout [class*="description"]',
      '.jobs-description-content__text'
    ]
  };

  // Try to get the title
  let title = 'Untitled Job';
  for (const selector of selectors.title) {
    const element = document.querySelector(selector);
    if (element?.textContent.trim()) {
      title = element.textContent.trim();
      sendLogToBackground('Found title: ' + title);
      break;
    }
  }

  // Try to get the company name
  let company = 'Unknown Company';
  for (const selector of selectors.company) {
    const element = document.querySelector(selector);
    if (element?.textContent.trim()) {
      company = element.textContent.trim();
      sendLogToBackground('Found company: ' + company);
      break;
    }
  }

  // Try to get description from API data first
  let description = null;
  try {
    sendLogToBackground('Attempting to get description from API data...');
    const scripts = document.querySelectorAll('code[id^="bpr-guid-"], script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.data?.description?.text) {
          description = data.data.description.text;
          sendLogToBackground('Found description in API data');
          break;
        }
        if (data.description) {
          description = data.description;
          sendLogToBackground('Found description in LD+JSON');
          break;
        }
      } catch (e) {
        sendLogToBackground('Error parsing script content: ' + e.message);
        continue;
      }
    }
  } catch (e) {
    sendLogToBackground('Error parsing API data: ' + e.message);
  }

  // If API method failed, try DOM selectors
  if (!description) {
    sendLogToBackground('Attempting to get description from DOM...');
    for (const selector of selectors.description) {
      const element = document.querySelector(selector);
      if (element) {
        sendLogToBackground('Found potential description element: ' + selector);
        const content = extractContent(element);
        if (content && content.trim().length > 0) {
          description = content;
          sendLogToBackground('Successfully extracted description');
          break;
        }
      }
    }
  }

  // Additional fallback for job details
  if (!description) {
    sendLogToBackground('Trying fallback method...');
    const jobDetails = document.querySelector('.jobs-search__job-details');
    if (jobDetails) {
      const content = extractContent(jobDetails);
      if (content && content.trim().length > 0) {
        description = content;
        sendLogToBackground('Found description using fallback method');
      }
    }
  }

  if (!description) {
    sendLogToBackground('No description found after all attempts');
    throw new Error('Could not find job description. Please try refreshing the page or selecting a specific job posting.');
  }

  return {
    title,
    company,
    description,
    link: window.location.href
  };
}

function sendJobDataToApp(jobData) {
  // Check if the job data is different from the last sent data
  if (JSON.stringify(jobData) === JSON.stringify(lastSentJobData)) {
    sendLogToBackground('Job data unchanged, not sending duplicate data');
    return;
  }

  sendLogToBackground('Preparing to send job data to app and background script');
  const message = {
    type: 'JOB_DATA_UPDATE',
    jobData: jobData
  };
  
  window.postMessage(message, window.location.origin);
  
  // Send job data to background script
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      sendLogToBackground('Error sending JOB_DATA_UPDATE to background: ' + chrome.runtime.lastError.message);
    } else {
      sendLogToBackground('JOB_DATA_UPDATE sent to background. Response: ' + JSON.stringify(response));
      lastSentJobData = jobData; // Update last sent job data
    }
  });
}

function main(sendResponse) {
  try {
    const jobInfo = scrapeJobInfo();
    sendLogToBackground('Job info scraped successfully');
    sendJobDataToApp(jobInfo);
    sendResponse({ success: true, data: jobInfo });
  } catch (error) {
    sendLogToBackground('Error scraping job info: ' + error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeJob') {
    sendLogToBackground('Received scrapeJob message, starting main function');
    main(sendResponse);
    return true; // Indicates that we will send a response asynchronously
  }
});

sendLogToBackground('Content script ready');
