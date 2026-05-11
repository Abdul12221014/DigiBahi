import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotebookPage, listPages, listSections, NotebookSection } from '@/lib/localStore';
import { getTemplateThumbnail } from '../templates';
import type { TemplateId } from '../types/template.types';
import { FileText, Grid3x3 } from 'lucide-react';

interface NotebookGridProps {
  currentPageId?: string;
  onSelectPage: (page: NotebookPage) => void;
  onClose?: () => void;
}

/**
 * NotebookGrid Component
 * 
 * Displays a paginated thumbnail grid view of all notebook pages.
 * Shows template background and page metadata.
 * Clicking a thumbnail navigates to that page.
 */
export const NotebookGrid: React.FC<NotebookGridProps> = ({
  currentPageId,
  onSelectPage,
  onClose,
}) => {
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [sections, setSections] = useState<NotebookSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnailCache] = useState<Map<string, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pagesData, sectionsData] = await Promise.all([
        listPages(),
        listSections(),
      ]);
      setPages(pagesData);
      setSections(sectionsData);
    } catch (error) {
      console.error('[NotebookGrid] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSectionById = (sectionId?: string): NotebookSection | undefined => {
    if (!sectionId) return undefined;
    return sections.find(s => s.id === sectionId);
  };

  const getPageThumbnail = (page: NotebookPage): HTMLCanvasElement => {
    // Check cache first
    const cacheKey = `${page.id}_${page.templateId}`;
    if (thumbnailCache.has(cacheKey)) {
      return thumbnailCache.get(cacheKey)!;
    }

    // Generate thumbnail (template background only for now)
    const thumbnail = getTemplateThumbnail(page.templateId as TemplateId, 160, 220);
    
    // TODO: In future, overlay stroke snapshot on top of template
    // This would require rendering strokes to a small canvas and compositing
    
    thumbnailCache.set(cacheKey, thumbnail);
    return thumbnail;
  };

  const handlePageClick = (page: NotebookPage) => {
    onSelectPage(page);
    onClose?.();
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-muted-foreground">Loading pages...</p>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
          <Grid3x3 className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-2">No pages yet</p>
          <p className="text-xs text-muted-foreground">
            Create your first page to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[600px]">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold mb-1">All Pages</h3>
        <p className="text-sm text-muted-foreground">
          {pages.length} page{pages.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {pages.map(page => {
            const isCurrentPage = page.id === currentPageId;
            const section = getSectionById(page.sectionId);
            const thumbnail = getPageThumbnail(page);

            return (
              <Card
                key={page.id}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  isCurrentPage ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handlePageClick(page)}
              >
                <CardContent className="p-2">
                  {/* Thumbnail */}
                  <div className="relative mb-2 aspect-[11/14] bg-muted rounded overflow-hidden">
                    <canvas
                      ref={node => {
                        if (node && thumbnail) {
                          const ctx = node.getContext('2d');
                          if (ctx) {
                            node.width = thumbnail.width;
                            node.height = thumbnail.height;
                            ctx.drawImage(thumbnail, 0, 0);
                          }
                        }
                      }}
                      className="w-full h-full object-contain"
                    />
                    
                    {/* Page number badge */}
                    <div className="absolute top-1 left-1 bg-background/90 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-medium">
                      {page.pageNumber}
                    </div>

                    {/* Section indicator */}
                    {section && (
                      <div
                        className="absolute top-1 right-1 w-3 h-3 rounded-full border-2 border-background"
                        style={{ backgroundColor: section.color }}
                        title={section.name}
                      />
                    )}

                    {/* Current page indicator */}
                    {isCurrentPage && (
                      <div className="absolute bottom-1 left-1 right-1 bg-primary text-primary-foreground text-[10px] text-center py-0.5 rounded">
                        Current
                      </div>
                    )}
                  </div>

                  {/* Page info */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium truncate" title={page.title}>
                      {page.title || `Page ${page.pageNumber}`}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <FileText className="w-3 h-3" />
                      <span className="capitalize">{page.templateId}</span>
                      {section && (
                        <>
                          <span>•</span>
                          <span className="truncate">{section.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      {onClose && (
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
};

export default NotebookGrid;

