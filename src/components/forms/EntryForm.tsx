import { useState, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { LedgerEntry } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { calculateGST, GST_RATES, GSTRate } from '@/lib/gst';
import { toast } from 'sonner';
import { Calendar, FileText, DollarSign, Percent, User, Hash, Tag, PenTool } from 'lucide-react';
import { getLedgerDataSource } from '@/services/ledger.datasource';
import { InlinePenInput, type InlineTargetField } from './InlinePenInput';

interface EntryFormProps {
  entry?: LedgerEntry; // Optional entry for edit mode
  onSuccess: () => void;
  onCancel: () => void;
}

export function EntryForm({ entry, onSuccess, onCancel }: EntryFormProps) {
  const isEditMode = !!entry;

  // Smart date default: Remember last transaction date or use today
  const getSmartDate = (): string => {
    if (entry?.date) return entry.date;
    const lastDate = localStorage.getItem('digbahi_last_transaction_date');
    if (lastDate) {
      const last = new Date(lastDate);
      const today = new Date();
      const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      // If last transaction was today or yesterday, use it
      if (diffDays <= 1) return lastDate;
    }
    return new Date().toISOString().split('T')[0]; // Default to today
  };

  const [date, setDate] = useState(() => getSmartDate());
  const [description, setDescription] = useState(entry?.description || '');
  const [partyName, setPartyName] = useState(entry?.party_name || '');
  const [referenceNo, setReferenceNo] = useState(entry?.reference_no || '');
  const [tags, setTags] = useState(entry?.tags || '');
  const [amount, setAmount] = useState(entry?.amount.toString() || '');
  const [type, setType] = useState<LedgerEntry['type']>(entry?.type || 'sale');
  // Smart default: Remember last GST rate from localStorage
  const getLastGstRate = (): GSTRate => {
    if (entry?.gstRate) return entry.gstRate as GSTRate;
    const lastRate = localStorage.getItem('digbahi_last_gst_rate');
    return lastRate ? (parseInt(lastRate) as GSTRate) : 18;
  };

  const [gstRate, setGstRate] = useState<GSTRate>(getLastGstRate());
  const [loading, setLoading] = useState(false);
  const [inlinePenTarget, setInlinePenTarget] = useState<InlineTargetField | null>(null);
  const [partySuggestions, setPartySuggestions] = useState<string[]>([]);
  const [showPartySuggestions, setShowPartySuggestions] = useState(false);

  // Refs for input fields (for inline pen input positioning)
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const partyNameInputRef = useRef<HTMLInputElement>(null);
  const referenceNoInputRef = useRef<HTMLInputElement>(null);

  // Save GST rate to localStorage when changed
  useEffect(() => {
    if (!entry) { // Only save for new entries, not edits
      localStorage.setItem('digbahi_last_gst_rate', gstRate.toString());
    }
  }, [gstRate, entry]);

  // Save transaction date to localStorage when changed (for smart defaults)
  useEffect(() => {
    if (!entry && date) {
      localStorage.setItem('digbahi_last_transaction_date', date);
    }
  }, [date, entry]);

  // Listen for quick pen entry event (for inline pen input)
  useEffect(() => {
    const handleQuickPenEntry = (e: Event) => {
      const custom = e as CustomEvent<{ targetField?: InlineTargetField }>;
      if (custom.detail?.targetField) {
        setInlinePenTarget(custom.detail.targetField);
      }
    };
  }, []);

  // Load party name suggestions from previous entries
  useEffect(() => {
    const loadPartySuggestions = async () => {
      try {
        const datasource = getLedgerDataSource();
        const result = await datasource.list({ limit: 1000 });
        const parties = [...new Set(
          result.items
            .map(e => e.party_name)
            .filter(Boolean)
            .map(p => p!.trim())
        )].sort();
        setPartySuggestions(parties);
      } catch (error) {
        // Silently fail - autocomplete is optional
        console.warn('Failed to load party suggestions:', error);
      }
    };
    loadPartySuggestions();
  }, []);

  // Filter suggestions based on input
  const filteredSuggestions = partyName
    ? partySuggestions.filter(p =>
      p.toLowerCase().includes(partyName.toLowerCase())
    ).slice(0, 5)
    : partySuggestions.slice(0, 5);

  // Update form when entry prop changes
  useEffect(() => {
    if (entry) {
      setDate(entry.date);
      setDescription(entry.description || '');
      setPartyName(entry.party_name || '');
      setReferenceNo(entry.reference_no || '');
      setTags(entry.tags || '');
      setAmount(entry.amount.toString());
      setType(entry.type);
      setGstRate((entry.gstRate as GSTRate) || 18);
    }
  }, [entry]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);

    try {
      const user = getCurrentUser();
      if (!user || !user.id) {
        toast.error('User not authenticated');
        return;
      }

      const baseAmount = parseFloat(amount);
      if (isNaN(baseAmount) || baseAmount <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }

      const gstCalc = calculateGST(baseAmount, gstRate);

      const datasource = getLedgerDataSource();

      if (isEditMode && entry?.id) {
        // Update existing entry
        const updateData: Partial<LedgerEntry> = {
          date,
          description,
          amount: baseAmount,
          type,
          gstRate,
          gstAmount: gstCalc.gstAmount,
          party_name: partyName.trim(),
          reference_no: referenceNo.trim(),
          tags: tags.trim(),
        };
        await datasource.update(entry.id, updateData);
        toast.success('Entry updated successfully!');
      } else {
        // Create new entry
        const newEntry: Omit<LedgerEntry, 'id' | 'created_at' | 'updated_at' | 'is_active'> = {
          date,
          description,
          amount: baseAmount,
          type,
          gstRate,
          gstAmount: gstCalc.gstAmount,
          created_by: user.id,
          party_name: partyName.trim(),
          reference_no: referenceNo.trim(),
          tags: tags.trim(),
        };
        await datasource.create(newEntry);
        // Save date for smart defaults
        localStorage.setItem('digbahi_last_transaction_date', date);
        toast.success('Entry added successfully!');
      }
      onSuccess();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(msg || `Failed to ${isEditMode ? 'update' : 'add'} entry`);
    } finally {
      setLoading(false);
    }
  };

  useHotkeys('ctrl+s, meta+s', (e) => {
    e.preventDefault();
    handleSubmit();
  }, { enableOnFormTags: true }, [amount, description, partyName, type, gstRate, date]);

  const previewGST = amount ? calculateGST(parseFloat(amount) || 0, gstRate) : null;

  // Handle inline pen input recognition
  const handleInlinePenRecognized = (field: InlineTargetField, value: string) => {
    console.log('[EntryForm Debug] handleInlinePenRecognized called');
    console.log('[EntryForm Debug] Field:', field);
    console.log('[EntryForm Debug] Value:', value);

    if (field === 'description') {
      console.log('[EntryForm Debug] Setting description to:', value);
      setDescription(value);
    } else if (field === 'party_name') {
      console.log('[EntryForm Debug] Setting partyName to:', value);
      setPartyName(value);
    } else if (field === 'reference_no') {
      console.log('[EntryForm Debug] Setting referenceNo to:', value);
      setReferenceNo(value);
    }
    console.log('[EntryForm Debug] Closing inline pen input');
    setInlinePenTarget(null);
  };

  return (
    <>
      {/* Inline Pen Input Overlays */}
      {inlinePenTarget === 'description' && (
        <InlinePenInput
          targetField="description"
          value={description}
          onRecognized={(value) => handleInlinePenRecognized('description', value)}
          onClose={() => setInlinePenTarget(null)}
          inputRef={descriptionInputRef}
          isFullWidth={true}
        />
      )}
      {inlinePenTarget === 'party_name' && (
        <InlinePenInput
          targetField="party_name"
          value={partyName}
          onRecognized={(value) => handleInlinePenRecognized('party_name', value)}
          onClose={() => setInlinePenTarget(null)}
          inputRef={partyNameInputRef}
          isFullWidth={false}
        />
      )}
      {inlinePenTarget === 'reference_no' && (
        <InlinePenInput
          targetField="reference_no"
          value={referenceNo}
          onRecognized={(value) => handleInlinePenRecognized('reference_no', value)}
          onClose={() => setInlinePenTarget(null)}
          inputRef={referenceNoInputRef}
          isFullWidth={false}
        />
      )}

      <Card className="p-6 shadow-strong gradient-card animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] bg-clip-text text-transparent">
            {isEditMode ? 'Edit Entry' : 'Add New Entry'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date
              </Label>
              <div className="space-y-2">
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="touch-friendly"
                />
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDate(new Date().toISOString().split('T')[0])}
                    className="text-xs"
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      setDate(yesterday.toISOString().split('T')[0]);
                    }}
                    className="text-xs"
                  >
                    Yesterday
                  </Button>
                  {localStorage.getItem('digbahi_last_transaction_date') && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const lastDate = localStorage.getItem('digbahi_last_transaction_date');
                        if (lastDate) setDate(lastDate);
                      }}
                      className="text-xs"
                    >
                      Last Entry
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Transaction Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LedgerEntry['type'])}>
                <SelectTrigger className="touch-friendly">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Description
            </Label>
            <div className="relative">
              <Input
                ref={descriptionInputRef}
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter transaction details"
                required
                className="touch-friendly pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md hover:bg-accent text-muted-foreground"
                title="Write with pen"
                onClick={() => setInlinePenTarget('description')}
              >
                <PenTool className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="party_name" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Party Name
              </Label>
              <div className="relative">
                <Input
                  ref={partyNameInputRef}
                  id="party_name"
                  type="text"
                  value={partyName}
                  onChange={(e) => {
                    setPartyName(e.target.value);
                    setShowPartySuggestions(true);
                  }}
                  onFocus={() => setShowPartySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowPartySuggestions(false), 200)}
                  placeholder="Customer/Vendor name"
                  maxLength={100}
                  className="touch-friendly pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md hover:bg-accent text-muted-foreground"
                  title="Write with pen"
                  onClick={() => setInlinePenTarget('party_name')}
                >
                  <PenTool className="w-4 h-4" />
                </button>
                {showPartySuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
                    {filteredSuggestions.map((party, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm"
                        onClick={() => {
                          setPartyName(party);
                          setShowPartySuggestions(false);
                        }}
                      >
                        {party}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference_no" className="flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Reference No.
              </Label>
              <div className="relative">
                <Input
                  ref={referenceNoInputRef}
                  id="reference_no"
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Invoice/Receipt number"
                  maxLength={50}
                  className="touch-friendly pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md hover:bg-accent text-muted-foreground"
                  title="Write with pen"
                  onClick={() => setInlinePenTarget('reference_no')}
                >
                  <PenTool className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags" className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tags (comma-separated)
            </Label>
            <Input
              id="tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., urgent, payment-due, recurring"
              maxLength={200}
              className="touch-friendly"
            />
            <p className="text-xs text-muted-foreground">
              Separate multiple tags with commas
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Amount (₹)
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="touch-friendly"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gstRate" className="flex items-center gap-2">
                <Percent className="w-4 h-4" />
                GST Rate
              </Label>
              <Select value={gstRate.toString()} onValueChange={(v) => setGstRate(parseInt(v) as GSTRate)}>
                <SelectTrigger className="touch-friendly">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map(rate => (
                    <SelectItem key={rate} value={rate.toString()}>{rate}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {previewGST && (
            <Card className="p-4 bg-gradient-to-br from-[hsl(145_70%_32%_/_0.1)] to-[hsl(40_98%_48%_/_0.1)] border-primary/30 animate-fade-in shadow-glow">
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Amount:</span>
                  <span className="font-medium">₹{previewGST.baseAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST ({previewGST.gstRate}%):</span>
                  <span className="font-medium">₹{previewGST.gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-primary/20 pt-2 mt-2">
                  <span className="font-bold">Total Amount:</span>
                  <span className="font-bold text-primary animate-pulse-glow">₹{previewGST.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 gradient-hero touch-friendly hover-glow hover-scale"
              size="lg"
              title="Save (Ctrl+S)"
            >
              {loading ? 'Saving...' : isEditMode ? 'Update Entry' : 'Save Entry'}
            </Button>
            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="flex-1 touch-friendly hover-lift"
              size="lg"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
