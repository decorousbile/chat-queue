/**
 * Perplexity Chat Queue – Background Script
 * Opens GitHub page on icon click & handles desktop notifications
 */

// Open GitHub when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://github.com/decorousbile/chat-queue' });
});

// Desktop notification when queue completes
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
