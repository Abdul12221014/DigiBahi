/**
 * Migration Tests
 * 
 * Tests for the database migration from V1 to V2
 * - Tests migratePagesToV2 function
 * - Tests backward compatibility
 * - Tests non-destructive migration
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  NotebookPage,
  savePage,
  loadPage,
  listPages,
  migratePagesToV2,
  backupPagesBeforeMigration,
  penDB,
} from '@/lib/localStore';

describe('Database Migration V1 to V2', () => {
  const testPin = 'test1234';

  beforeEach(async () => {
    // Clear database before each test
    await penDB.notebookPages.clear();
    await penDB.notebookSections.clear();
  });

  afterEach(async () => {
    // Cleanup after each test
    await penDB.notebookPages.clear();
    await penDB.notebookSections.clear();
  });

  describe('migratePagesToV2', () => {
    it('should add templateId to pages missing it', async () => {
      // Create a "legacy" page without templateId
      const legacyPage = {
        id: 'test_page_1',
        pageNumber: 1,
        title: 'Legacy Page',
        strokes: [],
        shapes: [],
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      } as Partial<NotebookPage>; // Cast to bypass type checking

      await savePage(legacyPage as NotebookPage, testPin);

      // Run migration
      const result = await migratePagesToV2(testPin);

      // Check results
      expect(result.migrated).toBe(1);
      expect(result.errors).toBe(0);

      // Verify page has templateId now
      const migratedPage = await loadPage(legacyPage.id, testPin);
      expect(migratedPage).toBeDefined();
      expect(migratedPage!.templateId).toBe('lined'); // Default template
    });

    it('should skip pages that already have templateId', async () => {
      // Create a page with templateId
      const modernPage: NotebookPage = {
        id: 'test_page_2',
        pageNumber: 1,
        title: 'Modern Page',
        templateId: 'columnar',
        sectionId: undefined,
        strokes: [],
        shapes: [],
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      await savePage(modernPage, testPin);

      // Run migration
      const result = await migratePagesToV2(testPin);

      // Check results - should be skipped
      expect(result.skipped).toBe(1);
      expect(result.migrated).toBe(0);

      // Verify page unchanged
      const unchangedPage = await loadPage(modernPage.id, testPin);
      expect(unchangedPage!.templateId).toBe('columnar');
    });

    it('should preserve existing page data during migration', async () => {
      // Create a legacy page with strokes and entries
      const legacyPage = {
        id: 'test_page_3',
        pageNumber: 1,
        title: 'Page with Data',
        strokes: [
          { id: 's1', points: [], color: '#000', width: 2, opacity: 1, tool: 'pen', timestamp: Date.now() },
        ],
        shapes: [],
        entries: [
          { id: 'e1', date: '2025-10-10', party: 'Test Party', amount: 1000, notes: 'Test' },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: ['test', 'migration'],
      } as Partial<NotebookPage>;

      await savePage(legacyPage as NotebookPage, testPin);

      // Run migration
      await migratePagesToV2(testPin);

      // Verify data preserved
      const migratedPage = await loadPage(legacyPage.id, testPin);
      expect(migratedPage!.strokes.length).toBe(1);
      expect(migratedPage!.entries.length).toBe(1);
      expect(migratedPage!.tags).toEqual(['test', 'migration']);
      expect(migratedPage!.title).toBe('Page with Data');
    });

    it('should migrate multiple pages', async () => {
      // Create multiple legacy pages
      for (let i = 1; i <= 5; i++) {
        const page = {
          id: `test_page_${i}`,
          pageNumber: i,
          title: `Page ${i}`,
          strokes: [],
          shapes: [],
          entries: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
        } as Partial<NotebookPage>;
        await savePage(page as NotebookPage, testPin);
      }

      // Run migration
      const result = await migratePagesToV2(testPin);

      // Check results
      expect(result.migrated).toBe(5);
      expect(result.errors).toBe(0);

      // Verify all pages have templateId
      const pages = await listPages(testPin);
      pages.forEach(page => {
        expect(page.templateId).toBe('lined');
      });
    });

    it('should handle empty database', async () => {
      // Run migration on empty database
      const result = await migratePagesToV2(testPin);

      // Should complete without errors
      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should be idempotent', async () => {
      // Create a legacy page
      const legacyPage = {
        id: 'test_page_idempotent',
        pageNumber: 1,
        title: 'Idempotent Test',
        strokes: [],
        shapes: [],
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      } as Partial<NotebookPage>;

      await savePage(legacyPage as NotebookPage, testPin);

      // Run migration twice
      const result1 = await migratePagesToV2(testPin);
      const result2 = await migratePagesToV2(testPin);

      // First should migrate, second should skip
      expect(result1.migrated).toBe(1);
      expect(result2.skipped).toBe(1);
      expect(result2.migrated).toBe(0);
    });
  });

  describe('backupPagesBeforeMigration', () => {
    it('should create backup of all pages', async () => {
      // Create test pages
      for (let i = 1; i <= 3; i++) {
        const page: NotebookPage = {
          id: `backup_test_${i}`,
          pageNumber: i,
          title: `Backup Page ${i}`,
          templateId: 'lined',
          sectionId: undefined,
          strokes: [],
          shapes: [],
          entries: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
        };
        await savePage(page, testPin);
      }

      // Create backup
      const backupJSON = await backupPagesBeforeMigration(testPin);
      const backup = JSON.parse(backupJSON);

      // Verify backup structure
      expect(backup.version).toBe('v1');
      expect(backup.count).toBe(3);
      expect(backup.pages.length).toBe(3);
      expect(backup.timestamp).toBeDefined();
    });

    it('should include all page data in backup', async () => {
      const testPage: NotebookPage = {
        id: 'detailed_backup',
        pageNumber: 1,
        title: 'Detailed Page',
        templateId: 'columnar',
        sectionId: 'section1',
        strokes: [
          { id: 's1', points: [], color: '#000', width: 2, opacity: 1, tool: 'pen', timestamp: Date.now() },
        ],
        shapes: [],
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: ['important'],
      };

      await savePage(testPage, testPin);

      const backupJSON = await backupPagesBeforeMigration(testPin);
      const backup = JSON.parse(backupJSON);

      const backedUpPage = backup.pages[0];
      expect(backedUpPage.id).toBe('detailed_backup');
      expect(backedUpPage.templateId).toBe('columnar');
      expect(backedUpPage.sectionId).toBe('section1');
      expect(backedUpPage.strokes.length).toBe(1);
      expect(backedUpPage.tags).toEqual(['important']);
    });

    it('should handle empty database', async () => {
      const backupJSON = await backupPagesBeforeMigration(testPin);
      const backup = JSON.parse(backupJSON);

      expect(backup.count).toBe(0);
      expect(backup.pages).toEqual([]);
    });
  });

  describe('Backward Compatibility', () => {
    it('should allow saving and loading pages with new schema', async () => {
      const newPage: NotebookPage = {
        id: 'new_schema_page',
        pageNumber: 1,
        title: 'New Schema Page',
        templateId: 'blank',
        sectionId: 'my-section',
        strokes: [],
        shapes: [],
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      await savePage(newPage, testPin);
      const loadedPage = await loadPage(newPage.id, testPin);

      expect(loadedPage).toBeDefined();
      expect(loadedPage!.templateId).toBe('blank');
      expect(loadedPage!.sectionId).toBe('my-section');
    });

    it('should handle pages with undefined sectionId', async () => {
      const page: NotebookPage = {
        id: 'no_section_page',
        pageNumber: 1,
        title: 'No Section',
        templateId: 'lined',
        sectionId: undefined,
        strokes: [],
        shapes: [],
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };

      await savePage(page, testPin);
      const loadedPage = await loadPage(page.id, testPin);

      expect(loadedPage).toBeDefined();
      expect(loadedPage!.sectionId).toBeUndefined();
    });
  });
});

