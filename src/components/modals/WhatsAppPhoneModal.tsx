import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface WhatsAppPhoneModalProps {
  open: boolean;
  partyName: string;
  onClose: () => void;
  onSubmit: (phone: string, saveForFuture: boolean) => void;
}

export function WhatsAppPhoneModal({ open, partyName, onClose, onSubmit }: WhatsAppPhoneModalProps) {
  const [phone, setPhone] = useState('');
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Phone validation
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit number');
      return;
    }

    onSubmit(cleanPhone, saveForFuture);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md animate-scale-in border border-primary/20 bg-background/95 backdrop-blur-md shadow-strong">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
            WhatsApp Contact Needed
          </DialogTitle>
          <DialogDescription>
            We don't have a saved number for <b>{partyName}</b>.
            Please enter their 10-digit WhatsApp number to share the bill.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp-phone">Phone Number</Label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-muted-foreground select-none">+91</span>
              <Input
                id="whatsapp-phone"
                type="tel"
                placeholder="98765 43210"
                className={`pl-10 text-lg ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError('');
                }}
                maxLength={10}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive font-medium">{error}</p>}
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input 
              type="checkbox" 
              id="save-future" 
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
              checked={saveForFuture}
              onChange={(e) => setSaveForFuture(e.target.checked)}
            />
            <Label htmlFor="save-future" className="cursor-pointer font-medium text-sm">
              Save number for future bills
            </Label>
          </div>

          <DialogFooter className="sm:justify-end gap-2 pt-4 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="hover-lift"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#25D366] hover:bg-[#1DA851] text-white hover-lift hover-shadow hover-glow border-none"
            >
              Share Bill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
