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
 * Parses a master .m3u8 playlist to extract individual resolution sub-streams
 */
function parseM3u8Resolutions(masterUrl, content) {
  const qualities = [];
  const lines = content.split('\n');
  const urlObj = new URL(masterUrl);
  const basePath = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      const height = resMatch ? parseInt(resMatch[2], 10) : null;
      const width = resMatch ? parseInt(resMatch[1], 10) : null;

      let streamUri = '';
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          streamUri = nextLine;
          break;
        }
      }

      if (streamUri) {
        let fullStreamUrl = '';
        if (streamUri.startsWith('http://') || streamUri.startsWith('https://')) {
          fullStreamUrl = streamUri;
        } else if (streamUri.startsWith('/')) {
          fullStreamUrl = `${urlObj.origin}${streamUri}${urlObj.search}`;
        } else {
          fullStreamUrl = `${urlObj.origin}${basePath}${streamUri}${urlObj.search}`;
        }

        let label = 'Auto';
        if (height >= 1080) label = '1080p (FHD)';
        else if (height >= 720) label = '720p (HD)';
        else if (height >= 480) label = '480p (SD)';
        else if (height >= 360) label = '360p (SD)';
        else if (height) label = `${height}p`;

        qualities.push({
          resolution: height ? `${width}x${height}` : null,
          label,
          height: height || 0,
          url: fullStreamUrl
        });
      }
    }
  }

  qualities.sort((a, b) => b.height - a.height);
  return qualities;
}

/**
 * Identifies known server providers from URL or element text
 */
