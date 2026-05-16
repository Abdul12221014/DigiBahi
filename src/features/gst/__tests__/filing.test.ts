/**
 * Tests for the filing state-machine logic.
 * We test the pure derived-field rules directly by constructing invoice arrays
 * and replaying the getFilingStatus computation inline (no Dexie).
 */
import type { GSTInvoice } from '../types/gst-invoice.types';

// Inline the pure derivation from filing.service so we can test it without Dexie
function derive(invoices: Pick<GSTInvoice, 'validationStatus' | 'filingStatus'>[]) {
  const errors  = invoices.filter(i => i.validationStatus === 'ERROR').length;
  const valid   = invoices.filter(i => i.validationStatus === 'VALID' || i.validationStatus === 'WARNING').length;
  const staged  = invoices.filter(i => i.filingStatus === 'STAGED').length;
  const filed   = invoices.filter(i => i.filingStatus === 'FILED').length;
  const readyToStage = invoices.filter(
    i => (i.validationStatus === 'VALID' || i.validationStatus === 'WARNING') &&
         i.filingStatus === 'PENDING',
  ).length;
  return {
    total: invoices.length, valid, errors, staged, filed, readyToStage,
    canStage: readyToStage > 0 && errors === 0,
    canMarkFiled: staged > 0,
  };
}

function make(validationStatus: GSTInvoice['validationStatus'], filingStatus: GSTInvoice['filingStatus']) {
  return { validationStatus, filingStatus };
}

describe('FilingStatus derivation', () => {
  test('empty period', () => {
    const s = derive([]);
    expect(s.total).toBe(0);
    expect(s.canStage).toBe(false);
    expect(s.canMarkFiled).toBe(false);
  });

  test('all VALID PENDING → canStage true', () => {
    const s = derive([make('VALID', 'PENDING'), make('VALID', 'PENDING')]);
    expect(s.canStage).toBe(true);
    expect(s.readyToStage).toBe(2);
    expect(s.errors).toBe(0);
  });

  test('any ERROR → canStage false even if valid ones exist', () => {
    const s = derive([make('VALID', 'PENDING'), make('ERROR', 'PENDING')]);
    expect(s.canStage).toBe(false);
    expect(s.errors).toBe(1);
  });

  test('WARNING invoices count as ready to stage', () => {
    const s = derive([make('WARNING', 'PENDING')]);
    expect(s.canStage).toBe(true);
    expect(s.readyToStage).toBe(1);
  });

  test('already STAGED invoices are not in readyToStage', () => {
    const s = derive([make('VALID', 'STAGED'), make('VALID', 'PENDING')]);
    expect(s.readyToStage).toBe(1);
    expect(s.staged).toBe(1);
  });

  test('canMarkFiled only when staged > 0', () => {
    const noStaged = derive([make('VALID', 'PENDING')]);
    expect(noStaged.canMarkFiled).toBe(false);

    const hasStaged = derive([make('VALID', 'STAGED')]);
    expect(hasStaged.canMarkFiled).toBe(true);
  });

  test('FILED invoices counted separately', () => {
    const s = derive([make('VALID', 'FILED'), make('VALID', 'FILED')]);
    expect(s.filed).toBe(2);
    expect(s.readyToStage).toBe(0);
    expect(s.canStage).toBe(false);
    expect(s.canMarkFiled).toBe(false);
  });

  test('mixed real-world scenario', () => {
    const s = derive([
      make('VALID', 'FILED'),
      make('VALID', 'STAGED'),
      make('WARNING', 'PENDING'),
      make('ERROR', 'PENDING'),
    ]);
    expect(s.total).toBe(4);
    expect(s.filed).toBe(1);
    expect(s.staged).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.readyToStage).toBe(1);
    // errors block staging
    expect(s.canStage).toBe(false);
    expect(s.canMarkFiled).toBe(true);
  });
});
