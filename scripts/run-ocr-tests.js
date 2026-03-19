#!/usr/bin/env node

/**
 * OCR Test Runner
 * 
 * Runs OCR accuracy suite and validates against thresholds:
 * - WER (Word Error Rate) < 0.25
 * - CER (Character Error Rate) < 0.20
 * - Median Latency < 1500ms
 * 
 * Saves results to test-results/ folder with PASS/FAIL prefix
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { Worker } from 'worker_threads';
import 'fake-indexeddb/auto';

// Initialize DOM environment for testing
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: "http://localhost/" });
global.window = dom.window;
global.document = dom.window.document;
global.OffscreenCanvas = class OffscreenCanvas {
  constructor(width, height) {
    const canvas = global.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
};
global.Worker = Worker; // Polyfill Web Worker for Node

// Polyfill Vite's import.meta.env by passing a global var that we can use, 
// but since the code uses `import.meta.env`, we must patch Node's module loader 
// OR just rely on TSX parsing it. Actually, easiest is mapping process.env to it via esbuild if tsx doesn't.
// Let's ensure process.env has the variables.
process.env.VITE_OCR_SERVICE_URL = process.env.VITE_OCR_SERVICE_URL || 'http://localhost:9000';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Thresholds
const THRESHOLDS = {
  WER: 0.25,
  CER: 0.20,
  MEDIAN_LATENCY_MS: 1500
};

async function runOCRTests() {
  console.log('🚀 Starting OCR Accuracy Test Suite\n');
  console.log(`Thresholds:`);
  console.log(`  - WER: < ${THRESHOLDS.WER}`);
  console.log(`  - CER: < ${THRESHOLDS.CER}`);
  console.log(`  - Median Latency: < ${THRESHOLDS.MEDIAN_LATENCY_MS}ms\n`);

  try {
    // Import the test suite
    const { getOCRHybridService } = await import('../src/features/pen-input/services/ocrHybrid.service.ts');
    const service = getOCRHybridService();
    service.warmup = async () => { console.log("🔥 Skipped local worker warmup in Node environment."); };
    
    const testModule = await import('../src/features/pen-input/ocr/__tests__/ocr-accuracy-test.ts');
    const runAllOCRTests = testModule.default;

    // Run tests
    const results = await runAllOCRTests();

    // Extract metrics
    const { summary } = results.accuracy;
    const wer = summary.avgWER || 0;
    const cer = summary.avgCER || 0;
    const medianLatency = calculateMedian(results.accuracy.results.map(r => r.duration));
    
    const avgConfidence = summary.avgConfidence || 0;

    // Check thresholds
    const werPass = wer <= THRESHOLDS.WER;
    const cerPass = cer <= THRESHOLDS.CER;
    const latencyPass = medianLatency <= THRESHOLDS.MEDIAN_LATENCY_MS;
    
    const allPass = werPass && cerPass && latencyPass;

    // Prepare result object
    const testResult = {
      timestamp: new Date().toISOString(),
      status: allPass ? 'PASS' : 'FAILED',
      thresholds: THRESHOLDS,
      metrics: {
        WER: Number(wer.toFixed(4)),
        CER: Number(cer.toFixed(4)),
        medianLatencyMs: Math.round(medianLatency),
        avgConfidence: Number(avgConfidence.toFixed(4)),
        totalTests: summary.total,
        passedTests: summary.passed,
        failedTests: summary.failed
      },
      thresholdResults: {
        WER: { pass: werPass, value: wer, threshold: THRESHOLDS.WER },
        CER: { pass: cerPass, value: cer, threshold: THRESHOLDS.CER },
        latency: { pass: latencyPass, value: medianLatency, threshold: THRESHOLDS.MEDIAN_LATENCY_MS }
      },
      detailedResults: results.accuracy.results.map(r => ({
        name: r.testName,
        passed: r.passed,
        wer: Number(r.wer.toFixed(4)),
        cer: Number(r.cer.toFixed(4)),
        confidence: Number(r.confidence.toFixed(4)),
        duration: Math.round(r.duration)
      })),
      adaptiveLearning: {
        passed: results.learning.passed,
        improvement: Number((results.learning.details.improvement * 100).toFixed(2)) + '%'
      },
      performance: {
        avgTime: Math.round(results.performance.avgTime),
        minTime: Math.round(results.performance.minTime),
        maxTime: Math.round(results.performance.maxTime)
      }
    };

    // Save results
    const resultsDir = join(__dirname, '../src/features/pen-input/ocr/test-results');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = allPass ? 'PASS' : 'FAILED';
    const filename = `${prefix}-${timestamp}.json`;
    const filepath = join(resultsDir, filename);

    writeFileSync(filepath, JSON.stringify(testResult, null, 2));

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Status: ${allPass ? '✅ PASS' : '❌ FAILED'}`);
    console.log(`\nMetrics:`);
    console.log(`  WER:            ${wer.toFixed(4)} (${werPass ? '✅' : '❌'} threshold: ${THRESHOLDS.WER})`);
    console.log(`  CER:            ${cer.toFixed(4)} (${cerPass ? '✅' : '❌'} threshold: ${THRESHOLDS.CER})`);
    console.log(`  Median Latency: ${Math.round(medianLatency)}ms (${latencyPass ? '✅' : '❌'} threshold: ${THRESHOLDS.MEDIAN_LATENCY_MS}ms)`);
    console.log(`  Avg Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`\nTests: ${summary.passed}/${summary.total} passed`);
    console.log(`\nResults saved to: ${filepath}`);
    console.log('='.repeat(80) + '\n');

    // Exit with appropriate code
    process.exit(allPass ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite failed with error:');
    console.error(error);
    
    // Save error result
    const resultsDir = join(__dirname, '../src/features/pen-input/ocr/test-results');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `FAILED-${timestamp}.json`;
    const filepath = join(resultsDir, filename);
    
    writeFileSync(filepath, JSON.stringify({
      timestamp: new Date().toISOString(),
      status: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, null, 2));
    
    process.exit(1);
  }
}

function calculateMedian(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Run tests
runOCRTests();
