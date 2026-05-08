/**
 * FilterBar Component
 * Provides search, type filter, date range, tags filter, and reset button
 */

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X, Calendar, Hash } from 'lucide-react';
import { Label } from '@/components/ui/label';

export interface FilterState {
  search: string;
  type: string | undefined;
  from: string;
  to: string;
  tags: string;
}

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onReset: () => void;
}

/**
 * Debounce hook for search input
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function FilterBar({ filters, onFiltersChange, onReset }: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debouncedSearch = useDebounce(localSearch, 300);

  // Update parent when debounced search changes
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFiltersChange({ ...filters, search: debouncedSearch });
    }
  }, [debouncedSearch, filters, onFiltersChange]);

  // Sync local search with props
  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const hasActiveFilters = 
    filters.search || 
    filters.type || 
    filters.from || 
    filters.to || 
    filters.tags;

  const handleFilterChange = (key: keyof FilterState, value: string | undefined) => {
    onFiltersChange({ ...filters, [key]: value || '' });
  };

  return (
    <div className="space-y-4 p-4 bg-card border rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Filters</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search" className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="search"
              type="text"
              placeholder="Search description, party, reference, tags..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-10 touch-friendly"
            />
          </div>
        </div>

        {/* Type Filter */}
        <div className="space-y-2">
          <Label htmlFor="type" className="text-xs">Type</Label>
          <Select
            value={filters.type || 'all'}
            onValueChange={(value) => handleFilterChange('type', value === 'all' ? undefined : value)}
          >
            <SelectTrigger className="touch-friendly">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="receipt">Receipt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date From */}
        <div className="space-y-2">
          <Label htmlFor="from" className="text-xs flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            From Date
          </Label>
          <Input
            id="from"
            type="date"
            value={filters.from}
            onChange={(e) => handleFilterChange('from', e.target.value)}
            className="touch-friendly"
          />
        </div>

        {/* Date To */}
        <div className="space-y-2">
          <Label htmlFor="to" className="text-xs flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            To Date
          </Label>
          <Input
            id="to"
            type="date"
            value={filters.to}
            onChange={(e) => handleFilterChange('to', e.target.value)}
            className="touch-friendly"
          />
        </div>

        {/* Tags Filter */}
        <div className="space-y-2">
          <Label htmlFor="tags" className="text-xs flex items-center gap-1">
            <Hash className="w-3 h-3" />
            Tags (comma-separated)
          </Label>
          <Input
            id="tags"
            type="text"
            placeholder="e.g., urgent, payment-due"
            value={filters.tags}
            onChange={(e) => handleFilterChange('tags', e.target.value)}
            className="touch-friendly"
          />
        </div>
      </div>
    </div>
  );
}

