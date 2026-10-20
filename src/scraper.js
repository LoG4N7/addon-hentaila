const cheerio = require('cheerio');

const BASE_URL = 'https://hentaila.tv';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': DEFAULT_USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
};

/**
 * Fetch helper with timeout
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * ROT13 cipher implementation
 */
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode(
      (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26
    );
  });
}

/**
 * Decodes the x-secure-token from PlayerLogic player.php
 * Algorithm: 3-pass ROT13 + Base64 decoding
 */
function decodeToken(token) {
  let e = token.replace(/^sha512-/, '');
  e = rot13(e);
  e = Buffer.from(e, 'base64').toString('binary');
  e = rot13(e);
  e = Buffer.from(e, 'base64').toString('binary');
  e = rot13(e);
  e = Buffer.from(e, 'base64').toString('utf-8');
  return JSON.parse(e);
}

/**
 * Extracts a meta object from a catalog .item_card element
 */
function parseCard($, el) {
  const link = $(el).find('a.card__cover').length ? $(el).find('a.card__cover') : $(el).find('a').first();
  const href = link.attr('href') || '';
  const slugMatch = href.match(/\/(?:ver|hentai)\/([^\/]+)/i);
  if (!slugMatch) return null;
  const slug = slugMatch[1].trim();

  const title = $(el).find('.card__title').text().trim() ||
                link.find('img').attr('alt')?.replace(/\s*cover$/i, '').trim() ||
                $(el).find('h3').text().trim() ||
                slug;

  let poster = link.find('img').attr('src') || $(el).find('img').attr('src') || '';
  if (poster.startsWith('//')) poster = `https:${poster}`;

  return {
    id: `hla-${slug}`,
    name: title,
    type: 'anime',
    poster: poster,
    posterShape: 'poster'
  };
}

/**
 * Catalog: Latest Episodes ("hla-latest")
 */
async function getLatest(page = 1) {
  try {
    const url = page > 1 ? `${BASE_URL}/page/${page}/` : `${BASE_URL}/`;
    const res = await fetchWithTimeout(url, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const metas = [];

    if (page === 1) {
      const slider = $('.vraven_home_slider').has('h3:contains("Nuevos")');
      if (slider.length) {
        slider.find('.item_card').each((_, el) => {
          const item = parseCard($, el);
          if (item && !metas.some(m => m.id === item.id)) metas.push(item);
        });
      }
    }

    if (metas.length === 0) {
      $('.item_card').each((_, el) => {
        const item = parseCard($, el);
        if (item && !metas.some(m => m.id === item.id)) metas.push(item);
      });
    }

    return metas;
  } catch (err) {
    console.error('getLatest error:', err.message);
    return [];
  }
}

/**
 * Catalog: Trending / Popular ("hla-trending")
 */
async function getTrending() {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/`, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const metas = [];

    const slider = $('.vraven_home_slider').has('h3:contains("Lo mas Visto")');
    if (slider.length) {
      slider.find('.item_card').each((_, el) => {
        const item = parseCard($, el);
        if (item && !metas.some(m => m.id === item.id)) metas.push(item);
      });
    }

    // Fallback to /top-hentai/ if slider not present
    if (metas.length === 0) {
      const topRes = await fetchWithTimeout(`${BASE_URL}/top-hentai/`, { headers: HEADERS });
      if (topRes.ok) {
        const topHtml = await topRes.text();
        const $top = cheerio.load(topHtml);
        $top('a[href*="/ver/"]').each((_, el) => {
          const href = $top(el).attr('href') || '';
          const slugMatch = href.match(/\/ver\/([^\/]+)/i);
          if (slugMatch) {
            const slug = slugMatch[1].trim();
            const title = $top(el).find('img').attr('alt')?.replace(/\s*cover$/i, '').trim() || slug;
            let poster = $top(el).find('img').attr('src') || '';
            if (poster.startsWith('//')) poster = `https:${poster}`;
            if (poster && !metas.some(m => m.id === `hla-${slug}`)) {
              metas.push({
                id: `hla-${slug}`,
                name: title,
                type: 'anime',
                poster: poster,
                posterShape: 'poster'
              });
            }
          }
        });
      }
    }

    return metas;
  } catch (err) {
    console.error('getTrending error:', err.message);
    return [];
  }
}

/**
 * Catalog: Uncensored ("hla-uncensored")
 */
async function getUncensored(page = 1) {
  try {
    const url = page > 1 
      ? `${BASE_URL}/genero/hentai-sin-censura/page/${page}/` 
      : `${BASE_URL}/genero/hentai-sin-censura/`;
    const res = await fetchWithTimeout(url, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const metas = [];

    $('.item_card').each((_, el) => {
      const item = parseCard($, el);
      if (item && !metas.some(m => m.id === item.id)) metas.push(item);
    });

    return metas;
  } catch (err) {
    console.error('getUncensored error:', err.message);
    return [];
  }
}

/**
 * Search functionality
 */
async function search(query, page = 1) {
  try {
    const url = page > 1
      ? `${BASE_URL}/page/${page}/?s=${encodeURIComponent(query)}`
      : `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const metas = [];

    $('.item_card').each((_, el) => {
      const item = parseCard($, el);
      if (item && !metas.some(m => m.id === item.id)) metas.push(item);
    });

    return metas;
  } catch (err) {
    console.error('search error:', err.message);
    return [];
  }
}

