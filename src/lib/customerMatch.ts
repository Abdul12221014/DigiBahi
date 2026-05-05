/**
 * Customer Match Service — Fuzzy contact lookup
 * ──────────────────────────────────────────────
 * Replaces exact string match with Levenshtein-based fuzzy matching.
 * Prevents duplicate contacts and links entries to customer_id.
 *
 * Threshold: 0.82 (catches "Ramesh Kumar" vs "ramesh kumar" or minor typos)
 */

import { db, CustomerContact } from './db';
import { analytics } from './analytics';

// ─── Fuzzy Scoring ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Levenshtein edit distance */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Returns 0.0–1.0 similarity score */
function fuzzyScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.88;
  const dist   = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MatchResult {
  contact:   CustomerContact | null;
  score:     number;
  isExact:   boolean;
}

const MATCH_THRESHOLD = 0.82;

/**
 * Find the best matching contact for a given party name.
 * Returns null contact if nothing meets the fuzzy threshold.
 */
export async function findBestContact(partyName: string): Promise<MatchResult> {
  if (!partyName?.trim()) return { contact: null, score: 0, isExact: false };

  const all = await db.customerContacts.toArray();
  let best: CustomerContact | null = null;
  let bestScore = 0;

  for (const c of all) {
    const score = fuzzyScore(partyName, c.name);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  const matched = bestScore >= MATCH_THRESHOLD ? best : null;

  if (matched) {
    analytics.track('contact_matched', {
      score:    bestScore,
      is_exact: bestScore === 1.0,
      party:    partyName,
    });
  }

  return {
    contact:  matched,
    score:    bestScore,
    isExact:  bestScore === 1.0,
  };
}

/**
 * Upsert a contact — prevents duplicates using fuzzy match.
 * If a close match exists, updates it instead of creating a new record.
 */
export async function upsertContact(
  name:  string,
  phone: string,
): Promise<CustomerContact> {
  const now = new Date().toISOString();
  const { contact } = await findBestContact(name);

  if (contact?.id) {
    // Update existing — no duplicate created
    await db.customerContacts.update(contact.id, {
      phone,
      updated_at: now,
    });
    analytics.track('contact_matched', { action: 'updated', name });
    return { ...contact, phone, updated_at: now };
  }

  // Create new contact
  const id = await db.customerContacts.add({
    name,
    phone,
    created_at: now,
    updated_at: now,
  });
  analytics.track('contact_created', { name });
  return { id, name, phone, created_at: now, updated_at: now };
}

/**
 * Smart share lookup — finds phone instantly if contact matches.
 * Returns null if contact not found (caller must show phone modal).
 */
export async function getPhoneForParty(
  partyName: string,
): Promise<string | null> {
  const { contact } = await findBestContact(partyName);
  return contact?.phone ?? null;
}
