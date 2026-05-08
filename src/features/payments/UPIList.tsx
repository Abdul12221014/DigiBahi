import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  ExternalLink, 
  Copy, 
  RefreshCw, 
  Filter,
  Search,
  Calendar,
  CreditCard
} from 'lucide-react';
import { 
  listUPIIntents, 
  updateUPIIntentStatus,
  getUPIIntent 
} from '@/lib/db';
import { 
  generateUPIIntentLink, 
  formatAmount, 
  formatUPIIdForDisplay 
} from './services/upi.service';
import { addEntry } from '@/services/ledger.service';
import { 
  enqueueReconcileRequest 
} from './services/upi.service';
import type { UPIIntent, UPIStatus } from './types/upi.types';

interface UPIListProps {
  onRefresh?: () => void;
}

export function UPIList({ onRefresh }: UPIListProps) {
  const [intents, setIntents] = useState<UPIIntent[]>([]);
  const [filteredIntents, setFilteredIntents] = useState<UPIIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UPIStatus | 'all'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadIntents();
  }, []);

  useEffect(() => {
    filterIntents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intents, searchTerm, statusFilter]);

  const loadIntents = async () => {
    try {
      setLoading(true);
      const allIntents = await listUPIIntents();
      setIntents(allIntents);
    } catch (error) {
      console.error('Failed to load UPI intents:', error);
      toast.error('Failed to load UPI payments');
    } finally {
      setLoading(false);
    }
  };

  const filterIntents = () => {
    let filtered = intents;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(intent => intent.status === statusFilter);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(intent => 
        intent.upiId.toLowerCase().includes(term) ||
        intent.txnRef.toLowerCase().includes(term) ||
        (intent.note && intent.note.toLowerCase().includes(term)) ||
        (intent.payerName && intent.payerName.toLowerCase().includes(term))
      );
    }

    setFilteredIntents(filtered);
  };

  const handleOpenLink = async (intent: UPIIntent) => {
    const linkData = generateUPIIntentLink(intent);
    window.location.href = linkData.link;
    
    // Update status to initiated
    await updateUPIIntentStatus(intent.id, 'initiated');
    await loadIntents();
    onRefresh?.();
  };

  const handleCopyLink = async (intent: UPIIntent) => {
    const linkData = generateUPIIntentLink(intent);
    await navigator.clipboard.writeText(linkData.link);
    toast.success('UPI link copied to clipboard!');
  };

  const handleMarkAsPaid = async (intent: UPIIntent) => {
    if (processingId === intent.id) return;

    setProcessingId(intent.id);

    try {
      // Update UPI intent status
      await updateUPIIntentStatus(intent.id, 'reconciled');

      // Create ledger entry
      await addEntry({
        date: new Date().toISOString().split('T')[0],
        description: `UPI Payment from ${formatUPIIdForDisplay(intent.upiId)}${intent.note ? ` - ${intent.note}` : ''}`,
        amount: intent.amount,
        type: 'receipt'
      });

      // Enqueue for backend sync
      await enqueueReconcileRequest(intent);

      await loadIntents();
      onRefresh?.();
      
      toast.success(`Payment recorded: ${formatAmount(intent.amount)}`);
    } catch (error) {
      console.error('Failed to mark as paid:', error);
      toast.error('Failed to record payment');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadgeVariant = (status: UPIStatus) => {
    switch (status) {
      case 'reconciled':
        return 'default';
      case 'initiated':
        return 'secondary';
      case 'pending':
        return 'outline';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusColor = (status: UPIStatus) => {
    switch (status) {
      case 'reconciled':
        return 'text-green-600';
      case 'initiated':
        return 'text-blue-600';
      case 'pending':
        return 'text-yellow-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading UPI payments...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">UPI Payment History</h3>
            <Badge variant="outline">{filteredIntents.length} payments</Badge>
          </div>
          <Button
            onClick={loadIntents}
            variant="outline"
            size="sm"
            className="touch-friendly"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by UPI ID, reference, or note..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 touch-friendly"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as UPIStatus | 'all')}>
            <SelectTrigger className="w-full sm:w-48 touch-friendly">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="initiated">Initiated</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reconciled">Reconciled</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {filteredIntents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No UPI payments found</p>
            <p className="text-sm">Create your first UPI payment above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>UPI ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIntents.map((intent) => (
                  <TableRow key={intent.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {new Date(intent.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{formatUPIIdForDisplay(intent.upiId)}</div>
                        {intent.payerName && (
                          <div className="text-sm text-muted-foreground">{intent.payerName}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{formatAmount(intent.amount)}</div>
                      {intent.note && (
                        <div className="text-sm text-muted-foreground">{intent.note}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(intent.status)}>
                        {intent.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">
                        {intent.txnRef.slice(-8)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {intent.status === 'draft' && (
                          <>
                            <Button
                              onClick={() => handleOpenLink(intent)}
                              size="sm"
                              variant="outline"
                              className="touch-friendly"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                            <Button
                              onClick={() => handleCopyLink(intent)}
                              size="sm"
                              variant="outline"
                              className="touch-friendly"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {(intent.status === 'initiated' || intent.status === 'pending') && (
                          <Button
                            onClick={() => handleMarkAsPaid(intent)}
                            size="sm"
                            disabled={processingId === intent.id}
                            className="touch-friendly"
                          >
                            {processingId === intent.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              'Mark Paid'
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}
