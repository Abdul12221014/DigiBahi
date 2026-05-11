/**
 * NotebookNav - Navigation component for multi-page notebook
 * 
 * Provides Previous/Next buttons, page counter, and page creation.
 * Integrates with NotebookContext for page management.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  BookOpen,
  Grid3x3,
  Trash2,
  FileText,
  Tags,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNotebook } from '../context/NotebookContext';
import { cn } from '@/lib/utils';
import { TemplatePicker } from './templates/TemplatePicker';
import { SectionManager } from './sections/SectionManager';
import { NotebookGrid } from './NotebookGrid';
import { NotebookPage, NotebookSection, listSections, savePage } from '@/lib/localStore';
import { TemplateId } from '../types/template.types';

interface NotebookNavProps {
  className?: string;
  showCreateButton?: boolean;
  showDeleteButton?: boolean;
  compact?: boolean;
}

export function NotebookNav({ 
  className, 
  showCreateButton = true,
  showDeleteButton = false,
  compact = false 
}: NotebookNavProps) {
  const {
    currentPage,
    currentPageIndex,
    totalPages,
    canGoNext,
    canGoPrev,
    nextPage,
    prevPage,
    goToPageNumber,
    createPage,
    deletePage,
    loading,
    reloadCurrentPage,
  } = useNotebook();
  
  const [jumpToPage, setJumpToPage] = useState('');
  const [showJumpInput, setShowJumpInput] = useState(false);
  
  // Template picker state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  
  // Section manager state
  const [showSectionManager, setShowSectionManager] = useState(false);
  const [sections, setSections] = useState<NotebookSection[]>([]);
  
  // Grid view state
  const [showGrid, setShowGrid] = useState(false);
  
  // Load sections
  useEffect(() => {
    loadSectionsData();
  }, []);
  
  const loadSectionsData = async () => {
    try {
      const data = await listSections();
      setSections(data);
    } catch (error) {
      console.error('[NotebookNav] Error loading sections:', error);
    }
  };
  
  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      goToPageNumber(pageNum);
      setJumpToPage('');
      setShowJumpInput(false);
    }
  };
  
  const handleCreatePage = async () => {
    await createPage();
  };
  
  const handleDeleteCurrentPage = async () => {
    if (currentPage) {
      const confirmed = window.confirm(
        `Are you sure you want to delete Page ${currentPage.pageNumber}? This action cannot be undone.`
      );
      if (confirmed) {
        await deletePage(currentPage.id);
      }
    }
  };
  
  const handleTemplateSelect = async (templateId: TemplateId) => {
    if (!currentPage) return;
    
    try {
      // Update current page's template
      const updatedPage = {
        ...currentPage,
        templateId,
        updatedAt: Date.now(),
      };
      
      await savePage(updatedPage);
      await reloadCurrentPage();
      setShowTemplatePicker(false);
    } catch (error) {
      console.error('[NotebookNav] Error updating template:', error);
    }
  };
  
  const handleSectionChange = async (sectionId: string) => {
    if (!currentPage) return;
    
    try {
      // Update current page's section
      const updatedPage = {
        ...currentPage,
        sectionId: sectionId === 'none' ? undefined : sectionId,
        updatedAt: Date.now(),
      };
      
      await savePage(updatedPage);
      await reloadCurrentPage();
    } catch (error) {
      console.error('[NotebookNav] Error updating section:', error);
    }
  };
  
  const handleSectionManagerClose = () => {
    setShowSectionManager(false);
    loadSectionsData(); // Reload sections after manager closes
  };
  
  const handlePageSelectFromGrid = async (page: NotebookPage) => {
    goToPageNumber(page.pageNumber);
    setShowGrid(false);
  };
  
  if (loading) {
    return (
      <div className={cn('flex items-center justify-center gap-2 p-2', className)}>
        <span className="text-sm text-muted-foreground">Loading notebook...</span>
      </div>
    );
  }
  
  if (compact) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={prevPage}
          disabled={!canGoPrev}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <Badge variant="secondary" className="px-2 py-1 text-xs">
          {currentPage?.pageNumber || 1}/{totalPages}
        </Badge>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={nextPage}
          disabled={!canGoNext}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  
  return (
    <div className={cn('flex items-center justify-between gap-4 p-3 bg-card border-b', className)}>
      {/* Left: Book info */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-primary" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {currentPage?.title || `Page ${currentPage?.pageNumber || 1}`}
          </span>
          <span className="text-xs text-muted-foreground">
            {currentPage?.tags && currentPage.tags.length > 0 
              ? currentPage.tags.join(', ')
              : 'Digital Ledger Book'
            }
          </span>
        </div>
      </div>
      
      {/* Center: Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={prevPage}
          disabled={!canGoPrev}
          className="h-9 px-3"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
          {showJumpInput ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={jumpToPage}
                onChange={(e) => setJumpToPage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJumpToPage()}
                placeholder="Page #"
                className="h-7 w-16 text-sm"
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleJumpToPage}
                className="h-7 px-2"
              >
                Go
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowJumpInput(false);
                  setJumpToPage('');
                }}
                className="h-7 px-2"
              >
                ✕
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowJumpInput(true)}
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Page {currentPage?.pageNumber || 1} of {totalPages}
            </button>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={nextPage}
          disabled={!canGoNext}
          className="h-9 px-3"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      
      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Template Picker */}
        <Popover open={showTemplatePicker} onOpenChange={setShowTemplatePicker}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              title="Change template"
            >
              <FileText className="h-4 w-4 mr-1" />
              <span className="capitalize">{currentPage?.templateId || 'lined'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <TemplatePicker
              currentTemplateId={(currentPage?.templateId || 'lined') as TemplateId}
              onSelect={handleTemplateSelect}
              onClose={() => setShowTemplatePicker(false)}
            />
          </PopoverContent>
        </Popover>
        
        {/* Section Selector */}
        <div className="flex items-center gap-1">
          <Select
            value={currentPage?.sectionId || 'none'}
            onValueChange={handleSectionChange}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="No section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No section</SelectItem>
              {sections.map(section => (
                <SelectItem key={section.id} value={section.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: section.color }}
                    />
                    {section.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            title="Manage sections"
            onClick={() => setShowSectionManager(true)}
          >
            <Tags className="h-4 w-4" />
          </Button>
        </div>
        
        {showDeleteButton && totalPages > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteCurrentPage}
            className="h-9 px-3 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        )}
        
        {showCreateButton && (
          <Button
            variant="default"
            size="sm"
            onClick={handleCreatePage}
            className="h-9 px-3"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Page
          </Button>
        )}
        
        {/* Grid view button */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0"
          title="Grid view"
          onClick={() => setShowGrid(true)}
        >
          <Grid3x3 className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Dialogs */}
      <Dialog open={showSectionManager} onOpenChange={setShowSectionManager}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Section Manager</DialogTitle>
          </DialogHeader>
          <SectionManager onClose={handleSectionManagerClose} />
        </DialogContent>
      </Dialog>
      
      <Dialog open={showGrid} onOpenChange={setShowGrid}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>All Pages</DialogTitle>
          </DialogHeader>
          <NotebookGrid
            currentPageId={currentPage?.id}
            onSelectPage={handlePageSelectFromGrid}
            onClose={() => setShowGrid(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default NotebookNav;

