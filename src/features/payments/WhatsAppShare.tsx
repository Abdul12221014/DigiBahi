import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MessageCircle, User, Calendar, FileText, DollarSign, Percent, Hash, CreditCard, Wallet, Download, Copy, Check } from 'lucide-react';
import { calculateGST, GST_RATES, formatCurrency, formatDate, type GSTRate } from '@/lib/gst';
import { getCompanySettings, searchCustomerContacts, saveCustomerContact, getCustomerContactByPhone, createCreditEntry } from '@/lib/db';
import { getNextInvoiceNumber, previewNextInvoiceNumber } from './services/invoice.service';
import { getLedgerDataSource } from '@/services/ledger.datasource';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { whatsappAPIService } from './services/whatsapp-api.service';
import { useOTPTimer } from '@/hooks/useOTPTimer';
import { getDefaultCountry, buildWaUrl, formatPhoneDisplay } from '@/lib/countryCode';
import { analytics } from '@/lib/analytics';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveInvoicePreview } from './components/LiveInvoicePreview';
import { useDebounce } from '@/hooks/useDebounce';
import { shareWithFallback } from '@/lib/shareRetry';

import { generateInvoicePDF, type InvoiceData } from '@/lib/invoiceGenerator';

export function WhatsAppShare() {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState<GSTRate>(18);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<{name: string, phone: string}[]>([]);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'generating' | 'wa_me'>('idle');
  const [companySettings, setCompanySettings] = useState<{ businessName: string; address?: string; gstin?: string; phone?: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [otp, setOtp] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [generatedOTP, setGeneratedOTP] = useState<string>('');
  const [otpSent, setOtpSent] = useState(false);
  const [showOTPInUI, setShowOTPInUI] = useState(false);
  const [otpCopied, setOtpCopied] = useState(false);
  const [localOtpAttempts, setLocalOtpAttempts] = useState(0);
  const LOCAL_OTP_MAX_ATTEMPTS = 5;

  const otpTimer = useOTPTimer(60);
  const country = getDefaultCountry();

  // Handle OTP Expiry
  useEffect(() => {
    if (otpTimer.isExpired && showOTP) {
      setOtp('');
      setOtpVerified(false);
      setShowOTP(false);
      toast.error('OTP expired. Please request a new one.');
      analytics.track('otp_expired', { phone: customerPhone });
    }
  }, [otpTimer.isExpired, showOTP, customerPhone]);

  // Load company settings and show a local preview of the next invoice number on mount.
  // The real number is reserved from the server atomically at share time.
  useEffect(() => {
    loadCompanySettings();
    setInvoiceNumber(previewNextInvoiceNumber());
    
    // Remember last GST rate
    const lastGstRate = localStorage.getItem('digbahi_last_gst_rate');
    if (lastGstRate) {
      const rate = parseInt(lastGstRate, 10) as GSTRate;
      if (GST_RATES.includes(rate)) {
        setGstRate(rate);
      }
    }
  }, []);

  const debouncedCustomerName = useDebounce(customerName, 300);

  // Load customer suggestions dynamically via Dexie based on debounce
  useEffect(() => {
    async function loadCustomerSuggestions() {
      try {
        const contacts = await searchCustomerContacts(debouncedCustomerName, 10);
        const uniqueContacts = Array.from(
          new Map(contacts.map(c => [c.name.toLowerCase(), { name: c.name, phone: c.phone || '' }])).values()
        );
        setCustomerSuggestions(uniqueContacts);
      } catch (error) {
        console.error('Failed to load customer suggestions:', error);
      }
    }
    loadCustomerSuggestions();
  }, [debouncedCustomerName]);

  // Phone formatter effect
  useEffect(() => {
    if (customerPhone) {
      const clean = customerPhone.replace(/\D/g, '');
      if (clean !== customerPhone) {
        setCustomerPhone(clean);
      }
    }
  }, [customerPhone]);

  async function loadCompanySettings() {
    try {
      const settings = await getCompanySettings();
      if (settings) {
        setCompanySettings({
          businessName: settings.businessName,
          address: settings.address,
          gstin: settings.gstin,
          phone: settings.phone,
        });
      }
    } catch (error) {
      console.error('Failed to load company settings:', error);
    }
  }



  function handleCustomerPhoneChange(phone: string) {
    const cleaned = phone.replace(/\D/g, '').slice(0, 10);
    const oldPhone = customerPhone;
    setCustomerPhone(cleaned);
    
    // If phone number changed and OTP was generated, clear OTP state
    if (oldPhone && oldPhone !== cleaned && showOTP) {
      // Clear old OTP from sessionStorage
      sessionStorage.removeItem(`otp_${oldPhone}`);
      // Reset OTP state
      setShowOTP(false);
      setOtpVerified(false);
      setOtp('');
      setGeneratedOTP('');
      setOtpSent(false);
    }
    
    // Auto-fill customer name if contact exists
    if (cleaned.length === 10) {
      getCustomerContactByPhone(cleaned).then(contact => {
        if (contact) {
          setCustomerName(contact.name);
        }
      });
    }
  }

  function handleSelectSuggestion(name: string) {
    setCustomerName(name);
    
    // Find and set phone number for this customer from our suggestions
    const contact = customerSuggestions.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (contact && contact.phone) {
      handleCustomerPhoneChange(contact.phone);
    }
  }

  // Generate cryptographically secure 6-digit OTP
  function generateOTP(): string {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (100000 + (buf[0] % 900000)).toString();
  }

  // OTP Functions
  async function handleRequestOTP() {
    if (!customerPhone || customerPhone.length !== 10) {
      toast.error('Please enter valid phone number first');
      return;
    }

    // Reset OTP state
    setShowOTP(true);
    setOtpVerified(false);
    setOtp('');
    setOtpSent(false);
    setShowOTPInUI(false);
    setOtpCopied(false);
    otpTimer.reset();

    analytics.track('otp_requested', { phone: customerPhone });

    // Try WhatsApp Business API first (backend integration)
    try {
      const result = await whatsappAPIService.sendOTP(customerPhone, 'digbahi_otp');
      
      if (result.success) {
        // OTP sent successfully via WhatsApp Business API
        setOtpSent(true);
        setShowOTPInUI(false);
        
        // Store OTP for verification (backend returns it in dev mode, but we'll use sessionStorage as backup)
        if (result.otp_code) {
          setGeneratedOTP(result.otp_code);
          sessionStorage.setItem(`otp_${customerPhone}`, JSON.stringify({
            otp: result.otp_code,
            expiresAt: result.expires_at || (Date.now() + 10 * 60 * 1000)
          }));
        }
        
        toast.success('OTP sent successfully via WhatsApp!', {
          description: 'Please check your WhatsApp messages.',
          duration: 5000,
        });
        otpTimer.start();
        return;
      } else {
        throw new Error(result.message || 'Failed to send OTP');
      }
    } catch (error: any) {
      // Check if it's a template error (user needs to create template)
      const errorMessage = error.message || '';
      const lowerMessage = errorMessage.toLowerCase();
      
      if (lowerMessage.includes('template') && (lowerMessage.includes('not found') || lowerMessage.includes('does not exist'))) {
        toast.error('WhatsApp Template Missing', {
          description: 'The "digbahi_otp" template needs to be created in WhatsApp Manager. Click here for instructions.',
          duration: 10000,
          action: {
            label: 'View Guide',
            onClick: () => window.open('https://business.facebook.com/wa/manage/message-templates/', '_blank')
          }
        });
      } else if (lowerMessage.includes('not in the allowed list') || lowerMessage.includes('phone number')) {
        toast.error('Phone Number Not Allowed', {
          description: 'This phone number needs to be added to the allowed list in Meta Developer Console.',
          duration: 8000,
        });
      } else if (errorMessage.includes('API_UNAVAILABLE') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
        console.log('WhatsApp API unavailable, using browser fallback:', error.message);
        toast.info('Backend API unavailable. Using browser method to send OTP.');
      } else if (errorMessage.includes('Invalid or expired access token')) {
        toast.error('WhatsApp API Token Invalid', {
          description: 'Please regenerate your access token in Meta Developer Console.',
          duration: 8000,
        });
      } else {
        console.log('WhatsApp API error, using browser fallback:', error.message);
        toast.warning('WhatsApp API Error', {
          description: `Using manual method. ${errorMessage.substring(0, 80)}...`,
          duration: 6000,
        });
      }
      
      // Generate OTP for fallback
      const newOTP = generateOTP();
      setGeneratedOTP(newOTP);
      
      // Try Web OTP API first (if available on supported devices)
      if ('OTPCredential' in window) {
        try {
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 5000);
          
          try {
            const otp = await navigator.credentials.get({
              otp: { 
                transport: ['sms'],
              },
              signal: abortController.signal
            } as any) as any;
            
            clearTimeout(timeoutId);
            
            if (otp && otp.code) {
              setOtp(otp.code);
              setOtpVerified(true);
              toast.success('OTP received automatically');
              sessionStorage.setItem(`otp_${customerPhone}`, JSON.stringify({
                otp: otp.code,
                expiresAt: Date.now() + 10 * 60 * 1000
              }));
              setGeneratedOTP(otp.code);
              setOtpSent(true);
              otpTimer.start();
              return;
            }
          } catch (getError: any) {
            clearTimeout(timeoutId);
            if (getError.name !== 'AbortError') {
              console.log('Web OTP error:', getError);
            }
          }
        } catch (error) {
          console.log('Web OTP not available, sending via WhatsApp');
        }
      }

      // Fallback: Send OTP via WhatsApp browser link (wa.me)
      try {
        const otpMessage = `Your OTP for DigitalMuneem invoice is: ${newOTP}\n\nThis OTP is valid for 10 minutes.\n\nPlease enter this OTP in the application to verify.`;
        const whatsappUrl = buildWaUrl(customerPhone, country.dialCode, otpMessage);
        
        const whatsappWindow = window.open(whatsappUrl, '_blank');
        
        if (!whatsappWindow || whatsappWindow.closed || typeof whatsappWindow.closed === 'undefined') {
          toast.warning('Popup blocked. OTP displayed below. You can copy and send manually.');
          setShowOTPInUI(true);
          setOtpSent(true);
        } else {
          setOtpSent(true);
          setShowOTPInUI(false);
          toast.info('WhatsApp opened! Please click SEND in WhatsApp to deliver the OTP message.', {
            duration: 5000,
          });
        }
      } catch (error) {
        console.error('Failed to open WhatsApp:', error);
        toast.warning('Could not open WhatsApp. OTP displayed below.');
        setShowOTPInUI(true);
        setOtpSent(true);
      }

      // Store OTP in sessionStorage for verification (expires in 10 minutes)
      sessionStorage.setItem(`otp_${customerPhone}`, JSON.stringify({
        otp: newOTP,
        expiresAt: Date.now() + 10 * 60 * 1000
      }));

      otpTimer.start();
      toast.info('Please enter the 6-digit OTP sent to your WhatsApp');
    }
  }

  async function handleVerifyOTP(otpValue: string = otp) {
    if (otpValue.length !== 6) {
      toast.error('Please enter 6-digit OTP');
      return;
    }

    // Guard client-side fallback brute force
    if (localOtpAttempts >= LOCAL_OTP_MAX_ATTEMPTS) {
      toast.error('Too many incorrect attempts. Please request a new OTP.');
      setShowOTP(false);
      setOtp('');
      setGeneratedOTP('');
      sessionStorage.removeItem(`otp_${customerPhone}`);
      return;
    }

    // Try backend API verification first
    try {
      const result = await whatsappAPIService.verifyOTP(customerPhone, otpValue);
      
      if (result.success) {
        setOtpVerified(true);
        otpTimer.reset();
        analytics.track('otp_verified', { method: 'backend' });
        toast.success('OTP verified successfully');
        // Clear stored OTP after successful verification
        sessionStorage.removeItem(`otp_${customerPhone}`);
        return;
      } else {
        toast.error(result.message || 'Invalid OTP. Please check and try again.');
        return;
      }
    } catch (error: any) {
      // If API unavailable, fallback to local verification
      console.log('WhatsApp API unavailable, using local verification:', error.message);
      
      // Verify OTP against generated OTP (fallback)
      const storedOTPData = sessionStorage.getItem(`otp_${customerPhone}`);
      
      if (storedOTPData) {
        try {
          const { otp: storedOTP, expiresAt } = JSON.parse(storedOTPData);
          
          // Check if OTP expired
          if (Date.now() > expiresAt) {
            toast.error('OTP has expired. Please request a new OTP.');
            sessionStorage.removeItem(`otp_${customerPhone}`);
            setShowOTP(false);
            setOtp('');
            setGeneratedOTP('');
            return;
          }
          
          // Verify OTP
          if (otpValue === storedOTP || otpValue === generatedOTP) {
            setOtpVerified(true);
            setLocalOtpAttempts(0);
            otpTimer.reset();
            analytics.track('otp_verified', { method: 'fallback_session' });
            toast.success('OTP verified successfully');
            sessionStorage.removeItem(`otp_${customerPhone}`);
          } else {
            setLocalOtpAttempts(a => a + 1);
            toast.error('Invalid OTP. Please check and try again.');
          }
        } catch (error) {
          // Fallback: verify against generatedOTP if sessionStorage fails
          if (otpValue === generatedOTP) {
            setOtpVerified(true);
            setLocalOtpAttempts(0);
            otpTimer.reset();
            analytics.track('otp_verified', { method: 'fallback_generated' });
            toast.success('OTP verified successfully');
          } else {
            setLocalOtpAttempts(a => a + 1);
            toast.error('Invalid OTP. Please check and try again.');
          }
        }
      } else {
        // Fallback: verify against generatedOTP
        if (otpValue === generatedOTP) {
          setOtpVerified(true);
          setLocalOtpAttempts(0);
          otpTimer.reset();
          analytics.track('otp_verified', { method: 'fallback_generated_no_session' });
          toast.success('OTP verified successfully');
        } else {
          setLocalOtpAttempts(a => a + 1);
          toast.error('Invalid OTP. Please request a new OTP.');
        }
      }
    }
  }

  // Reset OTP when payment method changes
  useEffect(() => {
    if (paymentMethod === 'cash') {
      setShowOTP(false);
      setOtpVerified(false);
      setOtp('');
      setGeneratedOTP('');
      setOtpSent(false);
      setShowOTPInUI(false);
      setOtpCopied(false);
      otpTimer.reset();
      // Clear stored OTP
      if (customerPhone) {
        sessionStorage.removeItem(`otp_${customerPhone}`);
      }
    }
  }, [paymentMethod, customerPhone]);

  // Copy OTP to clipboard
  async function handleCopyOTP() {
    if (!generatedOTP) return;
    try {
      await navigator.clipboard.writeText(generatedOTP);
      setOtpCopied(true);
      toast.success('OTP copied to clipboard!');
      setTimeout(() => setOtpCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy OTP:', error);
      toast.error('Failed to copy OTP');
    }
  }

  // Calculate GST
  const amountNum = parseFloat(amount) || 0;
  const gstCalculation = useMemo(() => {
    return amountNum > 0 ? calculateGST(amountNum, gstRate) : {
      baseAmount: 0,
      gstRate,
      gstAmount: 0,
      totalAmount: 0
    };
  }, [amountNum, gstRate]);



  const handleShare = async () => {
    // Validation
    if (!customerName.trim()) {
      toast.error('Please enter customer name');
      return;
    }

    if (!customerPhone || customerPhone.length !== 10) {
      toast.error('Please enter valid 10-digit phone number');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter valid amount');
      return;
    }

    if (!description.trim()) {
      toast.error('Please enter description');
      return;
    }

    // If credit, verify OTP first
    if (paymentMethod === 'credit' && !otpVerified) {
      toast.error('Please verify OTP before sharing invoice');
      return;
    }

    setShareStatus('generating');
    try {
      // Recalculate amount to ensure we have the latest value
      const currentAmountNum = parseFloat(amount) || 0;
      if (currentAmountNum <= 0) {
        toast.error('Please enter valid amount');
        setShareStatus('idle');
        return;
      }
      
      // Recalculate GST with current amount
      const currentGstCalculation = calculateGST(currentAmountNum, gstRate);
      
      // Use the preview invoice number (already shown to user)
      // Validate invoice number format
      if (!invoiceNumber || !invoiceNumber.trim()) {
        toast.error('Invalid invoice number. Please refresh the page.');
        setShareStatus('idle');
        return;
      }
      const invoiceNumToUse = invoiceNumber.trim();
      
      // Prepare invoice data
      const invoiceData: InvoiceData = {
        invoiceNumber: invoiceNumToUse,
        date,
        customerName: customerName.trim(),
        customerPhone,
        description: description.trim(),
        amount: currentAmountNum,
        gstRate,
        gstAmount: currentGstCalculation.gstAmount,
        totalAmount: currentGstCalculation.totalAmount,
      };

      // Save customer contact (auto-save) - continue even if it fails
      try {
        await saveCustomerContact({
          name: invoiceData.customerName,
          phone: invoiceData.customerPhone,
        });
      } catch (contactError) {
        console.error('Failed to save customer contact:', contactError);
        // Continue - customer contact save is not critical
      }

      // Generate PDF - wrap in try-catch
      let pdfBlob: Blob;
      try {
        pdfBlob = await generateInvoicePDF(invoiceData, companySettings);
      } catch (pdfError) {
        console.error('Failed to generate PDF:', pdfError);
        toast.error('Failed to generate PDF. Please try again.');
        setShareStatus('idle');
        return;
      }
      
      // Reserve the invoice number from the server atomically (multi-device safe).
      // Falls back to localStorage if the backend is unreachable.
      const { invoiceNumber: reservedNumber, source } = await getNextInvoiceNumber();
      if (source === 'local') {
        console.warn('Invoice number issued from local fallback — backend unreachable.');
      }
      // Update the displayed number to match the reserved one
      invoiceData.invoiceNumber = reservedNumber;
      
      // Prepare WhatsApp message text
      const message = `Invoice ${invoiceNumToUse}\n` +
        `Customer: ${invoiceData.customerName}\n` +
        `Amount: ${formatCurrency(invoiceData.totalAmount)}\n` +
        `Date: ${formatDate(invoiceData.date)}`;
      
      const pdfFileName = `Invoice_${invoiceNumToUse}.pdf`;
      
      await shareWithFallback({
        pdfBlob,
        filename: pdfFileName,
        message,
        phone: invoiceData.customerPhone,
        dialCode: country.dialCode,
        title: `Invoice ${invoiceNumToUse}`
      }, (method) => {
        if (method === 'wa_me') setShareStatus('wa_me');
      });
      toast.success('Invoice shared successfully!');

      // Auto-create ledger entry
      let ledgerEntryId: number | undefined;
      try {
        const datasource = getLedgerDataSource();
        const ledgerEntry = await datasource.create({
          date,
          description: `${invoiceData.description} - ${invoiceData.customerName}`,
          amount: invoiceData.totalAmount,
          type: 'sale',
          gstRate,
          gstAmount: invoiceData.gstAmount,
          party_name: invoiceData.customerName,
          reference_no: invoiceNumToUse,
        });
        ledgerEntryId = ledgerEntry.id;
        toast.success('Invoice shared and ledger entry created');
      } catch (ledgerError) {
        console.error('Failed to create ledger entry:', ledgerError);
        toast.warning('Invoice shared, but failed to create ledger entry');
      }

      // If credit payment, create credit entry (even if ledger entry failed)
      if (paymentMethod === 'credit') {
        try {
          await createCreditEntry({
            invoiceNumber: invoiceNumToUse,
            ledgerEntryId, // May be undefined if ledger creation failed
            customerName: invoiceData.customerName,
            customerPhone: invoiceData.customerPhone,
            amount: invoiceData.totalAmount,
            gstRate,
            gstAmount: invoiceData.gstAmount,
            status: 'pending',
            otpVerified: true,
            otpVerifiedAt: new Date().toISOString(),
          });
          toast.success('Credit entry created');
        } catch (creditError) {
          console.error('Failed to create credit entry:', creditError);
          toast.warning('Credit entry not created');
        }
      }

      // Save GST rate for next time
      localStorage.setItem('digbahi_last_gst_rate', gstRate.toString());

      // Reset form and get next invoice number (preview)
      const oldPhone = customerPhone;
      setCustomerName('');
      setCustomerPhone('');
      setDescription('');
      setAmount('');
      setInvoiceNumber(previewNextInvoiceNumber());
      setDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('cash');
      setShowOTP(false);
      setOtpVerified(false);
      setOtp('');
      setGeneratedOTP('');
      setOtpSent(false);
      setShowOTPInUI(false);
      setOtpCopied(false);
      
      // Clear OTP from sessionStorage
      if (oldPhone) {
        sessionStorage.removeItem(`otp_${oldPhone}`);
      }
      
    } catch (error) {
      console.error('Share error:', error);
      toast.error('Failed to share invoice');
    } finally {
      setTimeout(() => setShareStatus('idle'), 1000);
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Create Invoice</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate invoice and share via WhatsApp
        </p>
      </div>

      {!companySettings && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            ⚠️ Please configure your company details in Settings to generate professional invoices.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Main Form Column */}
        <Card className="p-6 bg-white border shadow-medium">
          <div className="space-y-6">
          {/* Invoice Information Section */}
      <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Invoice Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="invoiceNumber" className="flex items-center gap-2 mb-2">
                  <Hash className="w-4 h-4 text-primary" />
                  Invoice Number
                </Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceNumber}
                  className="touch-friendly bg-muted"
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="date" className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="touch-friendly"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* Customer Details Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Customer Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Label htmlFor="customerName" className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-primary" />
                  Customer Name <span className="text-destructive">*</span>
                </Label>
                <div className="flex w-full relative">
                  <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className={cn("w-full justify-between touch-friendly bg-white font-normal", !customerName && "text-muted-foreground")}
                      >
                        {customerName || "Select or type name..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search contact..." 
                          value={customerName}
                          onValueChange={(val) => {
                            setCustomerName(val);
                          }}
                        />
                        <CommandList>
                          <CommandEmpty>
                            No contact found. 
                            {customerName && <div className="mt-2 text-xs text-muted-foreground">Will be saved as a new contact.</div>}
                          </CommandEmpty>
                          <CommandGroup>
                            {customerSuggestions.map((contact, idx) => (
                              <CommandItem
                                key={idx}
                                value={contact.name}
                                onSelect={(currentValue) => {
                                  handleSelectSuggestion(contact.name);
                                  setOpenCombobox(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    customerName.toLowerCase() === contact.name.toLowerCase() ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{contact.name}</span>
                                  {contact.phone && <span className="text-xs text-muted-foreground">{formatPhoneDisplay(contact.phone, country.dialCode)}</span>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div>
                <Label htmlFor="customerPhone" className="flex items-center gap-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    +{country.dialCode}
                  </div>
                  <Input
                    id="customerPhone"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => handleCustomerPhoneChange(e.target.value)}
                    placeholder="9876543210"
                    className="touch-friendly pl-12 font-medium"
                    maxLength={country.maxPhoneLength}
                    required
                  />
                </div>
              </div>
            </div>
        </div>
        
          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* Invoice Items Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Invoice Items</h3>
          <div>
              <Label htmlFor="description" className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-primary" />
                Description <span className="text-destructive">*</span>
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product/Service description"
                className="touch-friendly"
                required
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* Amount & Tax Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Amount & Tax</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
                <Label htmlFor="amount" className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Amount (₹) <span className="text-destructive">*</span>
                </Label>
            <Input
              id="amount"
              type="number"
                  step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000.00"
              className="touch-friendly"
                  required
                />
              </div>
              <div>
                <Label htmlFor="gstRate" className="flex items-center gap-2 mb-2">
                  <Percent className="w-4 h-4 text-primary" />
                  GST Rate (%)
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
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* Payment Method Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment Method</h3>
            <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'cash' | 'credit')}>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="cash" id="cash" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-green-600" />
                        <span className="font-medium">Cash Payment</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Immediate payment</p>
                    </div>
                  </label>
                </div>
                <div className="flex-1">
                  <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="credit" id="credit" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-amber-600" />
                        <span className="font-medium">Credit Sale</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Payment later (OTP required)</p>
                    </div>
                  </label>
                </div>
              </div>
            </RadioGroup>

            {/* OTP Verification (only for credit) */}
            {paymentMethod === 'credit' && (
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    if (!showOTP && !otpVerified) {
                      handleRequestOTP();
                    } else {
                      setShowOTP(true);
                    }
                  }}
                  variant={otpVerified ? "ghost" : "outline"}
                  className={cn("w-full touch-friendly transition-all", otpVerified ? "text-green-600 bg-green-50/80 pointer-events-none border border-green-200" : "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100/80 shadow-sm")}
                >
                  {otpVerified ? (
                    <><Check className="w-5 h-5 mr-2" /> Phone Verified</>
                  ) : (
                    <><CreditCard className="w-5 h-5 mr-2" /> Verify Phone for Credit</>
                  )}
                </Button>
              </div>
            )}

            {/* Frictionless OTP Modal */}
            <Dialog open={showOTP && !otpVerified} onOpenChange={setShowOTP}>
              <DialogContent className="sm:max-w-md bg-white border-slate-200 p-6 shadow-strong">
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl">Verify Phone Number</DialogTitle>
                  <DialogDescription className="text-sm mt-1.5">
                    Enter the 6-digit code sent to <span className="font-semibold text-slate-800">+{country.dialCode} {customerPhone}</span>
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center space-y-8">
                  {showOTPInUI && generatedOTP && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg w-full">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest mb-1">
                        Backup OTP (WhatsApp popup blocked)
                      </p>
                      <p className="text-xs text-amber-600 mb-3">
                        Share this code with the customer verbally or via WhatsApp. Ask them to read it back to you before entering.
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-xl font-mono font-bold text-amber-900 tracking-wider">
                          {generatedOTP}
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={handleCopyOTP} className="h-9 border-amber-300">
                          {otpCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col items-center">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(value) => {
                        setOtp(value);
                        if (value.length === 6) {
                          setTimeout(() => handleVerifyOTP(value), 50);
                        }
                      }}
                      disabled={otpVerified || otpTimer.isExpired}
                      autoFocus
                      className="gap-2"
                    >
                      <InputOTPGroup className="gap-2">
                        <InputOTPSlot index={0} className="w-12 h-14 text-lg border-2 border-slate-200 focus:border-primary shadow-sm" />
                        <InputOTPSlot index={1} className="w-12 h-14 text-lg border-2 border-slate-200 focus:border-primary shadow-sm" />
                        <InputOTPSlot index={2} className="w-12 h-14 text-lg border-2 border-slate-200 focus:border-primary shadow-sm" />
                        <InputOTPSlot index={3} className="w-12 h-14 text-lg border-2 border-slate-200 focus:border-primary shadow-sm" />
                        <InputOTPSlot index={4} className="w-12 h-14 text-lg border-2 border-slate-200 focus:border-primary shadow-sm" />
                        <InputOTPSlot index={5} className="w-12 h-14 text-lg border-2 border-slate-200 focus:border-primary shadow-sm" />
                      </InputOTPGroup>
                    </InputOTP>
                    
                    {otpTimer.isExpired ? (
                       <p className="mt-4 text-sm text-destructive font-medium">OTP has expired. Please resend.</p>
                    ) : ( 
                       <p className="mt-4 text-sm text-slate-500 font-medium">Auto-verifies when complete</p>
                    )}
                  </div>

                  <div className="flex gap-3 w-full">
                    <Button
                      type="button"
                      onClick={() => setShowOTP(false)}
                      variant="ghost"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleRequestOTP}
                      variant="secondary"
                      className="flex-1 font-semibold"
                      disabled={otpTimer.isActive}
                    >
                      {otpTimer.isActive ? `Resend code in ${otpTimer.label}` : 'Resend Code'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* GST Calculation Preview */}
          {amountNum > 0 && (
            <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground mb-3">Amount Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-medium text-foreground">{formatCurrency(gstCalculation.baseAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">GST ({gstRate}%):</span>
                    <span className="font-medium text-foreground">{formatCurrency(gstCalculation.gstAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-primary/20">
                    <span className="font-bold text-base">Total Amount:</span>
                    <span className="font-bold text-xl text-primary">{formatCurrency(gstCalculation.totalAmount)}</span>
                  </div>
          </div>
        </div>
            </Card>
          )}

          {/* Action Button */}
          <div className="pt-2">
        <Button
          onClick={handleShare}
          disabled={shareStatus !== 'idle' || !customerName.trim() || !customerPhone || customerPhone.length !== 10 || !amount || !description.trim() || (paymentMethod === 'credit' && !otpVerified)}
          className="w-full touch-friendly bg-primary hover:bg-primary/90 text-white shadow-medium hover:shadow-glow transition-all"
          size="lg"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          {shareStatus === 'idle' && (paymentMethod === 'credit' ? 'Generate Invoice & Share' : 'Generate & Share via WhatsApp')}
          {shareStatus === 'generating' && 'Generating Pristine PDF...'}
          {shareStatus === 'wa_me' && 'Opening WhatsApp...'}
        </Button>
          </div>
          </div>
        </Card>

        {/* Live Invoice Preview Column */}
        <LiveInvoicePreview
          companySettings={companySettings}
          invoiceNumber={invoiceNumber}
          date={date}
          customerName={customerName}
          customerPhone={customerPhone}
          country={country}
          description={description}
          amountNum={amountNum}
          gstRate={gstRate}
          gstCalculation={gstCalculation}
        />
      </div>
    </div>
  );
}
