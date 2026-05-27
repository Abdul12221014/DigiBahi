import { Badge }    from '@/components/ui/badge';
import { Card }     from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageCircle, Mail, Smartphone, Globe, FileText, AlertCircle } from 'lucide-react';
import { useDeliveryHistory }   from '../hooks/useDeliveryHistory';
import { ResendButton }         from './ResendButton';
import type { DeliveryChannel, DeliveryStatus, InvoiceDelivery } from '../types/delivery.types';

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<DeliveryStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  queued:    'secondary',
  sending:   'secondary',
  sent:      'default',
  delivered: 'default',
  read:      'default',
  failed:    'destructive',
  retrying:  'secondary',
  expired:   'outline',
  cancelled: 'outline',
};

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  queued:    'Queued',
  sending:   'Sending…',
  sent:      'Sent',
  delivered: 'Delivered',
  read:      'Read',
  failed:    'Failed',
  retrying:  'Retrying',
  expired:   'Expired',
  cancelled: 'Cancelled',
};

const CHANNEL_ICON: Record<DeliveryChannel, React.ReactNode> = {
  whatsapp_api:   <MessageCircle className="w-4 h-4 text-green-600" />,
  whatsapp_wame:  <MessageCircle className="w-4 h-4 text-green-400" />,
  whatsapp_share: <MessageCircle className="w-4 h-4 text-green-300" />,
  email:          <Mail className="w-4 h-4 text-blue-500" />,
  sms:            <Smartphone className="w-4 h-4 text-purple-500" />,
  portal:         <Globe className="w-4 h-4 text-orange-500" />,
  einvoice:       <FileText className="w-4 h-4 text-red-500" />,
};

const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  whatsapp_api:   'WhatsApp API',
  whatsapp_wame:  'WhatsApp Link',
  whatsapp_share: 'WhatsApp Share',
  email:          'Email',
  sms:            'SMS',
  portal:         'Portal',
  einvoice:       'e-Invoice',
};

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function DeliveryRow({
  delivery, onResend, isResending,
}: {
  delivery:    InvoiceDelivery;
  onResend:    (id: number) => Promise<void>;
  isResending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-shrink-0">{CHANNEL_ICON[delivery.channel]}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{delivery.invoiceNumber}</span>
          <span className="text-xs text-muted-foreground truncate">{delivery.customerName}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span>{CHANNEL_LABEL[delivery.channel]}</span>
          <span>{fmt(delivery.sentAt ?? delivery.createdAt)}</span>
          {delivery.retryCount > 0 && (
            <span className="text-amber-600">{delivery.retryCount} retr{delivery.retryCount === 1 ? 'y' : 'ies'}</span>
          )}
          {delivery.failureReason && (
            <span className="text-destructive truncate max-w-[160px]" title={delivery.failureReason}>
              {delivery.failureReason}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant={STATUS_VARIANT[delivery.status]} className="text-xs">
          {STATUS_LABEL[delivery.status]}
        </Badge>
        <ResendButton delivery={delivery} onResend={onResend} isResending={isResending} />
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface DeliveryHistoryPanelProps {
  invoiceNumber?: string;
  limit?:         number;
  className?:     string;
}

export function DeliveryHistoryPanel({ invoiceNumber, limit, className }: DeliveryHistoryPanelProps) {
  const {
    deliveries, isLoading, error, resendingIds,
    resendError, resend, clearResendError,
  } = useDeliveryHistory({ invoiceNumber, limit });

  return (
    <Card className={`p-4 ${className ?? ''}`}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Delivery History
      </h3>

      {resendError && (
        <Alert variant="destructive" className="mb-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{resendError.message}</span>
            <button onClick={clearResendError} className="ml-2 text-xs underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      )}

      {!isLoading && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!isLoading && !error && deliveries.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No deliveries recorded yet.</p>
      )}

      {!isLoading && !error && deliveries.length > 0 && deliveries.map(d => (
        <DeliveryRow
          key={d.id ?? d.idempotencyKey}
          delivery={d}
          onResend={resend}
          isResending={resendingIds.has(d.id ?? -1)}
        />
      ))}
    </Card>
  );
}
