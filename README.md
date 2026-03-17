# DigBahi

<div align="center">

**Professional Accounting Software for Indian SMEs**

*Tablet-based accounting with pen input, GST compliance, and offline capability*

[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

[Features](#-features) • [Quick Start](#-quick-start) • [Support](#-support) • [License](#-license)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage Guide](#-usage-guide)
- [Architecture](#-architecture)
- [Development](#-development)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [Support](#-support)
- [License](#-license)

---

## 🎯 Overview

**DigBahi** is a modern, tablet-first accounting solution designed specifically for Indian small and medium enterprises (SMEs). Built as a Progressive Web App (PWA), it combines traditional accounting practices with cutting-edge technology, offering a seamless experience that works offline and integrates with modern payment systems.

### Key Highlights

- 🖊️ **Pen Input Interface** - Natural handwriting recognition for traditional accounting feel
- 📱 **Progressive Web App** - Install on any device, works offline
- 🇮🇳 **GST Compliant** - Automatic tax calculations with official Indian GST slabs
- 🔒 **Secure & Private** - All data stored locally with encryption
- 💬 **WhatsApp Integration** - Send invoices and reports directly via WhatsApp Business API
- 📊 **Comprehensive Reports** - P&L statements, GST reports, and ledger summaries
- 🌐 **Multi-lingual** - English and Hindi (हिन्दी) support

---

## ✨ Features

### Core Functionality

| Feature | Description |
|---------|-------------|
| **🔐 PIN Authentication** | Secure role-based access control (Owner/Accountant/Employee) |
| **🖊️ Pen Input Canvas** | Handwriting recognition with OCR support (TensorFlow.js/Tesseract OCR) |
| **📖 Digital Ledger** | Professional transaction management with filtering and search |
| **💰 GST Compliance** | Automatic calculation with official slabs (0%, 5%, 12%, 18%, 28%) |
| **📝 Transaction Types** | Sales, Purchases, Expenses, Receipts with full audit trail |
| **📊 Dashboard Analytics** | Real-time P&L, GST summary, and business insights |
| **📴 Offline-First** | Complete functionality without internet using IndexedDB |
| **📱 Mobile-Optimized** | Responsive design optimized for tablets and phones |

### Advanced Features

| Feature | Description |
|---------|-------------|
| **📄 PDF Exports** | Professional P&L statements, GST reports, and ledger summaries |
| **📊 CSV Export** | Export ledger data for Tally/Excel import |
| **🌍 Multi-lingual** | Full support for English and Hindi (हिन्दी) |
| **💳 UPI Integration** | Payment reconciliation and QR code generation |
| **💬 WhatsApp Billing** | Generate and share invoices/reports via WhatsApp Business API |
| **📋 Credit Management** | Track receivables with OTP-based customer consent |
| **📦 Inventory Management** | Stock tracking and inventory reports |
| **🤖 AI Analytics** | Business insights and predictive analytics (optional) |

---

## 🚀 Quick Start

### Prerequisites

- Node.js (v18+)
- Python (v3.8+)
- **Tesseract OCR** (Required for Pen Input)

### Installation

#### 1. Install System Dependencies

**macOS:**
```bash
brew install tesseract
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install tesseract-ocr libtesseract-dev libleptonica-dev pkg-config
sudo apt-get install python3-dev python3-venv  # Required for backend
sudo apt-get install libgl1  # Required for OpenCV
```

#### 2. Install Application

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Python** 3.8+ ([Download](https://www.python.org/))
- **npm** (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

Verify installations:

```bash
node --version    # Should be 18.x or higher
python3 --version # Should be 3.8.x or higher
npm --version     # Should be 9.x or higher
git --version     # Any recent version
```

### Demo Credentials

For testing purposes, use these default credentials:

- **Username:** `demo`
- **PIN:** `1234`

> ⚠️ **Security Note:** Change these credentials in production environments.

### One-Command Setup

```bash
# Clone the repository
git clone https://github.com/soni-pvt-ltd/DigBahi.git
cd digi-bahi-ink

# Install all dependencies (frontend + backend)
npm run install:all
# OR
./install.sh
```

**What happens:**
- ✅ Installs frontend dependencies (npm packages)
- ✅ Sets up Python virtual environment
- ✅ Installs backend dependencies
- ✅ Optionally installs Tesseract OCR service (prompted)

**Expected time:** 10-15 minutes (first time)

### Start the Application

```bash
# Start all services (Frontend, Backend, Tesseract OCR)
npm start
# OR
./start.sh
```

This starts:
- 🌐 **Frontend** on [http://localhost:5173](http://localhost:5173)
- 🔧 **Backend API** on [http://localhost:8000](http://localhost:8000)
- 📝 **Tesseract OCR** on [http://localhost:9000](http://localhost:9000)

### Stop the Application

```bash
npm stop
# OR
./stop.sh
```

---

## 📦 Installation

### Option 1: Automated Installation (Recommended)

The `install.sh` script handles everything automatically:

```bash
./install.sh
```

### Option 2: Manual Installation

<details>
<summary><b>Click to expand manual installation steps</b></summary>

#### Step 1: Clone Repository

```bash
git clone https://github.com/soni-pvt-ltd/DigBahi.git
cd digi-bahi-ink
```

#### Step 2: Install Frontend Dependencies

```bash
npm install
```

#### Step 3: Setup Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

#### Step 4: Setup Tesseract OCR Service (Optional)

```bash
cd backend/services/tesseract_ocr
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ../../..
```

#### Step 5: Configure Environment Variables

```bash
# Frontend (optional - defaults work for local dev)
cp .env.example .env

# Backend (required for WhatsApp features)
cd backend
cp .env.example .env
# Edit .env and add your WhatsApp API credentials
cd ..
```

</details>

---

## ⚙️ Configuration

### Environment Variables

#### Frontend (`.env`)

```env
# API Configuration
VITE_API_URL=http://localhost:8000
VITE_ENABLE_LEDGER_API=false
VITE_ENABLE_UPI=true
VITE_ENABLE_GST_REPORTS=true
VITE_ENABLE_INVENTORY=true
```

#### Backend (`backend/.env`)

```env
# WhatsApp Business API Configuration
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_API_VERSION=v22.0

# Database Configuration
DATABASE_URL=sqlite:///./digbahi_local.db

# Security
SECRET_KEY=your_secret_key_here
```

> 📖 **See:** [WHATSAPP_INTEGRATION.md](./WHATSAPP_INTEGRATION.md) for detailed WhatsApp setup instructions.

### WhatsApp Business API Setup

To enable WhatsApp features (OTP, invoice sharing):

1. Create a Meta Business Account
2. Set up WhatsApp Business API
3. Create message templates (e.g., `digbahi_otp`)
4. Add credentials to `backend/.env`
5. Add test phone numbers to allowed list

> 📖 **Detailed Guide:** [WHATSAPP_INTEGRATION.md](./WHATSAPP_INTEGRATION.md)

---

## 📖 Usage Guide

### Adding Transactions

#### Method 1: Pen Input (Recommended for Tablets)

1. Click **"Pen Input"** button in header
2. Write transaction details on canvas (e.g., "Sale 1000 2025-09-30")
3. Click **"Recognize"** to convert handwriting to text
4. Review and confirm the entry
5. Save to ledger

#### Method 2: Form Entry

1. Navigate to **"Ledger"** tab
2. Click **"New Entry"** button
3. Fill in:
   - Date
   - Description
   - Party Name
   - Amount
   - Transaction Type (Sale/Purchase/Expense/Receipt)
   - GST Rate
4. Preview GST calculation
5. Click **"Save Entry"**

### Generating Reports

1. Navigate to **"Reports"** tab
2. Select report type:
   - **P&L Statement** - Income vs. expenses with net profit/loss
   - **GST Report** - Collected vs. paid with net liability
   - **Ledger Summary** - Complete transaction history
3. Click **"Export PDF"** or **"Export CSV"**

### WhatsApp Billing

1. Navigate to **"WhatsApp"** tab
2. Select bill type (Invoice/Receipt)
3. Enter customer details and amount
4. Click **"Share via WhatsApp"**
5. PDF invoice is generated and sent via WhatsApp Business API

### Credit Management

1. Go to **"Credit"** tab
2. Enter customer name and credit amount
3. Request OTP for customer consent
4. Verify OTP and record credit sale
5. Track pending payments and mark as paid

### Language Switching

1. Click language selector in header (🌐 Globe icon)
2. Choose **English** or **हिन्दी** (Hindi)
3. All UI labels update instantly

---

## 🏗️ Architecture

### Technology Stack

#### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS with custom design system
- **UI Components:** shadcn/ui (customized)
- **State Management:** React Hooks + Context API
- **Database:** Dexie.js (IndexedDB wrapper)
- **PDF Generation:** jsPDF
- **OCR:** TensorFlow.js / Tesseract OCR
- **Internationalization:** i18next + react-i18next

#### Backend
- **Framework:** FastAPI (Python)
- **Database:** SQLite (development) / PostgreSQL (production)
- **API:** RESTful API with WebSocket support
- **OCR Service:** Tesseract OCR (optional)
- **WhatsApp Integration:** Meta WhatsApp Business API

### Project Structure

```
digi-bahi-ink/
├── src/
│   ├── components/       # Reusable UI components
│   ├── features/         # Feature-based modules
│   │   ├── payments/     # Payment integrations
│   │   ├── pen-input/    # Pen input functionality
│   │   ├── reports/      # Reporting features
│   │   └── ...
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility libraries
│   ├── services/         # Business logic services
│   └── pages/            # Page components
├── backend/
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── services/     # Business logic
│   │   └── main.py       # FastAPI application
│   └── services/
│       └── tesseract_ocr/   # OCR service
├── public/               # Static assets
└── dist/                 # Production build output
```

> 📖 **Detailed Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)

### Data Flow

1. **Local Mode (Default):**
   - Data stored in browser IndexedDB
   - No network requests
   - Works completely offline

2. **API Mode (Optional):**
   - Data synced with backend server
   - WebSocket for real-time updates
   - Multi-device access
   - Automatic fallback to local mode

---

## 💻 Development

### Development Commands

```bash
# Start development server (frontend only)
npm run dev

# Start all services (frontend + backend + OCR)
npm start

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Run OCR tests
npm run ocr:test
```

### Development Workflow

1. **Frontend Development:**
   ```bash
   npm run dev
   # Frontend runs on http://localhost:5173
   ```

2. **Backend Development:**
   ```bash
   cd backend
   source venv/bin/activate
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **API Documentation:**
   - Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
   - ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Code Style

- **TypeScript:** Strict mode enabled
- **ESLint:** Configured with React and TypeScript rules
- **Prettier:** Code formatting (if configured)
- **Conventions:** Follow React best practices and TypeScript guidelines

---

## 🚢 Deployment

### Production Build

```bash
# Build optimized production bundle
npm run build

# Test production build locally
npm run preview

# Build output is in 'dist/' directory
```

### Deployment Options

#### Option 1: Static Hosting (Frontend Only)

**Recommended for:** Local mode usage

- **Netlify:** Drag & drop `dist/` folder
- **Vercel:** Connect GitHub repository
- **GitHub Pages:** Deploy from `dist/` folder
- **AWS S3 + CloudFront:** Static website hosting

#### Option 2: Full Stack Deployment

**Recommended for:** API mode with backend

- **Railway:** One-click deployment
- **Render:** Full-stack hosting
- **DigitalOcean App Platform:** Managed hosting
- **AWS Elastic Beanstalk:** Scalable deployment
- **Docker:** Containerized deployment

### Docker Deployment

```bash
# Build Docker image
docker build -t digbahi:latest .

# Run container
docker run -p 5173:5173 -p 8000:8000 digbahi:latest
```

> 📖 **See:** [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed deployment instructions.

---

## 🔧 Troubleshooting

### Common Issues

#### Issue: Port Already in Use

```bash
# Find process using port
lsof -ti:5173  # Frontend
lsof -ti:8000  # Backend
lsof -ti:9000  # Tesseract OCR

# Kill process
kill -9 <PID>
```

#### Issue: Dependencies Not Installing

```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Issue: Backend Not Starting

```bash
# Check Python version
python3 --version  # Should be 3.8+

# Recreate virtual environment
cd backend
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### Issue: WhatsApp Features Not Working

1. Verify `.env` file exists in `backend/` directory
2. Check WhatsApp API credentials are correct
3. Ensure message template is created in Meta Business Manager
4. Verify phone numbers are in allowed list
5. Check access token is not expired

#### Issue: Build Fails

```bash
# Clear build cache
rm -rf dist node_modules/.vite

# Rebuild
npm run build
```

### Getting Help

- 📖 Check [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed setup instructions
- 💬 Check [WHATSAPP_INTEGRATION.md](./WHATSAPP_INTEGRATION.md) for WhatsApp setup
- 🐛 Open an issue on GitHub
- 📧 Contact support: support@digbahi.in

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Commit with clear messages:**
   ```bash
   git commit -m "Add: Description of changes"
   ```
5. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request**

### Contribution Guidelines

- Follow existing code style and conventions
- Write clear commit messages
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

---

## 📊 System Requirements

### Minimum Requirements

- **CPU:** Dual-core processor
- **RAM:** 1GB available
- **Storage:** 100MB free space
- **Screen:** 7" display (1024x600)
- **Browser:** Chrome 90+, Safari 14+, Firefox 88+

### Recommended Requirements

- **CPU:** Quad-core processor
- **RAM:** 2GB available
- **Storage:** 500MB free space

### Raspberry Pi 4/5 Deployment

For Linux tablet deployment (Raspberry Pi 4/5 with 7" touchscreen):

```bash
# 1. System setup
./scripts/pi-setup.sh

# 2. Install application
./install.sh

# 3. Start services
./start.sh

# 4. Kiosk mode (fullscreen)
./scripts/start-kiosk.sh
```

**Note:** OCR automatically routes to backend (native Tesseract) on Linux tablets for better performance.
- **Screen:** 10" tablet (1920x1200)
- **Input:** Stylus/pen support
- **Browser:** Latest Chrome/Edge/Safari

---

## 🇮🇳 GST Compliance

DigBahi implements official Indian GST tax slabs:

| Rate | Category | Examples |
|------|----------|----------|
| **0%** | Essential goods | Grains, dairy, healthcare |
| **5%** | Household necessities | Sugar, tea, edible oils |
| **12%** | Processed foods | Business services |
| **18%** | Standard rate | Most goods and services |
| **28%** | Luxury goods | Cars, tobacco, premium items |

### GST Features

- ✅ Automatic tax calculation on all transactions
- ✅ GST-compliant PDF invoice generation
- ✅ Separate tracking of Output Tax vs. Input Tax Credit
- ✅ Net GST liability calculation for portal filing
- ✅ Export GST reports to PDF for GSTIN filing
- 🔜 GSTIN integration (coming soon)

---

## 📱 Installing as PWA

### Android Tablet/Phone

1. Open app in Chrome browser
2. Tap menu (⋮) → **"Add to Home Screen"**
3. App installs like native app
4. Launch from home screen for fullscreen experience

### iOS/iPad

1. Open app in Safari
2. Tap Share button
3. Select **"Add to Home Screen"**
4. App installs as web app

### Desktop (Chrome/Edge)

1. Click install icon (⊕) in address bar
2. Or go to Settings → **Install DigBahi**
3. App opens as standalone window

---

## 🗺️ Roadmap

### ✅ Completed (MVP)

- [x] PIN authentication with role management
- [x] Canvas pen input with OCR support
- [x] Digital ledger with CRUD operations
- [x] GST calculator (0%, 5%, 12%, 18%, 28%)
- [x] Dashboard analytics (P&L, GST, insights)
- [x] Offline IndexedDB storage with encryption
- [x] PWA installable on all platforms
- [x] PDF exports (P&L, GST reports, ledger)
- [x] CSV export for Tally/Excel
- [x] WhatsApp Business API integration
- [x] Credit management with OTP
- [x] English and Hindi localization

### 🔜 Coming Soon

- [ ] Advanced OCR model optimization
- [ ] Real UPI API integration (PhonePe/GooglePay)
- [ ] Cloud sync for multi-device (optional)
- [ ] Advanced reports (Balance Sheet, Cash Flow)
- [ ] GSTIN management and e-filing portal integration
- [ ] Video tutorials and in-app help
- [ ] Regional languages (Tamil, Telugu, Marathi, Bengali)
- [ ] Mobile app (React Native)

---

## 🆘 Support

### Documentation

- 📖 [Setup Guide](./SETUP_GUIDE.md) - Detailed setup instructions
- 📖 [WhatsApp Integration](./WHATSAPP_INTEGRATION.md) - WhatsApp API setup
- 📖 [Architecture](./ARCHITECTURE.md) - Technical architecture

### Contact

- 📧 **Email:** support@digbahi.in
- 🌐 **Website:** [https://digbahi.in](https://digbahi.in)
- 💬 **Community:** [https://community.digbahi.in](https://community.digbahi.in)
- 🐛 **Issues:** [GitHub Issues](https://github.com/soni-pvt-ltd/DigBahi/issues)

---

## 📄 License

© 2025 DigBahi Accounting Solutions. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited.

---

## 🙏 Acknowledgments

Built with ❤️ for Indian SMEs

*Empowering businesses with affordable, professional accounting.*

---

<div align="center">

**[⬆ Back to Top](#digbahi)**

Made with ❤️ by DigBahi Accounting Solutions

</div>
