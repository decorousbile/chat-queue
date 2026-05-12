/**
 * Perplexity Chat Queue – Background Script
 * Handles desktop notifications
 */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'NOTIFY_DONE') {
    chrome.notifications.create('pcq-done', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Chat Queue Complete!',
      message: `Successfully sent ${msg.count} messages on Perplexity AI.`,
      priority: 2
    });
  }
});
