// MindForge — Content Extraction via Mozilla Readability + Site-Specific Extractors
// Runs in content script context. Extracts meaningful text from any page.
// v3.0: Added deep extractors for YouTube, Reddit, and enhanced SPA support.

/**
 * Wait for the DOM to stabilize (content loaded).
 * Uses MutationObserver with a 2s fallback timeout.
 */
function waitForDOMStable(timeout = 2000) {
  return new Promise((resolve) => {
    if (document.readyState === 'complete' && document.body && document.body.textContent.length > 200) {
      resolve();
      return;
    }

    let timer = null;
    let observer = null;

    const done = () => {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      resolve();
    };

    timer = setTimeout(done, timeout);

    if (document.body) {
      let mutationCount = 0;
      observer = new MutationObserver(() => {
        mutationCount++;
        if (mutationCount >= 5) done();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
}

function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

// ═══════════════════════════════════════
//  YOUTUBE DEEP EXTRACTOR
// ═══════════════════════════════════════

function isYouTube() {
  return window.location.hostname.includes('youtube.com');
}

function isYouTubeWatchPage() {
  return isYouTube() && window.location.pathname === '/watch';
}

/**
 * Extract rich content from a YouTube watch page.
 * Reads video title, channel, description, tags, and category.
 */
function extractYouTubeContent() {
  // ── Video Title ──
  // Try multiple selectors because YouTube's DOM changes frequently
  const titleSelectors = [
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-watch-metadata',
    '#title h1 yt-formatted-string',
    '#title h1',
    'h1.title',
    'meta[property="og:title"]',
  ];

  let title = '';
  for (const sel of titleSelectors) {
    if (sel.startsWith('meta')) {
      title = document.querySelector(sel)?.content || '';
    } else {
      title = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (title) break;
  }

  // Fallback to document.title and strip " - YouTube"
  if (!title) {
    title = document.title.replace(/\s*-\s*YouTube\s*$/, '').trim();
  }

  // ── Channel Name ──
  const channelSelectors = [
    '#channel-name yt-formatted-string a',
    '#channel-name a',
    'ytd-channel-name yt-formatted-string a',
    'ytd-channel-name a',
    '#owner-name a',
    '#upload-info a',
  ];

  let channel = '';
  for (const sel of channelSelectors) {
    channel = document.querySelector(sel)?.textContent?.trim() || '';
    if (channel) break;
  }

  // ── Description ──
  const descSelectors = [
    '#description-inline-expander yt-attributed-string',
    '#description yt-formatted-string',
    '#description-text',
    '#description',
    'meta[property="og:description"]',
    'meta[name="description"]',
  ];

  let description = '';
  for (const sel of descSelectors) {
    if (sel.startsWith('meta')) {
      description = document.querySelector(sel)?.content || '';
    } else {
      description = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (description && description.length > 20) break;
  }

  // ── Tags / Keywords ──
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';

  // ── Category from meta ──
  const category = document.querySelector('meta[itemprop="genre"]')?.content || '';

  // ── Combine into rich content string ──
  const parts = [
    title,
    channel ? `Channel: ${channel}` : '',
    description ? description.substring(0, 400) : '',
    keywords ? `Tags: ${keywords}` : '',
    category ? `Category: ${category}` : '',
  ].filter(Boolean);

  const content = parts.join(' | ');

  return {
    title: title || document.title,
    url: window.location.href,
    hostname: window.location.hostname,
    content: content.substring(0, 800),
    extractionMethod: 'youtube-deep',
    siteType: 'youtube',
    channel,
    videoCategory: category,
  };
}

/**
 * Extract content from YouTube non-watch pages (homepage, search, etc.)
 */
function extractYouTubeListContent() {
  const title = document.title.replace(/\s*-\s*YouTube\s*$/, '').trim();
  const pathname = window.location.pathname;

  // Detect page type
  let pageType = 'browse';
  if (pathname.includes('/results')) pageType = 'search';
  else if (pathname === '/' || pathname === '/feed/trending') pageType = 'homepage';
  else if (pathname.startsWith('/@') || pathname.startsWith('/channel') || pathname.startsWith('/c/')) pageType = 'channel';
  else if (pathname.includes('/playlist')) pageType = 'playlist';

  // Extract visible video titles on the page
  const videoTitles = [];
  document.querySelectorAll('#video-title, #video-title-link, h3 a#video-title').forEach(el => {
    const t = el.textContent?.trim();
    if (t && videoTitles.length < 10) videoTitles.push(t);
  });

  const searchQuery = new URLSearchParams(window.location.search).get('search_query') || '';

  const content = [
    title,
    `Page type: ${pageType}`,
    searchQuery ? `Search query: ${searchQuery}` : '',
    videoTitles.length > 0 ? `Visible videos: ${videoTitles.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  return {
    title: title || 'YouTube',
    url: window.location.href,
    hostname: window.location.hostname,
    content: content.substring(0, 800),
    extractionMethod: 'youtube-list',
    siteType: 'youtube',
  };
}

// ═══════════════════════════════════════
//  REDDIT DEEP EXTRACTOR
// ═══════════════════════════════════════

function isReddit() {
  const h = window.location.hostname;
  return h.includes('reddit.com') || h.includes('redd.it');
}

/**
 * Extract rich content from Reddit pages.
 * Handles both old and new Reddit, plus post pages and subreddit listings.
 */
function extractRedditContent() {
  const pathname = window.location.pathname;

  // ── Subreddit name ──
  const subredditMatch = pathname.match(/\/r\/([^/]+)/);
  const subreddit = subredditMatch ? subredditMatch[1] : '';

  // ── Post title ──
  const postTitleSelectors = [
    'h1[slot="title"]',
    'shreddit-post h1',
    'h1.Post__title',
    '[data-testid="post-title"]',
    'h1',
    'meta[property="og:title"]',
  ];

  let postTitle = '';
  for (const sel of postTitleSelectors) {
    if (sel.startsWith('meta')) {
      postTitle = document.querySelector(sel)?.content || '';
    } else {
      postTitle = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (postTitle && postTitle.length > 5) break;
  }

  // ── Post body / text ──
  const bodySelectors = [
    '[data-testid="post-content"]',
    '.RichTextJSON-root',
    'shreddit-post [slot="text-body"]',
    '.Post__body',
    '.md',
    'meta[property="og:description"]',
    'meta[name="description"]',
  ];

  let postBody = '';
  for (const sel of bodySelectors) {
    if (sel.startsWith('meta')) {
      postBody = document.querySelector(sel)?.content || '';
    } else {
      postBody = document.querySelector(sel)?.textContent?.trim() || '';
    }
    if (postBody && postBody.length > 20) break;
  }

  // ── Visible post titles on listing pages ──
  const visiblePosts = [];
  if (!postTitle || postTitle.length < 5) {
    // We're on a listing page, grab visible post titles
    document.querySelectorAll('a[data-testid="post-title"], shreddit-post h3, .Post h3, article h3').forEach(el => {
      const t = el.textContent?.trim();
      if (t && visiblePosts.length < 8) visiblePosts.push(t);
    });
  }

  // ── Flair / category ──
  const flair = document.querySelector('[data-testid="outboundLink"], .flair, flair-badge')?.textContent?.trim() || '';

  const title = postTitle || document.title.replace(/\s*:\s*reddit\s*$/i, '').trim();

  const content = [
    title,
    subreddit ? `Subreddit: r/${subreddit}` : '',
    flair ? `Flair: ${flair}` : '',
    postBody ? postBody.substring(0, 400) : '',
    visiblePosts.length > 0 ? `Visible posts: ${visiblePosts.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  return {
    title: title || document.title,
    url: window.location.href,
    hostname: window.location.hostname,
    content: content.substring(0, 800),
    extractionMethod: 'reddit-deep',
    siteType: 'reddit',
    subreddit,
  };
}

// ═══════════════════════════════════════
//  GENERIC STRUCTURED DATA EXTRACTION
// ═══════════════════════════════════════

/**
 * Extract ld+json (schema.org) structured data from the page.
 * Many modern sites embed rich structured data that describes the content.
 */
function extractStructuredData() {
  const results = [];
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const parts = [];
          if (item['@type']) parts.push(`Type: ${Array.isArray(item['@type']) ? item['@type'].join(', ') : item['@type']}`);
          if (item.name) parts.push(item.name);
          if (item.headline) parts.push(item.headline);
          if (item.description) parts.push(item.description.substring(0, 200));
          if (item.author) {
            const author = typeof item.author === 'string' ? item.author : (item.author.name || '');
            if (author) parts.push(`Author: ${author}`);
          }
          if (item.genre) parts.push(`Genre: ${Array.isArray(item.genre) ? item.genre.join(', ') : item.genre}`);
          if (item.keywords) parts.push(`Keywords: ${item.keywords}`);
          if (item.articleSection) parts.push(`Section: ${item.articleSection}`);
          if (item.about) {
            const about = typeof item.about === 'string' ? item.about : (item.about.name || '');
            if (about) parts.push(`About: ${about}`);
          }
          if (item.learningResourceType) parts.push(`ResourceType: ${item.learningResourceType}`);
          if (item.educationalLevel) parts.push(`Level: ${item.educationalLevel}`);
          if (parts.length > 0) results.push(parts.join(' | '));
        }
      } catch { /* malformed JSON — skip */ }
    }
  } catch { /* no structured data */ }
  return results.join(' || ').substring(0, 500);
}

/**
 * Extract Open Graph and other rich meta tags beyond basic title/description.
 */
function extractRichMeta() {
  const parts = [];

  // Open Graph
  const ogType = document.querySelector('meta[property="og:type"]')?.content || '';
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content || '';

  // Article-specific meta
  const articleSection = document.querySelector('meta[property="article:section"]')?.content || '';
  const articleTag = document.querySelector('meta[property="article:tag"]')?.content || '';

  // Standard meta
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
  const author = document.querySelector('meta[name="author"]')?.content || '';
  const category = document.querySelector('meta[name="category"]')?.content || '';

  // Twitter card (often has different/richer descriptions)
  const twitterDesc = document.querySelector('meta[name="twitter:description"]')?.content || '';

  if (ogType) parts.push(`ContentType: ${ogType}`);
  if (ogTitle) parts.push(ogTitle);
  if (ogSiteName) parts.push(`Site: ${ogSiteName}`);
  if (ogDesc) parts.push(ogDesc.substring(0, 200));
  if (!ogDesc && twitterDesc) parts.push(twitterDesc.substring(0, 200));
  if (!ogDesc && !twitterDesc && metaDesc) parts.push(metaDesc.substring(0, 200));
  if (articleSection) parts.push(`Section: ${articleSection}`);
  if (articleTag) parts.push(`Tag: ${articleTag}`);
  if (keywords) parts.push(`Keywords: ${keywords}`);
  if (author) parts.push(`Author: ${author}`);
  if (category) parts.push(`Category: ${category}`);

  return parts;
}

/**
 * Extract topic signals from the page's heading hierarchy and navigation.
 */
function extractTopicSignals() {
  const signals = [];

  // H1 — primary topic (usually only one per page)
  const h1 = document.querySelector('h1');
  if (h1) {
    const text = h1.textContent?.trim();
    if (text && text.length > 2 && text.length < 300) signals.push(text);
  }

  // H2 — subtopics (grab first 5)
  const h2s = document.querySelectorAll('h2');
  let h2Count = 0;
  for (const h2 of h2s) {
    if (h2Count >= 5) break;
    const text = h2.textContent?.trim();
    if (text && text.length > 2 && text.length < 200) {
      signals.push(text);
      h2Count++;
    }
  }

  // Breadcrumb / nav context
  const navSelectors = [
    'nav[aria-label*="breadcrumb"]',
    '.breadcrumb', '.breadcrumbs',
    '[itemtype*="BreadcrumbList"]',
    'ol.breadcrumb',
  ];
  for (const sel of navSelectors) {
    const nav = document.querySelector(sel);
    if (nav) {
      const text = nav.textContent?.trim().replace(/\s+/g, ' ');
      if (text && text.length > 3 && text.length < 200) {
        signals.push(`Navigation: ${text}`);
        break;
      }
    }
  }

  return signals;
}

// ═══════════════════════════════════════
//  MAIN EXTRACTOR
// ═══════════════════════════════════════

/**
 * Extract page content using a layered approach:
 *   1. Site-specific deep extractors (YouTube, Reddit)
 *   2. Readability.js (article-like pages)
 *   3. Rich generic extraction (structured data + meta + headings)
 * Returns { title, url, hostname, content, extractionMethod, ... }
 */
async function extractPageContent() {
  await waitForDOMStable();

  const url = window.location.href;
  const hostname = window.location.hostname;

  // ── 1. Site-specific deep extractors ──
  if (isYouTube()) {
    if (isYouTubeWatchPage()) {
      const yt = extractYouTubeContent();
      if (yt.content && yt.content.length > 30) {
        console.log('[MindForge] YouTube deep extraction:', yt.title);
        return yt;
      }
    } else {
      const yt = extractYouTubeListContent();
      if (yt.content && yt.content.length > 20) {
        console.log('[MindForge] YouTube list extraction:', yt.title);
        return yt;
      }
    }
  }

  if (isReddit()) {
    const rd = extractRedditContent();
    if (rd.content && rd.content.length > 30) {
      console.log('[MindForge] Reddit deep extraction:', rd.title);
      return rd;
    }
  }

  // ── 2. Gather universal signals (used by both Readability and fallback) ──
  const structuredData = extractStructuredData();
  const richMeta = extractRichMeta();
  const topicSignals = extractTopicSignals();

  // ── 3. Try Readability ──
  try {
    const docClone = document.cloneNode(true);
    const reader = new Readability(docClone, { charThreshold: 100 });
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 200) {
      // Enrich Readability output with structured data and topic signals
      const readabilityText = article.textContent.trim().substring(0, 600);
      const enrichment = [
        ...richMeta,
        ...topicSignals,
        structuredData,
      ].filter(Boolean);

      const content = [readabilityText, ...enrichment]
        .join(' | ')
        .substring(0, 1200);

      return {
        title: article.title || document.title,
        url,
        hostname,
        content,
        extractionMethod: 'readability-enriched',
        structuredDataFound: structuredData.length > 0,
      };
    }
  } catch (err) {
    console.log('[MindForge] Readability extraction failed:', err.message);
  }

  // ── 4. Rich generic fallback ──
  const title = document.title || '';
  const pathname = window.location.pathname;

  // Combine all signals: meta, headings, structured data, visible body text
  let bodySnippet = '';
  try {
    const mainContent = document.querySelector('main, article, [role="main"], .content, #content');
    if (mainContent) {
      bodySnippet = mainContent.textContent?.trim().replace(/\s+/g, ' ').substring(0, 400) || '';
    } else if (document.body) {
      bodySnippet = document.body.textContent?.trim().replace(/\s+/g, ' ').substring(0, 300) || '';
    }
  } catch { /* fallback to empty */ }

  const allParts = [
    title,
    ...richMeta,
    ...topicSignals,
    structuredData,
    bodySnippet,
    pathname,
  ].filter(Boolean);

  const fallbackContent = allParts.join(' | ').substring(0, 1200);

  return {
    title: richMeta.find(p => !p.startsWith('ContentType:') && !p.startsWith('Site:')) || title,
    url,
    hostname,
    content: stripHtml(fallbackContent),
    extractionMethod: 'generic-enriched',
    structuredDataFound: structuredData.length > 0,
  };
}

// Expose globally for content script access
if (typeof globalThis !== 'undefined') {
  globalThis.MindForgeExtractor = { extractPageContent };
}
