/**
 * MindForge Internal Content Scraper
 * Uses Dev.to API to fetch articles for a given topic.
 */

async function fetchDevToArticles(topic) {
  try {
    const topics = ['javascript', 'webdev', 'ai', 'react', 'python', 'typescript', 'css', 'productivity'];
    const finalTopic = topic && topic.trim() !== '' ? topic : topics[Math.floor(Math.random() * topics.length)];
    
    // Normalize for tag (lowercase, no spaces)
    const normalizedTag = finalTopic.toLowerCase().replace(/\s+/g, '');
    let url = `https://dev.to/api/articles?tag=${normalizedTag}&per_page=5`;
    let response = await fetch(url);
    let data = await response.json();

    // If tag returns nothing, try general query with original topic
    if (!data || data.length === 0) {
      const query = encodeURIComponent(finalTopic);
      url = `https://dev.to/api/articles?query=${query}&per_page=5`;
      response = await fetch(url);
      data = await response.json();
    }

    if (!data || !Array.isArray(data)) return [];

    return data.map(item => ({
      title: item.title,
      description: item.description || item.body_markdown?.slice(0, 150) + '...',
      link: item.url,
      source: 'Dev.to',
      topic: finalTopic
    }));
  } catch (err) {
    console.error('[Scraper] Error fetching from Dev.to:', err.message);
    return [];
  }
}

module.exports = {
  fetchDevToArticles
};
