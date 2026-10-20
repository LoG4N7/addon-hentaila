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
    assert(headers === '*', `${endpointName} has Access-Control-Allow-Headers: *`);
  }

  await startServer();

  try {
    // Test 1: Landing Page
    console.log('--- Test 1: Landing Page (/) ---');
    const rootRes = await fetch(`${baseUrl}/`);
    const rootHtml = await rootRes.text();
    assert(rootRes.status === 200, 'HTTP status is 200');
    assert(rootHtml.includes('HentaiLA Addon'), 'Contains addon title in HTML');
    assert(rootHtml.includes('hla-catalog'), 'Contains hla-catalog reference');
    assertCORS(rootRes, 'Root route');

    // Test 2: Manifest (/manifest.json)
    console.log('\n--- Test 2: Manifest (/manifest.json) ---');
    const manifestRes = await fetch(`${baseUrl}/manifest.json`);
    const manifest = await manifestRes.json();
    assert(manifestRes.status === 200, 'HTTP status is 200');
    assertCORS(manifestRes, 'Manifest');
    assert(manifest.id === 'com.hentaila.addon', 'Manifest ID is com.hentaila.addon');
    assert(manifest.name === 'HentaiLA Addon', 'Manifest Name is HentaiLA Addon');
    assert(manifest.version === '1.0.0', 'Manifest Version is 1.0.0');
    assert(manifest.resources.includes('catalog'), 'Resources contains "catalog"');
    assert(manifest.types.includes('anime'), 'Types contains anime');
    assert(manifest.idPrefixes.includes('hla-'), 'idPrefixes contains hla-');
    
    // Strict catalog verification
    assert(Array.isArray(manifest.catalogs) && manifest.catalogs.length === 1, 'Catalogs length is exactly 1');
    const cat = manifest.catalogs[0];
    assert(cat.type === 'anime', 'Catalog type is "anime"');
    assert(cat.id === 'hla-catalog', 'Catalog ID is "hla-catalog"');
    assert(cat.name === 'HentaiLA', 'Catalog name is "HentaiLA"');
    assert(Array.isArray(cat.extra), 'Catalog extra is an array');
    assert(cat.extra.some(e => e.name === 'search' && e.isRequired === false), 'Catalog extra has search (isRequired: false)');

    // Test 3: Standard Catalog without search (/catalog/anime/hla-catalog.json)
    console.log('\n--- Test 3: Catalog without search (/catalog/anime/hla-catalog.json) ---');
    const catalogRes = await fetch(`${baseUrl}/catalog/anime/hla-catalog.json`);
    const catalogData = await catalogRes.json();
    assert(catalogRes.status === 200, 'HTTP status is 200');
    assertCORS(catalogRes, 'Catalog without search');
    assert(Array.isArray(catalogData.metas), 'Response has metas array');
    assert(catalogData.metas.length > 0, `Metas length is ${catalogData.metas.length} (> 0)`);
    assert(catalogData.metas[0].id.startsWith('hla-'), `Meta ID has hla- prefix: ${catalogData.metas[0].id}`);
    assert(!!catalogData.metas[0].name, `Meta has name: "${catalogData.metas[0].name}"`);
    assert(!!catalogData.metas[0].poster, `Meta has poster: ${catalogData.metas[0].poster}`);

    // Test 4: Catalog with search (/catalog/anime/hla-catalog/search=kanojo.json)
    console.log('\n--- Test 4: Catalog with search (/catalog/anime/hla-catalog/search=kanojo.json) ---');
    const searchRes = await fetch(`${baseUrl}/catalog/anime/hla-catalog/search=kanojo.json`);
    const searchData = await searchRes.json();
    assert(searchRes.status === 200, 'HTTP status is 200');
    assertCORS(searchRes, 'Catalog with search');
    assert(Array.isArray(searchData.metas), 'Search response has metas array');
    assert(searchData.metas.length > 0, `Search returned ${searchData.metas.length} results`);

    // Test 5: Metadata (/meta/anime/hla-overflow.json)
    console.log('\n--- Test 5: Metadata (/meta/anime/hla-overflow.json) ---');
    const metaRes = await fetch(`${baseUrl}/meta/anime/hla-overflow.json`);
    const metaData = await metaRes.json();
    assert(metaRes.status === 200, 'HTTP status is 200');
    assertCORS(metaRes, 'Metadata');
    assert(!!metaData.meta, 'meta object is present');
    assert(metaData.meta.id === 'hla-overflow', 'Meta ID is hla-overflow');
    assert(metaData.meta.name === 'Overflow', `Meta name is ${metaData.meta.name}`);
    assert(Array.isArray(metaData.meta.genres), 'Genres is an array');
    assert(Array.isArray(metaData.meta.videos), 'Videos is an array');
    assert(metaData.meta.videos.length >= 8, `Overflow has ${metaData.meta.videos.length} episodes (>= 8)`);
    assert(metaData.meta.videos[0].id === 'hla-overflow-1', `Episode 1 ID is ${metaData.meta.videos[0].id}`);

    // Test 6: Streams (/stream/anime/hla-overflow-1.json)
    console.log('\n--- Test 6: Streams (/stream/anime/hla-overflow-1.json) ---');
    const streamRes = await fetch(`${baseUrl}/stream/anime/hla-overflow-1.json`);
    const streamData = await streamRes.json();
    assert(streamRes.status === 200, 'HTTP status is 200');
    assertCORS(streamRes, 'Streams');
    assert(Array.isArray(streamData.streams), 'streams array is present');
    assert(streamData.streams.length > 0, `Found ${streamData.streams.length} stream(s)`);
    const firstStream = streamData.streams[0];
    assert(!!firstStream.url, `Stream URL is present: ${firstStream.url}`);
    assert(firstStream.behaviorHints?.proxyHeaders?.request?.Referer === 'https://hentaila.tv/', 'Referer header is set to https://hentaila.tv/');

    // Test 7: Safe fallback on invalid stream (/stream/anime/hla-invalid-slug-999.json)
    console.log('\n--- Test 7: Safe Fallback (/stream/anime/hla-invalid-slug-999.json) ---');
    const invalidStreamRes = await fetch(`${baseUrl}/stream/anime/hla-invalid-slug-999.json`);
    const invalidStreamData = await invalidStreamRes.json();
    assert(invalidStreamRes.status === 200, 'HTTP status is 200');
    assertCORS(invalidStreamRes, 'Safe Fallback');
    assert(Array.isArray(invalidStreamData.streams), 'streams is an array');
    assert(invalidStreamData.streams.length === 0, 'streams array is empty without throwing');

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
