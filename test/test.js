const app = require('../api/index');
const http = require('http');

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`\n========================================`);
      console.log(`🧪 Test Server running on ${baseUrl}`);
      console.log(`========================================\n`);
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(resolve);
    } else {
      resolve();
    }
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  function assertCORS(res, endpointName) {
    const origin = res.headers.get('access-control-allow-origin');
    const headers = res.headers.get('access-control-allow-headers');
    assert(origin === '*', `${endpointName} has Access-Control-Allow-Origin: *`);
    assert(headers?.includes('Content-Type') || headers === '*', `${endpointName} has Access-Control-Allow-Headers`);
  }

  await startServer();

  try {
    // Test 1: OPTIONS Preflight
    console.log('--- Test 1: Preflight CORS (OPTIONS) ---');
    const optionsRes = await fetch(`${baseUrl}/manifest.json`, { method: 'OPTIONS' });
    assert(optionsRes.status === 200, 'OPTIONS returns 200 OK');
    assert(optionsRes.headers.get('access-control-allow-origin') === '*', 'OPTIONS has Access-Control-Allow-Origin: *');
    assert(optionsRes.headers.get('access-control-allow-methods')?.includes('OPTIONS'), 'OPTIONS has Access-Control-Allow-Methods');
    assert(optionsRes.headers.get('access-control-allow-headers')?.includes('Content-Type'), 'OPTIONS has Access-Control-Allow-Headers');

    // Test 2: Manifest (/manifest.json)
    console.log('\n--- Test 2: Manifest (/manifest.json) ---');
    const manifestRes = await fetch(`${baseUrl}/manifest.json`);
    const manifest = await manifestRes.json();
    assert(manifestRes.status === 200, 'HTTP status is 200');
    assertCORS(manifestRes, 'Manifest');
    assert(manifest.id === 'com.hentaila.addon', 'Manifest ID is com.hentaila.addon');
    assert(manifest.resources.includes('catalog'), 'Resources contains "catalog"');
    assert(Array.isArray(manifest.catalogs) && manifest.catalogs.length === 1, 'Catalogs length is 1');
    assert(manifest.catalogs[0].id === 'hla-catalog', 'Catalog ID is hla-catalog');
    assert(manifest.catalogs[0].name === 'HentaiLA', 'Catalog Name is HentaiLA');
    assert(manifest.catalogs[0].extra.some(e => e.name === 'search'), 'Catalog supports search');

    // Test 3: Catalog without search (/catalog/anime/hla-catalog.json)
    console.log('\n--- Test 3: Catalog without search (/catalog/anime/hla-catalog.json) ---');
    const catalogRes = await fetch(`${baseUrl}/catalog/anime/hla-catalog.json`);
    const catalogData = await catalogRes.json();
    assert(catalogRes.status === 200, 'HTTP status is 200');
    assertCORS(catalogRes, 'Catalog without search');
    assert(Array.isArray(catalogData.metas), 'Response has metas array');
    assert(catalogData.metas.length > 0, `Metas length is ${catalogData.metas.length} (> 0)`);
    assert(catalogData.metas[0].id.startsWith('hla-'), `Meta ID has hla- prefix: ${catalogData.metas[0].id}`);

    // Test 4: Search with %20 encoded spaces (/catalog/anime/hla-catalog/search=kanojo%20no%20tomodachi.json)
    console.log('\n--- Test 4: Search with %20 encoded spaces ---');
    const searchRes = await fetch(`${baseUrl}/catalog/anime/hla-catalog/search=kanojo%20no%20tomodachi.json`);
    const searchData = await searchRes.json();
    assert(searchRes.status === 200, 'HTTP status is 200');
    assertCORS(searchRes, 'Catalog search %20');
    assert(Array.isArray(searchData.metas), 'Search response has metas array');
    assert(searchData.metas.length > 0, `Search returned ${searchData.metas.length} results for "kanojo no tomodachi"`);

    // Test 5: Search with + encoded spaces (/catalog/anime/hla-catalog/search=kanojo+no+tomodachi.json)
    console.log('\n--- Test 5: Search with + encoded spaces ---');
    const searchPlusRes = await fetch(`${baseUrl}/catalog/anime/hla-catalog/search=kanojo+no+tomodachi.json`);
    const searchPlusData = await searchPlusRes.json();
    assert(searchPlusRes.status === 200, 'HTTP status is 200');
    assertCORS(searchPlusRes, 'Catalog search +');
    assert(Array.isArray(searchPlusData.metas), 'Search response has metas array');
    assert(searchPlusData.metas.length > 0, `Search returned ${searchPlusData.metas.length} results for "kanojo+no+tomodachi"`);

    // Test 6: Metadata (/meta/anime/hla-overflow.json)
    console.log('\n--- Test 6: Metadata (/meta/anime/hla-overflow.json) ---');
    const metaRes = await fetch(`${baseUrl}/meta/anime/hla-overflow.json`);
    const metaData = await metaRes.json();
    assert(metaRes.status === 200, 'HTTP status is 200');
    assertCORS(metaRes, 'Metadata');
    assert(metaData.meta && metaData.meta.id === 'hla-overflow', 'Meta ID is hla-overflow');
    assert(metaData.meta.videos.length >= 8, `Overflow has ${metaData.meta.videos.length} episodes`);

    // Test 7: Multi-Stream Extractor (/stream/anime/hla-overflow-1.json)
    console.log('\n--- Test 7: Multi-Stream Extractor (/stream/anime/hla-overflow-1.json) ---');
    const streamRes = await fetch(`${baseUrl}/stream/anime/hla-overflow-1.json`);
    const streamData = await streamRes.json();
    assert(streamRes.status === 200, 'HTTP status is 200');
    assertCORS(streamRes, 'Streams');
    assert(Array.isArray(streamData.streams), 'streams is an array');
    assert(streamData.streams.length > 1, `Multiple stream options returned: ${streamData.streams.length} servers/qualities (> 1)`);
    assert(streamData.streams.some(s => s.name.includes('Auto')), 'Contains Auto HLS stream');
    assert(streamData.streams.some(s => s.name.includes('1080p') || s.name.includes('720p')), 'Contains distinct quality stream (1080p/720p)');
    assert(streamData.streams[0].behaviorHints?.proxyHeaders?.request?.Referer === 'https://hentaila.tv/', 'Proxy Referer is set to https://hentaila.tv/');
    assert(!!streamData.streams[0].behaviorHints?.proxyHeaders?.request?.['User-Agent'], 'Proxy User-Agent is set');

    // Test 8: Multi-Stream Extractor (/stream/anime/hla-kanojo-no-tomodachi-1.json)
    console.log('\n--- Test 8: Multi-Stream Extractor (/stream/anime/hla-kanojo-no-tomodachi-1.json) ---');
    const stream2Res = await fetch(`${baseUrl}/stream/anime/hla-kanojo-no-tomodachi-1.json`);
    const stream2Data = await stream2Res.json();
    assert(stream2Res.status === 200, 'HTTP status is 200');
    assert(Array.isArray(stream2Data.streams) && stream2Data.streams.length > 1, `Returned ${stream2Data.streams.length} stream options for Kanojo no Tomodachi`);

    // Test 9: Fallback on invalid stream (/stream/anime/hla-invalid-slug-999.json)
    console.log('\n--- Test 9: Fallback on invalid stream ---');
    const invalidRes = await fetch(`${baseUrl}/stream/anime/hla-invalid-slug-999.json`);
    const invalidData = await invalidRes.json();
    assert(invalidRes.status === 200, 'HTTP status is 200');
    assertCORS(invalidRes, 'Invalid stream fallback');
    assert(Array.isArray(invalidData.streams) && invalidData.streams.length === 0, 'Safe empty streams array');

  } catch (err) {
    console.error('Test execution failed with error:', err);
    failed++;
  } finally {
    await stopServer();
  }

  console.log(`\n========================================`);
  console.log(`📊 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
