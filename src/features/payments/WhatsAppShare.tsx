import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MessageCircle, User, Calendar, FileText, DollarSign, Percent, Hash, CreditCard, Wallet, Download, Copy, Check } from 'lucide-react';
import { calculateGST, GST_RATES, formatCurrency, formatDate, type GSTRate } from '@/lib/gst';
import { getCompanySettings, getAllCustomerContacts, saveCustomerContact, getCustomerContactByPhone, createCreditEntry } from '@/lib/db';
import { getNextInvoiceNumber, commitInvoiceNumber } from './services/invoice.service';
import { getLedgerDataSource } from '@/services/ledger.datasource';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { whatsappAPIService } from './services/whatsapp-api.service';

// Lazy-load jsPDF to reduce main bundle
const loadJsPDF = async () => {
  const { default: jsPDF } = await import(/* webpackChunkName: "jspdf" */ 'jspdf');
  return jsPDF;
};

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  description: string;
  amount: number;
  gstRate: GSTRate;
  gstAmount: number;
  totalAmount: number;
}

export function WhatsAppShare() {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState<GSTRate>(18);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [companySettings, setCompanySettings] = useState<{ businessName: string; address?: string; gstin?: string; phone?: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [otp, setOtp] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [generatedOTP, setGeneratedOTP] = useState<string>('');
  const [otpSent, setOtpSent] = useState(false);
  const [showOTPInUI, setShowOTPInUI] = useState(false);
  const [otpCopied, setOtpCopied] = useState(false);

  // Load company settings and get next invoice number on mount
  useEffect(() => {
    loadCompanySettings();
    setInvoiceNumber(getNextInvoiceNumber());
    
    // Remember last GST rate
    const lastGstRate = localStorage.getItem('digbahi_last_gst_rate');
    if (lastGstRate) {
      const rate = parseInt(lastGstRate, 10) as GSTRate;
      if (GST_RATES.includes(rate)) {
        setGstRate(rate);
      }
    }
  }, []);

  // Load customer suggestions
  useEffect(() => {
    loadCustomerSuggestions();
  }, []);

  // Show suggestions when typing customer name
  useEffect(() => {
    if (customerName.trim().length > 0) {
      const filtered = customerSuggestions.filter(c => 
        c.toLowerCase().includes(customerName.toLowerCase())
      );
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [customerName, customerSuggestions]);

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

  async function loadCustomerSuggestions() {
    try {
      const contacts = await getAllCustomerContacts();
      const names = contacts.map(c => c.name).filter(Boolean);
      setCustomerSuggestions([...new Set(names)]);
    } catch (error) {
      console.error('Failed to load customer suggestions:', error);
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
    setShowSuggestions(false);
    
    // Find and set phone number for this customer
    getAllCustomerContacts().then(contacts => {
      const contact = contacts.find(c => c.name === name);
      if (contact) {
        setCustomerPhone(contact.phone);
      }
    });
  }

  // Generate random 6-digit OTP
  function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
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
            }) as any;
            
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
        const otpMessage = `Your OTP for DigBahi invoice is: ${newOTP}\n\nThis OTP is valid for 10 minutes.\n\nPlease enter this OTP in the application to verify.`;
        const whatsappUrl = `https://wa.me/91${customerPhone}?text=${encodeURIComponent(otpMessage)}`;
        
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

      toast.info('Please enter the 6-digit OTP sent to your WhatsApp');
    }
  }

  async function handleVerifyOTP() {
    if (otp.length !== 6) {
      toast.error('Please enter 6-digit OTP');
      return;
    }

    // Try backend API verification first
    try {
      const result = await whatsappAPIService.verifyOTP(customerPhone, otp);
      
      if (result.success) {
        setOtpVerified(true);
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
          if (otp === storedOTP || otp === generatedOTP) {
            setOtpVerified(true);
            toast.success('OTP verified successfully');
            sessionStorage.removeItem(`otp_${customerPhone}`);
          } else {
            toast.error('Invalid OTP. Please check and try again.');
          }
        } catch (error) {
          // Fallback: verify against generatedOTP if sessionStorage fails
          if (otp === generatedOTP) {
            setOtpVerified(true);
            toast.success('OTP verified successfully');
          } else {
            toast.error('Invalid OTP. Please check and try again.');
          }
        }
      } else {
        // Fallback: verify against generatedOTP
        if (otp === generatedOTP) {
          setOtpVerified(true);
          toast.success('OTP verified successfully');
        } else {
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

  // Auto-fill OTP
  function handleAutoFillOTP() {
    if (generatedOTP) {
      setOtp(generatedOTP);
      toast.success('OTP auto-filled!');
    }
  }

  // Calculate GST
  const amountNum = parseFloat(amount) || 0;
  const gstCalculation = amountNum > 0 ? calculateGST(amountNum, gstRate) : {
    baseAmount: 0,
    gstRate,
    gstAmount: 0,
    totalAmount: 0
  };

  const generateInvoicePDF = async (invoiceData: InvoiceData): Promise<Blob> => {
    try {
      const jsPDF = await loadJsPDF();
      const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = margin;

    // Header - Company Details
    doc.setFontSize(18);
    doc.setTextColor(42, 103, 178); // Tally Sky Blue
    doc.text(companySettings?.businessName || 'DigBahi', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    if (companySettings?.address) {
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(companySettings.address, pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
    }

    if (companySettings?.gstin) {
      doc.setFontSize(9);
      doc.text(`GSTIN: ${companySettings.gstin}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
    }

    yPos += 5;

    // Invoice Title
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('TAX INVOICE', margin, yPos);
    yPos += 10;

    // Invoice Details
    doc.setFontSize(10);
    doc.text(`Invoice No: ${invoiceData.invoiceNumber}`, margin, yPos);
    doc.text(`Date: ${formatDate(invoiceData.date)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;

    // Customer Details
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Bill To:', margin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.text(invoiceData.customerName, margin, yPos);
    yPos += 5;
    doc.text(`Phone: ${invoiceData.customerPhone}`, margin, yPos);
    yPos += 10;

    // Line Items Table Header
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text('Description', margin, yPos);
    doc.text('Amount', pageWidth - margin, yPos, { align: 'right' });
    yPos += 6;
    
    // Line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // Item
    doc.setFont(undefined, 'normal');
    doc.text(invoiceData.description || 'Invoice', margin, yPos);
    doc.text(formatCurrency(invoiceData.amount), pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;

    // Totals
    const totalsX = pageWidth - margin - 60;
    doc.setFontSize(9);
    doc.text('Subtotal:', totalsX, yPos);
    doc.text(formatCurrency(invoiceData.amount), pageWidth - margin, yPos, { align: 'right' });
    yPos += 5;

    doc.text(`GST (${invoiceData.gstRate}%):`, totalsX, yPos);
    doc.text(formatCurrency(invoiceData.gstAmount), pageWidth - margin, yPos, { align: 'right' });
    yPos += 6;

    // Total Line
    doc.setDrawColor(0, 0, 0);
    doc.line(totalsX, yPos, pageWidth - margin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Total Amount:', totalsX, yPos);
    doc.text(formatCurrency(invoiceData.totalAmount), pageWidth - margin, yPos, { align: 'right' });
    yPos += 10;
    
    // Footer
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('Generated by DigBahi Accounting Solutions', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    
    return doc.output('blob');
    } catch (error) {
      console.error('PDF generation error:', error);
      throw new Error('Failed to generate PDF. Please try again.');
    }
  };

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

    setLoading(true);
    try {
      // Recalculate amount to ensure we have the latest value
      const currentAmountNum = parseFloat(amount) || 0;
      if (currentAmountNum <= 0) {
        toast.error('Please enter valid amount');
        setLoading(false);
        return;
      }
      
      // Recalculate GST with current amount
      const currentGstCalculation = calculateGST(currentAmountNum, gstRate);
      
      // Use the preview invoice number (already shown to user)
      // Validate invoice number format
      if (!invoiceNumber || !invoiceNumber.trim()) {
        toast.error('Invalid invoice number. Please refresh the page.');
        setLoading(false);
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
        pdfBlob = await generateInvoicePDF(invoiceData);
      } catch (pdfError) {
        console.error('Failed to generate PDF:', pdfError);
        toast.error('Failed to generate PDF. Please try again.');
        setLoading(false);
        return;
      }
      
      // Commit invoice number ONLY after successful PDF generation
      commitInvoiceNumber();
      
      // Prepare WhatsApp message
      const message = `Invoice ${invoiceNumToUse}\n` +
        `Customer: ${invoiceData.customerName}\n` +
        `Amount: ${formatCurrency(invoiceData.totalAmount)}\n` +
        `Date: ${formatDate(invoiceData.date)}\n` +
        `\n📄 Invoice PDF is ready. You can attach it manually.`;
      
      // Open WhatsApp directly with pre-filled message
      try {
        const whatsappUrl = `https://wa.me/91${customerPhone}?text=${encodeURIComponent(message)}`;
        const whatsappWindow = window.open(whatsappUrl, '_blank');
        
        // Check if popup was blocked
        if (!whatsappWindow || whatsappWindow.closed || typeof whatsappWindow.closed === 'undefined') {
          toast.warning('Popup blocked. Please allow popups or copy the link manually.');
          // Fallback: copy link to clipboard
          try {
            await navigator.clipboard.writeText(whatsappUrl);
            toast.info('WhatsApp link copied to clipboard. Paste it in your browser.');
          } catch (clipboardError) {
            console.error('Failed to copy to clipboard:', clipboardError);
          }
        }
      } catch (whatsappError) {
        console.error('Failed to open WhatsApp:', whatsappError);
        toast.error('Failed to open WhatsApp. Please try again.');
      }
      
      // Download PDF (with error handling)
      try {
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `Invoice_${invoiceNumToUse}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Clean up after a delay to ensure download starts
        setTimeout(() => {
          URL.revokeObjectURL(pdfUrl);
        }, 100);
      } catch (pdfError) {
        console.error('Failed to download PDF:', pdfError);
        toast.warning('PDF generated but download failed. You can generate it again.');
      }
      
      toast.success('Invoice processed! WhatsApp opened and PDF downloaded.');

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
      setInvoiceNumber(getNextInvoiceNumber());
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
      setLoading(false);
    }
  };

  const filteredSuggestions = customerSuggestions.filter(c => 
    c.toLowerCase().includes(customerName.toLowerCase())
  );

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
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  className="touch-friendly"
                  required
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredSuggestions.map((name, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(name)}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="customerPhone" className="flex items-center gap-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => handleCustomerPhoneChange(e.target.value)}
                  placeholder="9876543210"
                  className="touch-friendly"
                  maxLength={10}
                  required
                />
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
              <Card className="p-4 bg-amber-50/50 border-amber-200">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    <h4 className="text-sm font-semibold">Customer Consent (OTP Verification)</h4>
                  </div>
                  
                  {!showOTP ? (
                    <Button
                      type="button"
                      onClick={handleRequestOTP}
                      variant="outline"
                      className="w-full touch-friendly"
                    >
                      Send OTP via WhatsApp
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      {otpSent && !showOTPInUI && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                          <p className="text-sm text-green-800 font-semibold">
                            ✅ WhatsApp opened for: {customerPhone}
                          </p>
                          <p className="text-xs text-green-700 mt-2 font-medium">
                            ⚠️ Important: Click "SEND" in WhatsApp to deliver the OTP message
                          </p>
                          <p className="text-xs text-green-600 mt-1">
                            The message is pre-filled - you just need to click Send
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowOTPInUI(true)}
                            className="mt-2 w-full text-xs"
                          >
                            View OTP (if WhatsApp didn't work)
                          </Button>
                        </div>
                      )}
                      
                      {showOTPInUI && generatedOTP && (
                        <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-blue-900">
                              Your OTP Code
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleCopyOTP}
                              className="h-8 px-2"
                            >
                              {otpCopied ? (
                                <>
                                  <Check className="w-4 h-4 mr-1 text-green-600" />
                                  <span className="text-xs text-green-600">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4 mr-1" />
                                  <span className="text-xs">Copy</span>
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-white border-2 border-blue-400 rounded-lg p-3">
                              <p className="text-2xl font-mono font-bold text-center text-blue-900 tracking-wider">
                                {generatedOTP}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAutoFillOTP}
                              className="h-10 px-4 whitespace-nowrap"
                            >
                              Auto-Fill
                            </Button>
                          </div>
                          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                            <p className="font-medium">📱 To send via WhatsApp:</p>
                            <p className="mt-1">1. Copy this OTP or click Auto-Fill</p>
                            <p>2. Open WhatsApp and send to: <strong>{customerPhone}</strong></p>
                            <p>3. Or use the WhatsApp link that was opened</p>
                          </div>
                          <p className="text-xs text-blue-700 mt-2 text-center">
                            This OTP is valid for 10 minutes. Enter it in the field below or click Auto-Fill.
                          </p>
                        </div>
                      )}
          <div>
                        <Label htmlFor="otp" className="mb-2 block">Enter 6-digit OTP</Label>
                        <InputOTP
                          maxLength={6}
                          value={otp}
                          onChange={(value) => setOtp(value)}
                          disabled={otpVerified}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      
                      {otpVerified ? (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <span className="font-medium">✓ OTP Verified</span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={handleVerifyOTP}
                            disabled={otp.length !== 6}
                            className="flex-1 touch-friendly"
                          >
                            Verify OTP
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              setShowOTP(false);
                              setOtp('');
                              setOtpVerified(false);
                              setGeneratedOTP('');
                              setOtpSent(false);
                              setShowOTPInUI(false);
                              setOtpCopied(false);
                              if (customerPhone) {
                                sessionStorage.removeItem(`otp_${customerPhone}`);
                              }
                            }}
                            variant="outline"
                            className="flex-1 touch-friendly"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={handleRequestOTP}
                            variant="outline"
                            className="flex-1 touch-friendly"
                          >
                            Resend OTP
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
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
              disabled={loading || !customerName.trim() || !customerPhone || customerPhone.length !== 10 || !amount || !description.trim() || (paymentMethod === 'credit' && !otpVerified)}
              className="w-full touch-friendly bg-primary hover:bg-primary/90 text-white shadow-medium hover:shadow-glow transition-all"
          size="lg"
        >
              <MessageCircle className="w-4 h-4 mr-2" />
              {loading ? 'Sharing...' : paymentMethod === 'credit' ? 'Generate Invoice & Share' : 'Generate & Share via WhatsApp'}
        </Button>
          </div>
      </div>
    </Card>
    </div>
  );
}
