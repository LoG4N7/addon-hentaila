const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();

// Enable CORS and JSON parsing exactly like the working addon
app.use(cors());
app.use(express.json());

// Configuration constants
const BASE_URL = 'https://hentaila.tv';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: `${BASE_URL}/`
};

// Known ad domains to ignore
const AD_DOMAINS = [
  'adtng.com',
  'adsterra.com',
  'exoclick.com',
  'syxkn',
  'visariomedia.com',
  'vrdcftcmydygd.com',
  'realsrv.com',
  'doubleclick.net',
  'googlesyndication.com',
  'google.com',
  'cloudflare.com',
  'trafficjunky.com',
  'tsyndicate.com'
];

// Addon Manifest strictly conforming to the Nuvio / Stremio specification
const MANIFEST = {
  id: 'com.hentaila.addon',
  name: 'HentaiLA Addon',
  version: '1.0.0',
  description: 'Addon de web scraping en tiempo real para reproducir contenido de HentaiLA en Nuvio y Stremio.',
  resources: ['catalog', 'meta', 'stream'],
  types: ['anime'],
  idPrefixes: ['hla-'],
  catalogs: [
    {
      type: 'anime',
      id: 'hla-catalog',
      name: 'HentaiLA - Últimos Agregados',
      extra: [{ name: 'search', isRequired: false }]
    }
  ],
  logo: 'https://hentaila.tv/wp-content/themes/vraven/assets/img/logo.png',
  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
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
 * Detects server brand from URL
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
 * Web Scraping: Catalog / Search
 */
async function scrapeCatalog(searchQuery) {
  const targetUrl = searchQuery
    ? `${BASE_URL}/?s=${encodeURIComponent(searchQuery)}`
    : `${BASE_URL}/`;

  const res = await fetchWithTimeout(targetUrl, { headers: FETCH_HEADERS });
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const metas = [];
  const seenIds = new Set();

  $('.item_card').each((_, el) => {
    const link = $(el).find('a.card__cover').length ? $(el).find('a.card__cover') : $(el).find('a').first();
    const href = link.attr('href') || '';
    const slugMatch = href.match(/\/(?:ver|hentai)\/([^\/]+)/i);
    if (!slugMatch) return;

    const slug = slugMatch[1].trim();
    if (!slug || slug === 'directorio' || slug === 'inicio') return;

    const id = `hla-${slug}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const title = $(el).find('.card__title').text().trim() ||
                  link.find('img').attr('alt')?.replace(/\s*cover$/i, '').trim() ||
                  $(el).find('h3').text().trim() ||
                  slug;

    let poster = link.find('img').attr('src') || $(el).find('img').attr('src') || '';
    if (poster.startsWith('//')) poster = `https:${poster}`;

    metas.push({
      id,
      type: 'anime',
      name: title,
      poster,
      description: `Ver ${title} en HentaiLA con la mejor calidad.`
    });
  });

  return metas;
}

/**
 * Web Scraping: Metadata & Episode List
 */
async function scrapeMeta(rawId) {
  const cleanId = (rawId || '').replace(/\.json$/, '').trim();
  const cleanSlug = cleanId
    .replace(/^hla-/, '')
    .replace(/^ver-/, '')
    .replace(/^ver\//, '')
    .replace(/^hentai-/, '')
    .replace(/^hentai\//, '')
    .trim();

  // If slug has episode suffix (e.g. kanojo-no-tomodachi-1), extract series slug
  const seriesSlug = cleanSlug.replace(/-\d+$/, '');

  let targetUrl = `${BASE_URL}/ver/${cleanSlug}/`;
  let res = await fetchWithTimeout(targetUrl, { headers: FETCH_HEADERS });

  if (!res.ok && seriesSlug !== cleanSlug) {
    targetUrl = `${BASE_URL}/ver/${seriesSlug}/`;
    res = await fetchWithTimeout(targetUrl, { headers: FETCH_HEADERS });
  }

  if (!res.ok) {
    return null;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const rawTitle =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    seriesSlug;

  const title = rawTitle.replace(/\s*-\s*HentaiLA.*$/i, '').trim();

  let poster =
    $('meta[property="og:image"]').attr('content') ||
    $('.hentai__cover img').attr('src') ||
    $('.card__cover img').attr('src') ||
    $('img.img-fluid').first().attr('src') ||
    '';

  if (poster.startsWith('//')) poster = `https:${poster}`;

  let description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('.card__description').text().trim() ||
    $('.hentai__description').text().trim() ||
    $('.sinopsis').text().trim() ||
    '';

  description = description.replace(/\s*-\s*HentaiLA.*$/i, '').trim();
  if (!description) {
    description = `Ver ${title} en HentaiLA con subtítulos en español y máxima calidad.`;
  }

  // Extract genres
  const genres = [];
  $('a[href*="/genero/"]').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  // Extract episodes
  const videos = [];
  $('a[href*="/episodio-"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/episodio-(\d+)/i);
    const epNum = match ? parseInt(match[1], 10) : i + 1;
    const epTitle = $(el).text().trim() || `Episodio ${epNum}`;

    if (!videos.some((v) => v.episode === epNum)) {
      videos.push({
        id: `hla-${seriesSlug}-${epNum}`,
        title: epTitle.startsWith('Episodio') ? epTitle : `Episodio ${epNum}: ${epTitle}`,
        season: 1,
        episode: Number(epNum)
      });
    }
  });

  videos.sort((a, b) => a.episode - b.episode);

  if (videos.length === 0) {
    videos.push({
      id: `hla-${seriesSlug}-1`,
      title: 'Episodio 1',
      season: 1,
      episode: 1
    });
  }

  return {
    id: `hla-${seriesSlug}`,
    type: 'anime',
    name: title,
    poster,
    background: poster,
    description,
    genres: genres.length > 0 ? genres : ['Hentai', 'Anime'],
    videos
  };
}

/**
 * Web Scraping: Episode Video Streams
 */
async function scrapeEpisode(rawId) {
  let slug = '';
  let episode = 1;

  const colonMatch = rawId.match(/^hla-(.+):(\d+)(?::(\d+))?$/);
  if (colonMatch) {
    slug = colonMatch[1];
    episode = parseInt(colonMatch[3] || colonMatch[2], 10);
  } else {
    const dashMatch = rawId.match(/^hla-(.+)-(\d+)$/);
    if (dashMatch) {
      slug = dashMatch[1];
      episode = parseInt(dashMatch[2], 10);
    } else {
      slug = rawId.replace(/^hla-/, '');
      episode = 1;
    }
  }

  const streams = [];
  const addedUrls = new Set();

  function addStream(stream) {
    if (stream && stream.url && !addedUrls.has(stream.url)) {
      addedUrls.add(stream.url);
      streams.push(stream);
    }
  }

  const episodeUrl = `${BASE_URL}/ver/${slug}/episodio-${episode}`;
  let epRes = await fetchWithTimeout(episodeUrl, { headers: FETCH_HEADERS });

  if (!epRes.ok) {
    const seriesUrl = `${BASE_URL}/ver/${slug}/`;
    epRes = await fetchWithTimeout(seriesUrl, { headers: FETCH_HEADERS });
  }

  if (!epRes.ok) {
    return [];
  }

  const epHtml = await epRes.text();
  const $ = cheerio.load(epHtml);

  // 1. Primary PlayerLogic Extraction
  try {
    const plIframe = $('iframe[src*="player-logic/player.php"]').first().attr('src') ||
      epHtml.match(/src=["']([^"']*player-logic\/player\.php[^"']*)["']/i)?.[1];

    if (plIframe) {
      const playerUrl = (plIframe.startsWith('http') ? plIframe : 'https:' + plIframe).replace(/&amp;/g, '&');
      const pRes = await fetchWithTimeout(playerUrl, {
        headers: { ...FETCH_HEADERS, Referer: episodeUrl }
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
              'User-Agent': USER_AGENT,
              Referer: playerUrl,
              Origin: BASE_URL
            },
            body: formData
          });

          if (apiRes.ok) {
            const result = await apiRes.json();
            if (result && result.status && result.data && Array.isArray(result.data.sources)) {
              for (const src of result.data.sources) {
                if (src.src) {
                  // Add Auto master stream
                  addStream({
                    name: 'HentaiLA',
                    title: `Auto (HLS Adaptativo)`,
                    url: src.src,
                    behaviorHints: {
                      notWebReady: false,
                      proxyHeaders: {
                        request: {
                          'User-Agent': USER_AGENT,
                          Referer: 'https://hentaila.tv/'
                        }
                      }
                    }
                  });

                  // Parse individual resolution streams (1080p, 720p, 480p, 360p)
                  try {
                    const m3u8Res = await fetchWithTimeout(src.src, {
                      headers: {
                        'User-Agent': USER_AGENT,
                        Referer: 'https://hentaila.tv/'
                      }
                    }, 5000);

                    if (m3u8Res.ok) {
                      const m3u8Text = await m3u8Res.text();
                      const parsedQualities = parseM3u8Resolutions(src.src, m3u8Text);
                      for (const q of parsedQualities) {
                        addStream({
                          name: 'HentaiLA',
                          title: `${q.label} • Directo (${q.resolution})`,
                          url: q.url,
                          behaviorHints: {
                            notWebReady: false,
                            proxyHeaders: {
                              request: {
                                'User-Agent': USER_AGENT,
                                Referer: 'https://hentaila.tv/'
                              }
                            }
                          }
                        });
                      }
                    }
                  } catch (m3u8Err) {}
                }
              }
            }
          }
        }
      }
    }
  } catch (plErr) {
    console.error('[PlayerLogic Error]:', plErr.message);
  }

  // 2. Generic Iframes and Embeds
  let optionIdx = 1;
  $('iframe').each((_, el) => {
    try {
      const src = $(el).attr('src') || '';
      if (!src || src.includes('player-logic/player.php') || src.includes('about:blank')) return;
      if (AD_DOMAINS.some((domain) => src.toLowerCase().includes(domain))) return;

      const fullUrl = src.startsWith('//') ? `https:${src}` : src;
      const info = detectServerInfo(fullUrl, optionIdx++);

      addStream({
        name: 'HentaiLA',
        title: info.title,
        url: fullUrl,
        behaviorHints: {
          notWebReady: false,
          proxyHeaders: {
            request: {
              'User-Agent': USER_AGENT,
              Referer: 'https://hentaila.tv/'
            }
          }
        }
      });
    } catch (e) {}
  });

  // 3. Option buttons, tabs, or data attributes
  $('[data-video], [data-src], [data-url], [data-player-logic-data], .player_logic_option, .server_option').each((_, el) => {
    try {
      const rawUrl = $(el).attr('data-video') ||
                     $(el).attr('data-src') ||
                     $(el).attr('data-url') ||
                     $(el).attr('data-player-logic-data') || '';
      if (!rawUrl || rawUrl.includes('player-logic/player.php') || rawUrl.startsWith('#') || rawUrl.startsWith('/')) return;
      if (AD_DOMAINS.some((domain) => rawUrl.toLowerCase().includes(domain))) return;

      const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
      const info = detectServerInfo(fullUrl, optionIdx++);

      addStream({
        name: 'HentaiLA',
        title: info.title,
        url: fullUrl,
        behaviorHints: {
          notWebReady: false,
          proxyHeaders: {
            request: {
              'User-Agent': USER_AGENT,
              Referer: 'https://hentaila.tv/'
            }
          }
        }
      });
    } catch (e) {}
  });

  // 4. External mirror and direct links
  $('a[href*="mega.nz"], a[href*="yourupload"], a[href*="mp4upload"], a[href*="streamtape"], a[href*="fembed"], a[href*="voe"]').each((_, el) => {
    try {
      const href = $(el).attr('href') || '';
      if (!href) return;
      if (AD_DOMAINS.some((domain) => href.toLowerCase().includes(domain))) return;

      const fullUrl = href.startsWith('//') ? `https:${href}` : href;
      const info = detectServerInfo(fullUrl, optionIdx++);

      addStream({
        name: 'HentaiLA',
        title: `${info.title} (Mirror)`,
        url: fullUrl,
        behaviorHints: {
          notWebReady: false,
          proxyHeaders: {
            request: {
              'User-Agent': USER_AGENT,
              Referer: 'https://hentaila.tv/'
            }
          }
        }
      });
    } catch (e) {}
  });

  return streams;
}

// ==========================================
// RUTAS Y ENDPOINTS DEL ADDON
// ==========================================

// Página de inicio interactiva (Landing Page)
app.get('/', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const manifestUrl = `${protocol}://${host}/manifest.json`;
  const stremioInstallUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>HentaiLA Addon para Nuvio & Stremio</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
      <style>
        body { background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
        .hero { max-width: 680px; margin: 50px auto; padding: 32px; background: #1e293b; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .badge-status { background: #10b981; color: #fff; font-size: 0.85rem; padding: 4px 10px; border-radius: 9999px; }
        .code-box { background: #090d16; padding: 12px; border-radius: 8px; font-family: monospace; word-break: break-all; color: #38bdf8; }
        .btn-install { background: #6366f1; color: white; border: none; padding: 12px 24px; font-weight: 600; border-radius: 8px; text-decoration: none; display: inline-block; }
        .btn-install:hover { background: #4f46e5; color: white; }
      </style>
    </head>
    <body>
      <div class="hero text-center">
        <h1 class="h3 mb-2 font-weight-bold">HentaiLA Addon</h1>
        <p class="text-secondary mb-3">Addon Serverless con Catálogo, Búsqueda y Streams en Tiempo Real</p>
        <span class="badge-status mb-4 d-inline-block">● Estado: Activo en Vercel</span>

        <div class="my-4">
          <a href="${stremioInstallUrl}" class="btn-install w-100 mb-2">Instalar en Stremio / Nuvio</a>
          <a href="${manifestUrl}" target="_blank" class="btn btn-outline-light w-100">Ver manifest.json</a>
        </div>

        <div class="text-start mt-4">
          <label class="form-label text-secondary small">URL del Manifiesto para Nuvio / Stremio:</label>
          <div class="code-box">${manifestUrl}</div>
        </div>

        <div class="text-start mt-4">
          <label class="form-label text-secondary small">Pruebas Rápidas de Endpoints:</label>
          <ul class="list-unstyled mt-2">
            <li class="mb-2">
              <span class="text-white small">📁 Catálogo Últimos Agregados:</span><br>
              <a href="/catalog/anime/hla-catalog.json" target="_blank" style="color: #38bdf8; text-decoration: underline;">
                /catalog/anime/hla-catalog.json
              </a>
            </li>
            <li class="mb-2">
              <span class="text-white small">🔍 Búsqueda en Catálogo:</span><br>
              <a href="/catalog/anime/hla-catalog/search=kanojo.json" target="_blank" style="color: #38bdf8; text-decoration: underline;">
                /catalog/anime/hla-catalog/search=kanojo.json
              </a>
            </li>
            <li class="mb-2">
              <span class="text-white small">📄 Metadatos y Episodios:</span><br>
              <a href="/meta/anime/hla-overflow.json" target="_blank" style="color: #38bdf8; text-decoration: underline;">
                /meta/anime/hla-overflow.json
              </a>
            </li>
            <li class="mb-2">
              <span class="text-white small">🎬 Streams de Episodio:</span><br>
              <a href="/stream/anime/hla-overflow-1.json" target="_blank" style="color: #38bdf8; text-decoration: underline;">
                /stream/anime/hla-overflow-1.json
              </a>
            </li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Endpoint GET /manifest.json
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'max-age=86400, public');
  res.json(MANIFEST);
});

// Endpoint GET /catalog/:type/:id.json y búsquedas
const catalogHandler = async (req, res) => {
  let searchQuery = req.params.query || req.query.search || null;

  if (!searchQuery && req.params.extra) {
    const extraMatch = req.params.extra.match(/search[=:](.+)/i);
    if (extraMatch) {
      searchQuery = extraMatch[1];
    }
  }

  if (searchQuery) {
    searchQuery = decodeURIComponent(searchQuery).replace(/\.json$/, '').trim();
  }

  try {
    const metas = await scrapeCatalog(searchQuery);
    res.setHeader('Cache-Control', 'max-age=600, public');
    return res.json({ metas: metas || [] });
  } catch (error) {
    console.error(`[Catalog Error] Error al consultar catálogo (query: "${searchQuery}"):`, error.message);
    return res.json({ metas: [] });
  }
};

app.get('/catalog/:type/:id/search=:query.json', catalogHandler);
app.get('/catalog/:type/:id/search=:query', catalogHandler);
app.get('/catalog/:type/:id/:extra.json', catalogHandler);
app.get('/catalog/:type/:id/:extra', catalogHandler);
app.get('/catalog/:type/:id.json', catalogHandler);
app.get('/catalog/:type/:id', catalogHandler);

// Endpoint GET /meta/:type/:id.json
const metaHandler = async (req, res) => {
  const rawId = req.params.id;

  try {
    const meta = await scrapeMeta(rawId);
    if (!meta) {
      return res.json({ meta: null });
    }
    res.setHeader('Cache-Control', 'max-age=1800, public');
    return res.json({ meta });
  } catch (error) {
    console.error(`[Meta Error] Error al extraer metadatos para ID "${rawId}":`, error.message);
    return res.json({ meta: null });
  }
};

app.get('/meta/:type/:id.json', metaHandler);
app.get('/meta/:type/:id', metaHandler);

// Endpoint GET /stream/:type/:id.json
const streamHandler = async (req, res) => {
  const rawId = req.params.id;

  try {
    const episodeId = rawId ? rawId.replace(/\.json$/, '') : '';

    if (!episodeId) {
      return res.json({ streams: [] });
    }

    const streams = await scrapeEpisode(episodeId);
    res.setHeader('Cache-Control', 'max-age=300, public');
    return res.json({ streams: streams || [] });
  } catch (error) {
    console.error(`[Stream Error] Error extrayendo streams para ID "${rawId}":`, error.message);
    return res.json({ streams: [] });
  }
};

app.get('/stream/:type/:id.json', streamHandler);
app.get('/stream/:type/:id', streamHandler);

// Iniciar servidor local si no estamos en entorno Vercel Serverless
if (!process.env.VERCEL && require.main === module) {
  const PORT = process.env.PORT || 7000;
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 HentaiLA Addon iniciado correctamente`);
    console.log(`📡 Local: http://localhost:${PORT}`);
    console.log(`📄 Manifiesto: http://localhost:${PORT}/manifest.json`);
    console.log(`📁 Catálogo: http://localhost:${PORT}/catalog/anime/hla-catalog.json`);
    console.log(`📄 Metadatos: http://localhost:${PORT}/meta/anime/hla-overflow.json`);
    console.log(`=======================================================`);
  });
}

// Exportar la instancia de Express para que Vercel la ejecute como función Serverless
module.exports = app;