function detectServerInfo(rawUrl, defaultIndex = 1) {
  const lower = rawUrl.toLowerCase();
  if (lower.includes('yourupload')) {
    return { name: 'HentaiLA - YourUpload', title: 'Servidor: YourUpload • HD 1080p' };
  } else if (lower.includes('mega.nz')) {
    return { name: 'HentaiLA - Mega', title: 'Servidor: Mega • HD 1080p' };
  } else if (lower.includes('mp4upload')) {
    return { name: 'HentaiLA - Mp4Upload', title: 'Servidor: Mp4Upload • HD' };
  } else if (lower.includes('streamtape')) {
    return { name: 'HentaiLA - Streamtape', title: 'Servidor: Streamtape • HD 1080p' };
  } else if (lower.includes('fembed') || lower.includes('feurl') || lower.includes('vanfem')) {
    return { name: 'HentaiLA - Fembed', title: 'Servidor: Fembed • Multi-calidad' };
  } else if (lower.includes('voe.sx') || lower.includes('voe-')) {
    return { name: 'HentaiLA - VOE', title: 'Servidor: VOE • HD' };
  } else if (lower.includes('dood')) {
    return { name: 'HentaiLA - DoodStream', title: 'Servidor: DoodStream • HD' };
  } else if (lower.includes('filemoon')) {
    return { name: 'HentaiLA - Filemoon', title: 'Servidor: Filemoon • HD' };
  } else if (lower.includes('streamwish') || lower.includes('swish')) {
    return { name: 'HentaiLA - StreamWish', title: 'Servidor: StreamWish • HD' };
  } else if (lower.includes('vidhide')) {
    return { name: 'HentaiLA - VidHide', title: 'Servidor: VidHide • HD' };
  } else {
    return { name: `HentaiLA - Option ${defaultIndex}`, title: `Servidor: Reproductor Alternativo ${defaultIndex}` };
  }
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
    const cleanQuery = query ? query.trim() : '';
    const url = page > 1
      ? `${BASE_URL}/page/${page}/?s=${encodeURIComponent(cleanQuery)}`
      : `${BASE_URL}/?s=${encodeURIComponent(cleanQuery)}`;
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
 * Extracts all video streams and servers for an episode
 */
async function getStreams(id) {
  const streams = [];
  const addedUrls = new Set();

  function addStream(stream) {
    if (stream && stream.url && !addedUrls.has(stream.url)) {
      addedUrls.add(stream.url);
      streams.push(stream);
    }
  }

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
    let epRes = await fetchWithTimeout(episodeUrl, { headers: HEADERS });

    // Fallback to series page if episode URL fails
    if (!epRes.ok) {
      const seriesUrl = `${BASE_URL}/ver/${slug}/`;
      epRes = await fetchWithTimeout(seriesUrl, { headers: HEADERS });
    }

    if (!epRes.ok) {
      return { streams: [] };
    }

    const epHtml = await epRes.text();
    const $ = cheerio.load(epHtml);

    // 1. Primary PlayerLogic extraction (Auto + individual qualities: 1080p, 720p, 480p, 360p)
    try {
      const plIframe = $('iframe[src*="player-logic/player.php"]').first().attr('src') ||
        epHtml.match(/src=["']([^"']*player-logic\/player\.php[^"']*)["']/i)?.[1];

      if (plIframe) {
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
                    // Main Auto HLS Stream
                    addStream({
                      name: 'HentaiLA - Auto (HLS)',
                      title: 'Servidor: HLS Principal • Adaptativo (Multi-calidad)',
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

                    // Parse individual resolution streams (1080p, 720p, 480p, 360p)
                    try {
                      const m3u8Res = await fetchWithTimeout(src.src, {
                        headers: {
                          'User-Agent': DEFAULT_USER_AGENT,
                          'Referer': 'https://hentaila.tv/'
                        }
                      }, 5000);

                      if (m3u8Res.ok) {
                        const m3u8Text = await m3u8Res.text();
                        const parsedQualities = parseM3u8Resolutions(src.src, m3u8Text);
                        for (const q of parsedQualities) {
                          addStream({
                            name: `HentaiLA - ${q.label}`,
                            title: `Servidor: HLS Directo • ${q.label} (${q.resolution})`,
                            url: q.url,
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
                    } catch (m3u8Err) {
                      // Non-critical: keep Auto stream if quality playlist fetch fails
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (plErr) {
      console.error('PlayerLogic extraction error:', plErr.message);
    }

    // 2. Generic video iframes (YourUpload, Mega, Mp4Upload, Streamtape, Fembed, VOE, etc.)
    let optionIdx = 1;
    $('iframe').each((_, el) => {
      try {
        const src = $(el).attr('src') || '';
        if (!src || src.includes('player-logic/player.php') || src.includes('about:blank')) return;
        const fullUrl = src.startsWith('//') ? `https:${src}` : src;
        const info = detectServerInfo(fullUrl, optionIdx++);

        addStream({
          name: info.name,
          title: info.title,
          url: fullUrl,
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
      } catch (e) {}
    });

    // 3. Option buttons, tabs, or data attributes ([data-video], [data-src], [data-player-logic-data])
    $('[data-video], [data-src], [data-url], [data-player-logic-data], .player_logic_option, .server_option').each((_, el) => {
      try {
        const rawUrl = $(el).attr('data-video') ||
                       $(el).attr('data-src') ||
                       $(el).attr('data-url') ||
                       $(el).attr('data-player-logic-data') || '';
        if (!rawUrl || rawUrl.includes('player-logic/player.php') || rawUrl.startsWith('#') || rawUrl.startsWith('/')) return;
        const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
        const info = detectServerInfo(fullUrl, optionIdx++);

        addStream({
          name: info.name,
          title: info.title,
          url: fullUrl,
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
      } catch (e) {}
    });

    // 4. External mirror and direct links (Mega, YourUpload, Mp4Upload, Streamtape, etc.)
    $('a[href*="mega.nz"], a[href*="yourupload"], a[href*="mp4upload"], a[href*="streamtape"], a[href*="fembed"], a[href*="voe"], a[href*="mediafire"]').each((_, el) => {
      try {
        const href = $(el).attr('href') || '';
        if (!href) return;
        const fullUrl = href.startsWith('//') ? `https:${href}` : href;
        const info = detectServerInfo(fullUrl, optionIdx++);

        addStream({
          name: info.name,
          title: info.title,
          url: fullUrl,
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
      } catch (e) {}
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
