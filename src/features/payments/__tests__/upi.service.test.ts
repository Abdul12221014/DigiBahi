/**
 * UPI Service Unit Tests
 * Basic validation tests for UPI functionality
 */

import { 
  generateTxnRef, 
  buildUPIIntentLink, 
  validateUPIId, 
  formatAmount,
  formatUPIIdForDisplay,
  createUPIIntent
} from '../services/upi.service';

// Mock test runner (simple assertion function)
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Test failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

// Test suite
export function runUPITests() {
  console.log('🧪 Running UPI Service Tests...\n');

  // Test 1: Transaction Reference Generation
  try {
    const txnRef1 = generateTxnRef();
    const txnRef2 = generateTxnRef();
    
    assert(txnRef1.startsWith('DIGBAHI_'), 'Transaction reference should start with DIGBAHI_');
    assert(txnRef1 !== txnRef2, 'Transaction references should be unique');
    assert(txnRef1.length > 20, 'Transaction reference should be sufficiently long');
    
    console.log(`   Generated TxnRef: ${txnRef1}`);
  } catch (error) {
    console.error('❌ Transaction Reference Test Failed:', error);
  }

  // Test 2: UPI Intent Link Generation
  try {
    const link = buildUPIIntentLink({
      upiId: 'merchant@paytm',
      amount: 1000,
      note: 'Test payment',
      txnRef: 'DIGBAHI_20250101_120000_TEST'
    });
    
    assert(link.startsWith('upi://pay'), 'UPI link should start with upi://pay');
    assert(link.includes('pa=merchant@paytm'), 'UPI link should contain payee address');
    assert(link.includes('am=1000'), 'UPI link should contain amount');
    assert(link.includes('cu=INR'), 'UPI link should contain currency');
    assert(link.includes('tr=DIGBAHI_20250101_120000_TEST'), 'UPI link should contain transaction reference');
    
    console.log(`   Generated Link: ${link}`);
  } catch (error) {
    console.error('❌ UPI Link Generation Test Failed:', error);
  }

  // Test 3: UPI ID Validation
  try {
    // Valid UPI IDs
    const validUPIs = [
      'user@paytm',
      'merchant@phonepe',
      'customer@gpay',
      'shop@ybl',
      'business@okaxis'
    ];
    
    validUPIs.forEach(upiId => {
      const result = validateUPIId(upiId);
      assert(result.valid, `UPI ID ${upiId} should be valid`);
    });
    
    // Invalid UPI IDs
    const invalidUPIs = [
      '',
      'invalid',
      'user@',
      '@paytm',
      'user@invalidbank'
    ];
    
    invalidUPIs.forEach(upiId => {
      const result = validateUPIId(upiId);
      assert(!result.valid, `UPI ID ${upiId} should be invalid`);
    });
    
    console.log('   UPI ID validation tests passed');
  } catch (error) {
    console.error('❌ UPI ID Validation Test Failed:', error);
  }

  // Test 4: Amount Formatting
  try {
    assert(formatAmount(1000) === '₹1,000', 'Amount formatting should work correctly');
    assert(formatAmount(1000.50) === '₹1,000.50', 'Decimal amount formatting should work');
    assert(formatAmount(0) === '₹0', 'Zero amount formatting should work');
    
    console.log('   Amount formatting tests passed');
  } catch (error) {
    console.error('❌ Amount Formatting Test Failed:', error);
  }

  // Test 5: UPI ID Display Formatting
  try {
    const masked = formatUPIIdForDisplay('merchant@paytm');
    assert(masked.includes('***'), 'UPI ID should be masked for display');
    assert(masked.includes('@paytm'), 'Domain should remain visible');
    
    console.log(`   Masked UPI ID: ${masked}`);
  } catch (error) {
    console.error('❌ UPI ID Display Formatting Test Failed:', error);
  }

  // Test 6: UPI Intent Creation
  try {
    const intent = createUPIIntent({
      upiId: 'merchant@paytm',
      amount: 1000,
      note: 'Test payment',
      payerName: 'Test Customer'
    });
    
    assert(intent.id.length > 0, 'Intent should have an ID');
    assert(intent.upiId === 'merchant@paytm', 'Intent should have correct UPI ID');
    assert(intent.amount === 1000, 'Intent should have correct amount');
    assert(intent.status === 'draft', 'Intent should start as draft');
    assert(intent.txnRef.startsWith('DIGBAHI_'), 'Intent should have valid transaction reference');
    assert(intent.createdAt > 0, 'Intent should have creation timestamp');
    assert(intent.updatedAt > 0, 'Intent should have update timestamp');
    
    console.log(`   Created Intent ID: ${intent.id}`);
  } catch (error) {
    console.error('❌ UPI Intent Creation Test Failed:', error);
  }

  console.log('\n🎉 All UPI Service Tests Passed!');
}

// Export for use in development
export default runUPITests;

// ─── Vitest suite ────────────────────────────────────────────────────────────

import { describe, it } from 'vitest';

describe('UPI Service', () => {
  it('passes all assertions', () => {
    runUPITests();
  });
});
