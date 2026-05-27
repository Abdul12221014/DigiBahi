import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Clock } from 'lucide-react';
import { checkResend } from '../services/delivery.service';
import type { InvoiceDelivery } from '../types/delivery.types';

interface ResendButtonProps {
  delivery:     InvoiceDelivery;
  onResend:     (id: number) => Promise<void>;
  isResending?: boolean;
}

export function ResendButton({ delivery, onResend, isResending }: ResendButtonProps) {
  const check = checkResend(delivery);

  if (!check.allowed && check.reason === 'invalid_status') return null;

  if (!check.allowed && check.reason === 'cooldown') {
    const mins = Math.ceil((check.cooldownSecondsRemaining ?? 0) / 60);
    return (
      <Button variant="ghost" size="sm" disabled className="h-8 px-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 mr-1" />
        {mins}m cooldown
      </Button>
    );
  }

  if (!check.allowed) {
    return (
      <Button variant="ghost" size="sm" disabled className="h-8 px-2 text-xs">
        <RefreshCw className="w-3 h-3 mr-1" />
        Resend
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isResending}
          className="h-8 px-2 text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${isResending ? 'animate-spin' : ''}`} />
          Resend
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resend delivery?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send the invoice for <strong>{delivery.invoiceNumber}</strong> to{' '}
            <strong>{delivery.customerName}</strong> again via{' '}
            {delivery.channel === 'whatsapp_api' ? 'WhatsApp' : delivery.channel}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (delivery.id != null) onResend(delivery.id); }}>
            Resend
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
