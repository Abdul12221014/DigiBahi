# Thermal Printer Hardware Installation Guide
**For: DigBahi Accounting System on Raspberry Pi**

---

## 📋 Required Hardware
- Raspberry Pi 4 or 5 (running the DigBahi application)
- **58mm Thermal Receipt Printer** with serial/UART interface
- 3x Female-to-Female jumper wires
- Power supply for the thermal printer (usually 12V DC adapter)

---

## 🔌 Step 1: Physical Wiring

### GPIO Pin Connections (Raspberry Pi)
Connect the thermal printer to the Raspberry Pi GPIO header as follows:

| Printer Pin | → | Raspberry Pi GPIO | Pin # | Wire Color (typical) |
|-------------|---|-------------------|-------|---------------------|
| **TX** (Transmit) | → | **RX** (GPIO 15) | Pin 10 | White/Green |
| **RX** (Receive) | → | **TX** (GPIO 14) | Pin 8 | Yellow/Blue |
| **GND** (Ground) | → | **GND** | Pin 6, 9, 14, 20, 25, 30, 34, or 39 | Black |

### ⚠️ Important Notes:
- **DO NOT connect VCC/5V** from printer to Pi — the printer has its own power supply
- Only connect **TX, RX, and GND** wires
- Cross the TX/RX: Printer TX → Pi RX, Printer RX → Pi TX

### Visual Guide:
```
Raspberry Pi GPIO Header (Top View)
┌─────────────────────────┐
│ 3V3 ●  5V ●             │ Pin 1-2
│ GP2 ●  5V ●             │ Pin 3-4
│ GP3 ●  GND ●  ← GND     │ Pin 5-6
│ GP4 ●  TXD ●  ← Printer RX (Yellow)  │ Pin 7-8
│ GND ●  RXD ●  ← Printer TX (White)   │ Pin 9-10
│ ... (rest of pins) ...  │
└─────────────────────────┘
```

---

## ⚙️ Step 2: Enable UART on Raspberry Pi

### Method 1: Using `raspi-config` (Recommended)
```bash
sudo raspi-config
```

1. Select **"Interface Options"**
2. Select **"Serial Port"**
3. **Login shell over serial?** → Select **"No"**
4. **Serial port hardware enabled?** → Select **"Yes"**
5. Exit and reboot: `sudo reboot`

### Method 2: Manual Configuration
Edit `/boot/config.txt`:
```bash
sudo nano /boot/config.txt
```

Add these lines at the end:
```
enable_uart=1
dtoverlay=disable-bt
```

Save and reboot:
```bash
sudo reboot
```

---

## 🧪 Step 3: Test Serial Connection

After reboot, verify the serial port exists:
```bash
ls -l /dev/serial0
```

**Expected output:**
```
lrwxrwxrwx 1 root root 5 Feb 10 10:00 /dev/serial0 -> ttyAMA0
```

If the file doesn't exist, UART is not enabled — repeat Step 2.

---

## 📝 Step 4: Configure Application

Create environment file for the backend:
```bash
cd ~/DIGBAHI_ACCOUNTING/digi-bahi-ink/backend
nano .env
```

Add these lines:
```
PRINTER_PORT=/dev/serial0
PRINTER_BAUDRATE=9600
```

**Baud Rate Options:**
- Most thermal printers use **9600** (default)
- Some models use **19200** or **115200**
- Check your printer's manual for the correct baud rate

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

---

## ✅ Step 5: Test Printing

### Start the Application
```bash
cd ~/DIGBAHI_ACCOUNTING/digi-bahi-ink
./start.sh
```

Wait for all services to start (≈10 seconds).

### Check Printer Status
Open browser to `http://localhost:5173` and navigate to **Reports**.

You should see:
- 🟢 **"Printer Online (/dev/serial0)"** — ✅ Success!
- 🔴 **"Printer Offline"** — ❌ Connection problem

### Test Print
Click **"Daily Report (58mm)"** button. A popup should appear and the printer should start printing.

---

## 🔧 Troubleshooting

### Issue 1: Printer Status Shows "Offline"

**Check 1: Verify wiring**
```bash
# Test if data is being sent to serial port
echo "Test" > /dev/serial0
```
Watch the printer — LED should blink or flicker.

**Check 2: Check permissions**
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER
# Log out and back in for changes to take effect
```

**Check 3: Verify baud rate**
Try different baud rates in `.env`:
```
PRINTER_BAUDRATE=19200
```
Then restart: `./stop.sh && ./start.sh`

### Issue 2: Garbage Characters Printing

**Cause:** Wrong baud rate

**Solution:** Try these common values in `backend/.env`:
- `PRINTER_BAUDRATE=9600`
- `PRINTER_BAUDRATE=19200`
- `PRINTER_BAUDRATE=115200`

### Issue 3: `/dev/serial0` doesn't exist

**Cause:** UART not enabled or Bluetooth blocking

**Solution:**
```bash
# Disable Bluetooth to free up UART
sudo nano /boot/config.txt
# Add: dtoverlay=disable-bt
sudo systemctl disable hciuart
sudo reboot
```

---

## 📞 Support Checklist

Before calling for support, verify:
- [ ] Wiring is correct (TX↔RX crossed, GND connected)
- [ ] UART is enabled (`ls -l /dev/serial0` works)
- [ ] `.env` file exists with correct `PRINTER_PORT` and `PRINTER_BAUDRATE`
- [ ] Application started successfully (`./start.sh`)
- [ ] User is in `dialout` group (`groups $USER` includes "dialout")

---

## 🎯 Quick Reference Card

### Wiring
```
Printer TX  →  Pi RX (Pin 10)
Printer RX  →  Pi TX (Pin 8)
Printer GND →  Pi GND (Pin 6)
```

### Enable UART
```bash
sudo raspi-config
→ Interface → Serial → No (shell) → Yes (hardware)
sudo reboot
```

### Environment Setup
```bash
cd backend
echo "PRINTER_PORT=/dev/serial0" >> .env
echo "PRINTER_BAUDRATE=9600" >> .env
```

### Start Application
```bash
./start.sh
# Open: http://localhost:5173
# Go to Reports → Check "Printer Online"
```

---

**Document Version:** 1.0  
**Last Updated:** February 10, 2026  
**For Questions:** Contact software team
