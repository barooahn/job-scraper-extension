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
      '.ember-view [data-test-job-card-company-name]'
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

  console.log('Starting job info scraping...');

  // Try to get the title
  let title = 'Untitled Job';
  for (const selector of selectors.title) {
    const element = document.querySelector(selector);
    if (element?.textContent.trim()) {
      title = element.textContent.trim();
      console.log('Found title:', title);
      break;
    }
  }

  // Try to get the company name
  let company = 'Unknown Company';
  for (const selector of selectors.company) {
    const element = document.querySelector(selector);
    if (element?.textContent.trim()) {
      company = element.textContent.trim();
      console.log('Found company:', company);
      break;
    }
  }

  // Try to get description from API data first
  let description = null;
  try {
    console.log('Attempting to get description from API data...');
    const scripts = document.querySelectorAll('code[id^="bpr-guid-"], script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.data?.description?.text) {
          description = data.data.description.text;
          console.log('Found description in API data');
          break;
        }
        if (data.description) {
          description = data.description;
          console.log('Found description in LD+JSON');
          break;
        }
      } catch (e) {
        console.log('Error parsing script content:', e);
        continue;
      }
    }
  } catch (e) {
    console.log('Error parsing API data:', e);
  }

  // If API method failed, try DOM selectors
  if (!description) {
    console.log('Attempting to get description from DOM...');
    for (const selector of selectors.description) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('Found potential description element:', selector);
        const content = extractContent(element);
        if (content && content.trim().length > 0) {
          description = content;
          console.log('Successfully extracted description');
          break;
        }
      }
    }
  }

  // Additional fallback for job details
  if (!description) {
    console.log('Trying fallback method...');
    const jobDetails = document.querySelector('.jobs-search__job-details');
    if (jobDetails) {
      const content = extractContent(jobDetails);
      if (content && content.trim().length > 0) {
        description = content;
        console.log('Found description using fallback method');
      }
    }
  }

  if (!description) {
    console.error('No description found after all attempts');
    throw new Error('Could not find job description. Please try refreshing the page or selecting a specific job posting.');
  }

  return {
    title,
    company,
    description,
    link: window.location.href
  };
}

function main(sendResponse) {
  try {
    const jobInfo = scrapeJobInfo();
    console.log('Job info scraped successfully:', jobInfo);
    sendResponse({ success: true, data: jobInfo });
  } catch (error) {
    console.error('Error scraping job info:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.action);
  if (request.action === 'scrapeJob') {
    console.log('Received scrapeJob message');
    main(sendResponse);
    return true; // Indicates that we will send a response asynchronously
  } else if (request.action === 'ping') {
    console.log('Received ping message');
    sendResponse({ success: true, message: 'Content script is loaded' });
    return true;
  }
});

console.log('Content script loaded and ready');
