#!/bin/bash

# DigBahi - One-Click Installation Script
# Installs all dependencies for Frontend, Backend, and OCR Service

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DigBahi - One-Click Installation   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+ from https://nodejs.org/${NC}"
    exit 1
fi
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18+. Current: $(node --version)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm --version)${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 not found. Please install Python 3.8+${NC}"
    exit 1
fi
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]); then
    echo -e "${RED}❌ Python version must be 3.8+. Current: $(python3 --version)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python $(python3 --version)${NC}"

echo ""
echo -e "${BLUE}🚀 Starting installation...${NC}"
echo ""

# 1. Install Frontend Dependencies
echo -e "${YELLOW}📦 Step 1/3: Installing Frontend dependencies (npm)...${NC}"
if [ -d "node_modules" ]; then
    echo -e "${BLUE}   node_modules exists, running npm install to update...${NC}"
fi
npm install
echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
echo ""

# 2. Install Backend Dependencies
echo -e "${YELLOW}📦 Step 2/3: Installing Backend dependencies (Python)...${NC}"
cd backend

if [ ! -d "venv" ]; then
    echo -e "${BLUE}   Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

echo -e "${BLUE}   Activating virtual environment...${NC}"
source venv/bin/activate

echo -e "${BLUE}   Installing Python packages...${NC}"
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

echo -e "${GREEN}✅ Backend dependencies installed${NC}"
deactivate
cd "$SCRIPT_DIR"
echo ""

# 3. Tesseract OCR Service (Installed via system package manager)
echo -e "${YELLOW}📦 Step 3/3: Tesseract OCR Service${NC}"
echo -e "${BLUE}   Tesseract OCR is installed via system package manager (apt/brew)${NC}"
echo -e "${BLUE}   The OCR service uses the system-installed Tesseract${NC}"
echo -e "${GREEN}✅ Tesseract OCR service configured${NC}"

# Legacy OCR cleanup
# The project now uses Tesseract OCR instead
# Keeping this commented for reference:
# cd backend/services/tesseract_ocr
# python3 -m venv venv
# source venv/bin/activate
# pip install -r requirements.txt

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Installation Complete!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo -e "   1. Copy environment files (optional):"
echo -e "      ${YELLOW}cp .env.example .env${NC}"
echo -e "      ${YELLOW}cp backend/.env.example backend/.env${NC}"
echo ""
echo -e "   2. Start the application:"
echo -e "      ${YELLOW}npm start${NC}"
echo -e "      ${YELLOW}# OR${NC}"
echo -e "      ${YELLOW}./start.sh${NC}"
echo ""
echo -e "   3. Open in browser:"
echo -e "      ${YELLOW}http://localhost:5173${NC}"
echo ""
echo -e "${BLUE}📚 For detailed setup instructions, see:${NC}"
echo -e "   ${YELLOW}SETUP_GUIDE.md${NC}"
echo ""

