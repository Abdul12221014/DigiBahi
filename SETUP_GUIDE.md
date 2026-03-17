# DigBahi - Setup Guide for Team

**Quick setup guide for team members to get the application running locally.**

---

## Prerequisites Check

Before starting, verify you have:

```bash
# Check Node.js (need 18+)
node --version

# Check Python (need 3.8+)
python3 --version

# Check npm (comes with Node.js)
npm --version
```

**Install if missing:**
- Node.js: https://nodejs.org/
- Python: Usually pre-installed on Mac, or https://www.python.org/

---

## Step-by-Step Setup

### Option 1: One-Click Installation (Recommended)

```bash
# Clone repository
git clone https://github.com/soni-pvt-ltd/DigBahi.git
cd DigBahi

# Run one-click install script
./install.sh
# OR
npm run install:all
```

**What it does:**
- ✅ Checks prerequisites (Node.js, Python)
- ✅ Installs frontend dependencies (npm)
- ✅ Sets up backend virtual environment and dependencies
- ✅ Optionally installs Tesseract OCR (you'll be prompted)

**Expected time:** 10-15 minutes (first time)

---

### Option 2: Manual Installation

### 1. Clone Repository

```bash
git clone https://github.com/soni-pvt-ltd/DigBahi.git
cd DigBahi
```

### 2. Install Frontend Dependencies

```bash
npm install
```

**Expected time:** 2-3 minutes  
**What it does:** Installs all React/TypeScript dependencies

---

### 3. Setup Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Mac/Linux
# OR
venv\Scripts\activate     # On Windows

# Install Python dependencies
pip install -r requirements.txt

# Go back to root
cd ..
```

**Expected time:** 2-3 minutes  
**What it does:** Sets up Python environment and installs FastAPI, SQLAlchemy, etc.

---

### 4. Setup Tesseract OCR (Optional - for OCR features)

```bash
cd backend/services/tesseract_ocr

# Create virtual environment
python3 -m venv venv

# Activate
source venv/bin/activate

# Install OCR dependencies
pip install -r requirements.txt

# Go back to root
cd ../../..
```

**Expected time:** 5-10 minutes (OCR libraries are large)  
**Note:** This is optional - app works without it, but OCR features won't work

---

### 5. Configure Environment Variables (Optional)

#### Frontend (Optional)
```bash
# Copy example file
cp .env.example .env

# Edit if needed (defaults work for local dev)
# VITE_API_URL=http://localhost:8000
```

#### Backend (Required for WhatsApp features)
```bash
cd backend
cp .env.example .env

# Edit .env and add your WhatsApp credentials
# Get from: https://developers.facebook.com/
# WHATSAPP_PHONE_NUMBER_ID=your_id
# WHATSAPP_ACCESS_TOKEN=your_token
# WHATSAPP_BUSINESS_ACCOUNT_ID=your_account_id
# WHATSAPP_API_VERSION=v22.0

cd ..
```

**Note:** Without WhatsApp credentials, WhatsApp features won't work, but rest of app works fine.

---

### 6. Start the Application

**Option 1: Single Command (Recommended)**
```bash
npm start
# OR
./start.sh
```

**Option 2: Manual Start**
```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Tesseract OCR (optional)
cd backend/services/tesseract_ocr
source venv/bin/activate
uvicorn ocr_service:app --host 0.0.0.0 --port 9000

# Terminal 3: Frontend
npm run dev
```

**Application URLs:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Tesseract OCR: http://localhost:9000

---

### 7. Stop the Application

```bash
npm stop
# OR
./stop.sh
```

---

## VS Code Setup (Optional)

### Recommended Extensions

1. **ES7+ React/Redux/React-Native snippets**
2. **TypeScript and JavaScript Language Features** (built-in)
3. **Python** (by Microsoft)
4. **Prettier - Code formatter**
5. **ESLint**

### VS Code Settings

Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "python.defaultInterpreterPath": "${workspaceFolder}/backend/venv/bin/python",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -ti:5173  # Frontend
lsof -ti:8000  # Backend
lsof -ti:9000  # OCR

# Kill the process
kill -9 <PID>
```

### Python Virtual Environment Issues

```bash
# If venv doesn't activate
python3 -m venv venv --clear
source venv/bin/activate
pip install -r requirements.txt
```

### npm Install Fails

```bash
# Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Backend Won't Start

```bash
# Check if dependencies installed
cd backend
source venv/bin/activate
pip list | grep fastapi

# Reinstall if missing
pip install -r requirements.txt
```

### Frontend Build Errors

```bash
# Clear and reinstall
rm -rf node_modules dist
npm install
npm run build
```

---

## Testing the Setup

### 1. Check Backend
```bash
curl http://localhost:8000/api/v1/health
# Should return: {"status":"ok"}
```

### 2. Check Frontend
Open http://localhost:5173 in browser - should see DigBahi login page

### 3. Check OCR (if installed)
```bash
curl http://localhost:9000/health
# Should return: {"status":"healthy","service":"Tesseract OCR"}
```

---

## Common Issues

### "Module not found" errors
- **Solution:** Make sure virtual environment is activated and dependencies installed

### "Port already in use"
- **Solution:** Stop other services or change ports in config

### "Permission denied" on scripts
- **Solution:** `chmod +x start.sh stop.sh`

### WhatsApp features not working
- **Solution:** Check backend/.env file has correct credentials

---

## Next Steps

1. ✅ Application should be running
2. ✅ Login with demo credentials (demo/1234)
3. ✅ Test features
4. ✅ Report any issues

---

## Need Help?

- Check README.md for detailed documentation
- Check WHATSAPP_INTEGRATION.md for WhatsApp setup
- Check backend/README.md for backend details

---

**Setup Time:** ~10-15 minutes (first time)  
**Subsequent Starts:** ~5 seconds (using npm start)

