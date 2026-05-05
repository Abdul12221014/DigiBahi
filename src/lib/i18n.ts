import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Auth
      login: 'Login',
      username: 'Username',
      pin: 'PIN',
      logout: 'Logout',

      // Navigation
      dashboard: 'Dashboard',
      ledger: 'Ledger',
      reports: 'Reports',
      penInput: 'Pen Input',
      inventory: 'Inventory',
      settings: 'Settings',
      whatsapp: 'WhatsApp',
      upi: 'UPI',
      gstReports: 'GST Reports',

      // Ledger
      date: 'Date',
      description: 'Description',
      type: 'Type',
      amount: 'Amount',
      gst: 'GST',
      total: 'Total',
      actions: 'Actions',
      newEntry: 'New Entry',
      addEntry: 'Add Entry',
      partyName: 'Party Name',
      referenceNo: 'Reference No.',

      // Types
      sale: 'Sale',
      purchase: 'Purchase',
      expense: 'Expense',
      receipt: 'Receipt',

      // Dashboard
      totalSales: 'Total Sales',
      totalPurchases: 'Total Purchases',
      totalExpenses: 'Total Expenses',
      gstCollected: 'GST Collected',
      gstPaid: 'GST Paid',
      netProfit: 'Net Profit/Loss',
      netGST: 'Net GST Liability',

      // Inventory
      itemName: 'Item Name',
      sku: 'SKU',
      hsnCode: 'HSN Code',
      gstRate: 'GST Rate',
      openingQty: 'Opening Qty',
      unit: 'Unit',
      minQty: 'Min Qty',
      mrp: 'MRP',
      salePrice: 'Sale Price',
      purchasePrice: 'Purchase Price',
      currentStock: 'Current Stock',
      stockValue: 'Stock Value',
      lowStock: 'Low Stock',
      addItem: 'Add Item',
      editItem: 'Edit Item',
      deleteItem: 'Delete Item',

      // WhatsApp / Invoice
      invoiceNumber: 'Invoice Number',
      customerName: 'Customer Name',
      customerPhone: 'Customer Phone',
      generateInvoice: 'Generate Invoice',
      shareInvoice: 'Share Invoice',
      sendWhatsApp: 'Send via WhatsApp',
      otpVerification: 'OTP Verification',
      enterOtp: 'Enter OTP',
      verifyOtp: 'Verify OTP',
      paymentMethod: 'Payment Method',
      cash: 'Cash',
      upiPayment: 'UPI',
      credit: 'Credit',

      // UPI
      upiId: 'UPI ID',
      qrCode: 'QR Code',
      scanToPay: 'Scan to Pay',
      paymentStatus: 'Payment Status',
      reconcile: 'Reconcile',

      // Settings
      companyName: 'Company Name',
      gstin: 'GSTIN',
      address: 'Address',
      phone: 'Phone',
      email: 'Email',
      language: 'Language',
      currency: 'Currency',
      taxSettings: 'Tax Settings',
      backupRestore: 'Backup & Restore',
      exportBackup: 'Export Backup',
      importBackup: 'Import Backup',

      // GST Reports
      gstSummary: 'GST Summary',
      taxableAmount: 'Taxable Amount',
      cgst: 'CGST',
      sgst: 'SGST',
      igst: 'IGST',
      totalTax: 'Total Tax',
      gstr1: 'GSTR-1',
      gstr3b: 'GSTR-3B',
      downloadReport: 'Download Report',

      // Actions
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      export: 'Export',
      share: 'Share',
      search: 'Search',
      filter: 'Filter',
      refresh: 'Refresh',
      print: 'Print',
      download: 'Download',

      // Messages
      success: 'Success',
      error: 'Error',
      loading: 'Loading...',
      noData: 'No data found',
      confirmDelete: 'Are you sure you want to delete this?',
      savedSuccessfully: 'Saved successfully',
      deletedSuccessfully: 'Deleted successfully',
    }
  },
  hi: {
    translation: {
      // Auth
      login: 'लॉगिन',
      username: 'उपयोगकर्ता नाम',
      pin: 'पिन',
      logout: 'लॉगआउट',

      // Navigation
      dashboard: 'डैशबोर्ड',
      ledger: 'खाता बही',
      reports: 'रिपोर्ट',
      penInput: 'पेन इनपुट',
      inventory: 'इन्वेंटरी',
      settings: 'सेटिंग्स',
      whatsapp: 'व्हाट्सएप',
      upi: 'यूपीआई',
      gstReports: 'जीएसटी रिपोर्ट',

      // Ledger
      date: 'तारीख',
      description: 'विवरण',
      type: 'प्रकार',
      amount: 'राशि',
      gst: 'जीएसटी',
      total: 'कुल',
      actions: 'कार्य',
      newEntry: 'नई प्रविष्टि',
      addEntry: 'प्रविष्टि जोड़ें',
      partyName: 'पार्टी का नाम',
      referenceNo: 'संदर्भ संख्या',

      // Types
      sale: 'बिक्री',
      purchase: 'खरीद',
      expense: 'व्यय',
      receipt: 'रसीद',

      // Dashboard
      totalSales: 'कुल बिक्री',
      totalPurchases: 'कुल खरीद',
      totalExpenses: 'कुल व्यय',
      gstCollected: 'जीएसटी एकत्रित',
      gstPaid: 'जीएसटी भुगतान',
      netProfit: 'शुद्ध लाभ/हानि',
      netGST: 'शुद्ध जीएसटी देयता',

      // Inventory
      itemName: 'वस्तु का नाम',
      sku: 'एसकेयू',
      hsnCode: 'एचएसएन कोड',
      gstRate: 'जीएसटी दर',
      openingQty: 'प्रारंभिक मात्रा',
      unit: 'इकाई',
      minQty: 'न्यूनतम मात्रा',
      mrp: 'एमआरपी',
      salePrice: 'बिक्री मूल्य',
      purchasePrice: 'खरीद मूल्य',
      currentStock: 'वर्तमान स्टॉक',
      stockValue: 'स्टॉक मूल्य',
      lowStock: 'कम स्टॉक',
      addItem: 'वस्तु जोड़ें',
      editItem: 'वस्तु संपादित करें',
      deleteItem: 'वस्तु हटाएं',

      // WhatsApp / Invoice
      invoiceNumber: 'चालान संख्या',
      customerName: 'ग्राहक का नाम',
      customerPhone: 'ग्राहक का फोन',
      generateInvoice: 'चालान बनाएं',
      shareInvoice: 'चालान साझा करें',
      sendWhatsApp: 'व्हाट्सएप से भेजें',
      otpVerification: 'ओटीपी सत्यापन',
      enterOtp: 'ओटीपी दर्ज करें',
      verifyOtp: 'ओटीपी सत्यापित करें',
      paymentMethod: 'भुगतान विधि',
      cash: 'नकद',
      upiPayment: 'यूपीआई',
      credit: 'उधार',

      // UPI
      upiId: 'यूपीआई आईडी',
      qrCode: 'क्यूआर कोड',
      scanToPay: 'भुगतान के लिए स्कैन करें',
      paymentStatus: 'भुगतान स्थिति',
      reconcile: 'मिलान करें',

      // Settings
      companyName: 'कंपनी का नाम',
      gstin: 'जीएसटीआईएन',
      address: 'पता',
      phone: 'फोन',
      email: 'ईमेल',
      language: 'भाषा',
      currency: 'मुद्रा',
      taxSettings: 'कर सेटिंग्स',
      backupRestore: 'बैकअप और पुनर्स्थापना',
      exportBackup: 'बैकअप निर्यात करें',
      importBackup: 'बैकअप आयात करें',

      // GST Reports
      gstSummary: 'जीएसटी सारांश',
      taxableAmount: 'कर योग्य राशि',
      cgst: 'सीजीएसटी',
      sgst: 'एसजीएसटी',
      igst: 'आईजीएसटी',
      totalTax: 'कुल कर',
      gstr1: 'जीएसटीआर-1',
      gstr3b: 'जीएसटीआर-3बी',
      downloadReport: 'रिपोर्ट डाउनलोड करें',

      // Actions
      save: 'सहेजें',
      cancel: 'रद्द करें',
      delete: 'हटाएं',
      edit: 'संपादित करें',
      export: 'निर्यात',
      share: 'साझा करें',
      search: 'खोजें',
      filter: 'फ़िल्टर',
      refresh: 'ताज़ा करें',
      print: 'प्रिंट',
      download: 'डाउनलोड',

      // Messages
      success: 'सफलता',
      error: 'त्रुटि',
      loading: 'लोड हो रहा है...',
      noData: 'कोई डेटा नहीं मिला',
      confirmDelete: 'क्या आप वाकई इसे हटाना चाहते हैं?',
      savedSuccessfully: 'सफलतापूर्वक सहेजा गया',
      deletedSuccessfully: 'सफलतापूर्वक हटाया गया',
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
