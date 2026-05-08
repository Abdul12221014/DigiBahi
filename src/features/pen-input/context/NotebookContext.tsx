/* eslint-disable react-refresh/only-export-components */
/**
 * NotebookContext - Manages multi-page notebook state
 * 
 * Provides context for managing multiple pages in the digital ledger book.
 * Handles page creation, navigation, and persistence to IndexedDB.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { 
  NotebookPage, 
  savePage as savePageToDB, 
  loadPage as loadPageFromDB,
  listPages,
  deletePage as deletePageFromDB,
  getPageCount,
  ensureInitialPage
} from '@/lib/localStore';
import { toast } from 'sonner';

interface NotebookContextType {
  // State
  pages: NotebookPage[];
  currentPageIndex: number;
  currentPage: NotebookPage | null;
  totalPages: number;
  loading: boolean;
  
  // Navigation methods
  goToPage: (index: number) => Promise<void>;
  nextPage: () => Promise<void>;
  prevPage: () => Promise<void>;
  goToPageNumber: (pageNumber: number) => Promise<void>;
  
  // Page management methods
  createPage: () => Promise<NotebookPage>;
  deletePage: (pageId: string) => Promise<void>;
  updateCurrentPage: (updates: Partial<NotebookPage>) => Promise<void>;
  savePage: (page: NotebookPage) => Promise<void>;
  reloadCurrentPage: () => Promise<void>;
  
  // Utility methods
  refreshPages: () => Promise<void>;
  canGoNext: boolean;
  canGoPrev: boolean;
}

const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

interface NotebookProviderProps {
  children: ReactNode;
}

export function NotebookProvider({ children }: NotebookProviderProps) {
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const currentPage = pages[currentPageIndex] || null;
  const totalPages = pages.length;
  const canGoNext = currentPageIndex < totalPages - 1;
  const canGoPrev = currentPageIndex > 0;
  
  /**
   * Initialize: Load all pages from IndexedDB
   */
  const refreshPages = useCallback(async () => {
    try {
      setLoading(true);
      const loadedPages = await listPages();
      
      if (loadedPages.length === 0) {
        // Create initial page if none exists
        const initialPage = await ensureInitialPage();
        setPages([initialPage]);
        setCurrentPageIndex(0);
      } else {
        // Sort by page number
        const sortedPages = loadedPages.sort((a, b) => a.pageNumber - b.pageNumber);
        setPages(sortedPages);
        
        // Keep current index if valid, otherwise reset to 0
        if (currentPageIndex >= sortedPages.length) {
          setCurrentPageIndex(0);
        }
      }
    } catch (error) {
      console.error('[NotebookContext] Error loading pages:', error);
      toast.error('Failed to load notebook pages');
    } finally {
      setLoading(false);
    }
  }, [currentPageIndex]);
  
  // Load pages on mount
  useEffect(() => {
    refreshPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  /**
   * Navigate to specific page index
   */
  const goToPage = useCallback(async (index: number) => {
    if (index < 0 || index >= pages.length) {
      console.warn(`[NotebookContext] Invalid page index: ${index}`);
      return;
    }
    
    // Save current page before switching
    if (currentPage) {
      try {
        await savePageToDB(currentPage);
      } catch (error) {
        console.error('[NotebookContext] Error saving current page:', error);
      }
    }
    
    setCurrentPageIndex(index);
    toast.success(`Switched to Page ${pages[index].pageNumber}`);
  }, [pages, currentPage]);
  
  /**
   * Navigate to next page
   */
  const nextPage = useCallback(async () => {
    if (canGoNext) {
      await goToPage(currentPageIndex + 1);
    }
  }, [canGoNext, currentPageIndex, goToPage]);
  
  /**
   * Navigate to previous page
   */
  const prevPage = useCallback(async () => {
    if (canGoPrev) {
      await goToPage(currentPageIndex - 1);
    }
  }, [canGoPrev, currentPageIndex, goToPage]);
  
  /**
   * Navigate to specific page number
   */
  const goToPageNumber = useCallback(async (pageNumber: number) => {
    const index = pages.findIndex(p => p.pageNumber === pageNumber);
    if (index !== -1) {
      await goToPage(index);
    } else {
      toast.error(`Page ${pageNumber} not found`);
    }
  }, [pages, goToPage]);
  
  /**
   * Create a new blank page
   */
  const createPage = useCallback(async (): Promise<NotebookPage> => {
    try {
      const nextPageNumber = pages.length > 0 
        ? Math.max(...pages.map(p => p.pageNumber)) + 1 
        : 1;
      
      const newPage: NotebookPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        pageNumber: nextPageNumber,
        title: `Page ${nextPageNumber}`,
        templateId: 'lined', // Default template
        sectionId: undefined,
        strokes: [],
        shapes: [],
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
      };
      
      await savePageToDB(newPage);
      await refreshPages();
      
      // Navigate to the new page
      const newIndex = pages.length; // Will be the last page after refresh
      setCurrentPageIndex(newIndex);
      
      toast.success(`Created Page ${nextPageNumber}`);
      return newPage;
    } catch (error) {
      console.error('[NotebookContext] Error creating page:', error);
      toast.error('Failed to create new page');
      throw error;
    }
  }, [pages, refreshPages]);
  
  /**
   * Delete a page by pageId
   */
  const deletePage = useCallback(async (pageId: string) => {
    try {
      if (pages.length <= 1) {
        toast.error('Cannot delete the last page');
        return;
      }
      
      const pageToDelete = pages.find(p => p.id === pageId);
      if (!pageToDelete) {
        toast.error('Page not found');
        return;
      }
      
      await deletePageFromDB(pageId);
      
      // If deleting current page, navigate to previous or next
      if (currentPage?.id === pageId) {
        if (canGoPrev) {
          setCurrentPageIndex(currentPageIndex - 1);
        } else if (canGoNext) {
          setCurrentPageIndex(0);
        }
      }
      
      await refreshPages();
      toast.success(`Deleted Page ${pageToDelete.pageNumber}`);
    } catch (error) {
      console.error('[NotebookContext] Error deleting page:', error);
      toast.error('Failed to delete page');
    }
  }, [pages, currentPage, currentPageIndex, canGoPrev, canGoNext, refreshPages]);
  
  /**
   * Update current page with new data
   */
  const updateCurrentPage = useCallback(async (updates: Partial<NotebookPage>) => {
    if (!currentPage) {
      console.warn('[NotebookContext] No current page to update');
      return;
    }
    
    try {
      const updatedPage: NotebookPage = {
        ...currentPage,
        ...updates,
        updatedAt: Date.now(),
      };
      
      await savePageToDB(updatedPage);
      
      // Update local state
      setPages(prev => prev.map((p, idx) => 
        idx === currentPageIndex ? updatedPage : p
      ));
    } catch (error) {
      console.error('[NotebookContext] Error updating page:', error);
      toast.error('Failed to update page');
    }
  }, [currentPage, currentPageIndex]);
  
  /**
   * Save a specific page
   */
  const savePage = useCallback(async (page: NotebookPage) => {
    try {
      await savePageToDB(page);
      
      // Update local state if this is the current page
      if (currentPage?.id === page.id) {
        setPages(prev => prev.map(p => 
          p.id === page.id ? page : p
        ));
      }
    } catch (error) {
      console.error('[NotebookContext] Error saving page:', error);
      toast.error('Failed to save page');
    }
  }, [currentPage]);
  
  /**
   * Reload the current page from database (useful after external updates)
   */
  const reloadCurrentPage = useCallback(async () => {
    if (!currentPage) return;
    
    try {
      const reloadedPage = await loadPageFromDB(currentPage.id);
      if (reloadedPage) {
        setPages(prev => prev.map((p, idx) => 
          idx === currentPageIndex ? reloadedPage : p
        ));
      }
    } catch (error) {
      console.error('[NotebookContext] Error reloading current page:', error);
    }
  }, [currentPage, currentPageIndex]);
  
  const value: NotebookContextType = {
    pages,
    currentPageIndex,
    currentPage,
    totalPages,
    loading,
    goToPage,
    nextPage,
    prevPage,
    goToPageNumber,
    createPage,
    deletePage,
    updateCurrentPage,
    savePage,
    reloadCurrentPage,
    refreshPages,
    canGoNext,
    canGoPrev,
  };
  
  return (
    <NotebookContext.Provider value={value}>
      {children}
    </NotebookContext.Provider>
  );
}

/**
 * Hook to access NotebookContext
 */
export function useNotebook() {
  const context = useContext(NotebookContext);
  if (!context) {
    throw new Error('useNotebook must be used within NotebookProvider');
  }
  return context;
}

