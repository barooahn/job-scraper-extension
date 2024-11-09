// Check if script is already loaded
if (!window.linkedInJobScraperLoaded) {
  window.linkedInJobScraperLoaded = true;

  (function() {
    console.log('LinkedIn Job Scraper: Content script loaded');

    function sendLog(message) {
      console.log('LinkedIn Scraper:', message);
      try {
        chrome.runtime.sendMessage({type: 'CONTENT_LOG', message});
      } catch (e) {
        console.log('Error sending log:', e);
      }
    }

    function cleanText(text) {
      if (!text) return '';
      return text
        .replace(/\s+/g, ' ')
        .replace(/[\n\r]+/g, '\n')
        .trim();
    }

    async function waitForElement(selectors, timeout = 5000) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return null;
    }

    // Click show more button if present
    async function expandDescription() {
      const buttons = document.querySelectorAll('button.show-more-less-html__button--more, button.inline-show-more-text__button');
      for (const button of buttons) {
        if (button.textContent.toLowerCase().includes('show more')) {
          try {
            button.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            sendLog('Expanded description');
          } catch (e) {
            console.error('Error expanding description:', e);
          }
        }
      }
    }

    async function scrapeJob() {
      sendLog('Starting job scraping');
      
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        // Try to expand description first
        await expandDescription();
        
        // Get job title - specifically targeting the correct list view elements
        const titleSelectors = [
          '.jobs-unified-top-card__job-title',
          '.job-card-list__title',
          '.jobs-search-results__list-item.active .job-card-container__job-title',
          'h2[data-test-job-card-title]'
        ];

        const titleElement = await waitForElement(titleSelectors);
        if (!titleElement) {
          throw new Error('Could not find job title');
        }

        const title = cleanText(titleElement.textContent);
        sendLog('Found title: ' + title);

        // Get company name
        const companySelectors = [
          '.jobs-unified-top-card__company-name',
          '.job-card-container__primary-description',
          '.job-card-container__company-name',
          'a[data-tracking-control-name="public_jobs_company-name"]'
        ];

        let company = 'Unknown Company';
        const companyElement = await waitForElement(companySelectors);
        if (companyElement) {
          company = cleanText(companyElement.textContent);
        }
        sendLog('Found company: ' + company);

        // Get description from the job details section
        await expandDescription(); // Try expanding again after delay

        const descriptionSelectors = [
          '.jobs-description__content',
          '.job-details-jobs-unified-top-card__job-insight',
          '.job-view-layout [data-test-job-description]',
          '.jobs-box__html-content',
          '#job-details'
        ];

        let description = '';
        for (const selector of descriptionSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = cleanText(element.textContent);
            if (text.length > 100) {
              description = text;
              sendLog('Found description using: ' + selector);
              break;
            }
          }
        }

        // If no description found in primary locations, try secondary locations
        if (!description) {
          const mainContent = document.querySelector('.jobs-search__job-details--container');
          if (mainContent) {
            const text = cleanText(mainContent.textContent);
            if (text.length > 200) {
              description = text;
              sendLog('Found description in main content');
            }
          }
        }

        if (!description) {
          throw new Error('Could not find job description');
        }

        return {
          title,
          company,
          description,
          link: window.location.href
        };

      } catch (error) {
        sendLog('Error during scraping: ' + error.message);
        throw error;
      }
    }

    // Handle extension messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'scrapeJob') {
        sendLog('Received scrape request');
        
        setTimeout(async () => {
          try {
            const jobData = await scrapeJob();
            sendResponse({ success: true, data: jobData });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        }, 1000);
        
        return true;
      }
      
      if (request.action === 'ping') {
        sendResponse({ success: true });
        return true;
      }
    });

    sendLog('Content script initialization complete');
  })();
}