/**
 * Metadata & Episodes for an anime
 */
async function getMeta(id) {
  try {
    const slug = id.replace(/^hla-/, '').trim();
    const url = `${BASE_URL}/ver/${slug}/`;
    const res = await fetchWithTimeout(url, { headers: HEADERS });
    if (!res.ok) {
      return { meta: null };
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    // Title
    const name = $('h1').first().text().trim() ||
                 $('meta[property="og:title"]').attr('content') ||
                 slug;

    // Poster & Background
    let poster = $('meta[property="og:image"]').attr('content') ||
                 $('.hentai__cover img').attr('src') ||
                 $('.card__cover img').attr('src') ||
                 $('img.img-fluid').first().attr('src') || '';
    if (poster.startsWith('//')) poster = `https:${poster}`;

    // Description / Synopsis
    const description = $('meta[name="description"]').attr('content') ||
                        $('meta[property="og:description"]').attr('content') ||
                        $('.card__description').text().trim() ||
                        $('.hentai__description').text().trim() ||
                        $('.sinopsis').text().trim() || '';

    // Genres
    const genres = [];
    $('a[href*="/genero/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    // Episodes
    const videos = [];
    $('a[href*="/episodio-"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/episodio-(\d+)/i);
      const epNum = match ? parseInt(match[1], 10) : i + 1;
      const epTitle = $(el).text().trim() || `Episodio ${epNum}`;

      if (!videos.some(v => v.episode === epNum)) {
        videos.push({
          id: `hla-${slug}-${epNum}`,
          title: epTitle.startsWith('Episodio') ? epTitle : `Episodio ${epNum}: ${epTitle}`,
          episode: epNum,
          season: 1
        });
      }
    });

    // Sort ascending
    videos.sort((a, b) => a.episode - b.episode);

    // Single episode / movie fallback
    if (videos.length === 0) {
      videos.push({
        id: `hla-${slug}-1`,
        title: 'Episodio 1',
        episode: 1,
        season: 1
      });
    }

    return {
      meta: {
        id: `hla-${slug}`,
        type: 'anime',
        name,
        genres,
        poster,
        background: poster,
        posterShape: 'poster',
        description,
        videos
      }
    };
  } catch (err) {
    console.error('getMeta error:', err.message);
    return { meta: null };
  }
}

/**
 * Video streams extraction
 */
async function getStreams(id) {
  const streams = [];
  try {
    let slug = '';
    let episode = 1;

    // Support both hla-slug:ep and hla-slug-ep formats
    const colonMatch = id.match(/^hla-(.+):(\d+)(?::(\d+))?$/);
    if (colonMatch) {
      slug = colonMatch[1];
      episode = parseInt(colonMatch[3] || colonMatch[2], 10);
    } else {
      const dashMatch = id.match(/^hla-(.+)-(\d+)$/);
      if (dashMatch) {
        slug = dashMatch[1];
        episode = parseInt(dashMatch[2], 10);
      } else {
        slug = id.replace(/^hla-/, '');
        episode = 1;
      }
    }

    const episodeUrl = `${BASE_URL}/ver/${slug}/episodio-${episode}`;
    let epRes = await fetchWithTimeout(episodeUrl, {
      headers: HEADERS
    });

    // If episode URL returned 404, fallback to main slug URL
    if (!epRes.ok) {
      const seriesUrl = `${BASE_URL}/ver/${slug}/`;
      epRes = await fetchWithTimeout(seriesUrl, {
        headers: HEADERS
      });
    }

    if (!epRes.ok) {
      return { streams: [] };
    }

    const epHtml = await epRes.text();
    const $ = cheerio.load(epHtml);

    // 1. PlayerLogic iframe extraction
    const plIframe = $('iframe[src*="player-logic/player.php"]').first().attr('src') ||
      epHtml.match(/src=["']([^"']*player-logic\/player\.php[^"']*)["']/i)?.[1];

    if (plIframe) {
      try {
        const playerUrl = (plIframe.startsWith('http') ? plIframe : 'https:' + plIframe).replace(/&amp;/g, '&');
        const pRes = await fetchWithTimeout(playerUrl, {
          headers: {
            ...HEADERS,
            'Referer': episodeUrl
          }
        });

        if (pRes.ok) {
          const pHtml = await pRes.text();
          const tokenMatch = pHtml.match(/<meta\s+name=["']x-secure-token["']\s+content=["']([^"']+)["']/i);
          if (tokenMatch) {
            const config = decodeToken(tokenMatch[1]);
            const apiUrl = (config.uri.startsWith('http') ? config.uri : 'https:' + config.uri) + 'api.php';
            
            const formData = new FormData();
            formData.append('action', 'zarat_get_data_player_ajax');
            formData.append('a', config.en);
            formData.append('b', config.iv);

            const apiRes = await fetchWithTimeout(apiUrl, {
              method: 'POST',
              headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                'Referer': playerUrl,
                'Origin': BASE_URL
              },
              body: formData
            });

            if (apiRes.ok) {
              const result = await apiRes.json();
              if (result && result.status && result.data && Array.isArray(result.data.sources)) {
                for (const src of result.data.sources) {
                  if (src.src) {
                    streams.push({
                      name: 'HentaiLA',
                      title: `HentaiLA - ${src.label || 'Auto'} (HLS)`,
                      url: src.src,
                      behaviorHints: {
                        notWebReady: false,
                        proxyHeaders: {
                          request: {
                            'User-Agent': DEFAULT_USER_AGENT,
                            'Referer': 'https://hentaila.tv/'
                          }
                        }
                      }
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('PlayerLogic extraction error:', err.message);
      }
    }

    // 2. Generic video iframes (Mega, YourUpload, Streamtape, MP4Upload, Fembed, etc.)
    $('iframe').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (!src || src.includes('player-logic/player.php') || src.includes('about:blank')) return;

      let serverName = 'External Player';
      if (src.includes('mega.nz')) serverName = 'Mega';
      else if (src.includes('yourupload')) serverName = 'YourUpload';
      else if (src.includes('streamtape')) serverName = 'Streamtape';
      else if (src.includes('mp4upload')) serverName = 'MP4Upload';
      else if (src.includes('fembed') || src.includes('feurl')) serverName = 'Fembed';
      else if (src.includes('dood')) serverName = 'DoodStream';
      else if (src.includes('filemoon')) serverName = 'Filemoon';
      else if (src.includes('voe')) serverName = 'VOE';

      streams.push({
        name: serverName,
        title: `${serverName} (Embed)`,
        externalUrl: src.startsWith('//') ? `https:${src}` : src
      });
    });

    return { streams };
  } catch (err) {
    console.error('getStreams error:', err.message);
    return { streams: [] };
  }
}

module.exports = {
  getLatest,
  getTrending,
  getUncensored,
  search,
  getMeta,
  getStreams
};
