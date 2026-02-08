#!/usr/bin/env node
/**
 * Aardvark Test Runner
 * Runs all browser-based tests using Playwright
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Test files to run
const testFiles = [
  'components/core/event-bus/tests/unit/event-bus.spec.html',
  'components/core/event-bus/tests/integration/cross-component.spec.html',
  'components/core/opfs-provider/tests/unit/opfs-provider.spec.html',
  'components/core/indexeddb-provider/tests/unit/indexeddb-provider.spec.html',
  'components/core/message-bridge/tests/unit/message-bridge.spec.html',
  'components/core/api-client/tests/unit/api-client.spec.html',
  'components/storage/tool-store/tests/unit/tool-store.spec.html',
  'components/storage/tool-store/tests/unit/skill-parser.spec.html',
  'components/storage/session-store/tests/unit/session-store.spec.html',
  'components/storage/file-store/tests/unit/file-store.spec.html',
  'components/storage/history-store/tests/unit/history-store.spec.html',
  'tests/integration/integration-tests.html'
];

const results = [];

// Simple HTTP server to serve static files
function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(__dirname, req.url === '/' ? 'www/tests/index.html' : req.url);
      const ext = path.extname(filePath);
      const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.css': 'text/css'
      }[ext] || 'text/plain';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

// Run a single test file
async function runTest(browser, testPath, baseUrl) {
  console.log(`\n📋 Running: ${testPath}`);
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('✓') || text.includes('✗') || text.includes('Test')) {
      console.log(`  ${text}`);
    }
  });

  // Navigate to test page
  const url = `${baseUrl}/${testPath}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Wait for tests to complete
  // Tests report completion via postMessage or we can check for the summary element
  await page.waitForFunction(() => {
    const badge = document.getElementById('status-badge');
    return badge && (badge.textContent.includes('Passed') || badge.textContent.includes('Failed'));
  }, { timeout: 60000 });
  
  // Extract results
  const testResult = await page.evaluate(() => {
    const totalEl = document.getElementById('total-count');
    const passEl = document.getElementById('pass-count');
    const failEl = document.getElementById('fail-count');
    const badge = document.getElementById('status-badge');
    
    return {
      total: totalEl ? parseInt(totalEl.textContent) : 0,
      passed: passEl ? parseInt(passEl.textContent) : 0,
      failed: failEl ? parseInt(failEl.textContent) : 0,
      status: badge ? badge.textContent : 'Unknown'
    };
  });
  
  await context.close();
  
  return {
    file: testPath,
    ...testResult
  };
}

// Main function
async function main() {
  const port = 8765;
  const server = await startServer(port);
  const baseUrl = `http://localhost:${port}`;
  
  console.log('🚀 Starting Aardvark Test Suite');
  console.log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const testFile of testFiles) {
      try {
        const result = await runTest(browser, testFile, baseUrl);
        results.push(result);
      } catch (error) {
        console.error(`  ✗ Error running ${testFile}: ${error.message}`);
        results.push({
          file: testFile,
          total: 0,
          passed: 0,
          failed: 1,
          status: 'Error: ' + error.message,
          error: true
        });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  
  for (const result of results) {
    const status = result.error ? '⚠️' : result.failed === 0 ? '✅' : '❌';
    console.log(`${status} ${result.file}`);
    console.log(`   Tests: ${result.total}, Passed: ${result.passed}, Failed: ${result.failed}`);
    
    grandTotal += result.total;
    grandPassed += result.passed;
    grandFailed += result.failed;
  }
  
  console.log('\n' + '-'.repeat(60));
  console.log(`Total Tests: ${grandTotal}`);
  console.log(`Passed: ${grandPassed} ✅`);
  console.log(`Failed: ${grandFailed} ${grandFailed > 0 ? '❌' : ''}`);
  console.log('='.repeat(60));
  
  // Exit with error code if any tests failed
  process.exit(grandFailed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
