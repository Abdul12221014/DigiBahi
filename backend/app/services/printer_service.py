import logging
import serial
import os
import base64
from typing import Optional

logger = logging.getLogger(__name__)

class SerialPrinter:
    def __init__(self):
        self.port = os.getenv("PRINTER_PORT", "/dev/serial0")
        self.baudrate = int(os.getenv("PRINTER_BAUDRATE", "9600"))
        self.timeout = 1
        self._connection: Optional[serial.Serial] = None

    def _port_exists(self) -> bool:
        """Check if the serial port physically exists on this machine."""
        return os.path.exists(self.port)

    def connect(self) -> bool:
        """Establish connection to the serial port."""
        if not self._port_exists():
            return False
        try:
            if self._connection and self._connection.is_open:
                return True

            self._connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout
            )
            return True
        except serial.SerialException as e:
            logger.warning("Failed to connect to printer on %s: %s", self.port, e)
            return False

    def print_raw(self, base64_data: str) -> bool:
        """Decode base64 data and send bytes to the printer."""
        if not self._port_exists():
            logger.info("Serial port %s not available — cloud deployment, WebUSB handles printing", self.port)
            return False
        try:
            if not self.connect():
                return False

            data = base64.b64decode(base64_data)
            if self._connection:
                self._connection.write(data)
                return True
            return False
        except Exception as e:
            logger.error("Print error: %s", e)
            return False

    def status(self) -> dict:
        """Check printer connection status."""
        # On cloud environments (e.g. Render), the serial port does not exist.
        # Printing is handled client-side via WebUSB in that case.
        is_pi = self._port_exists()

        if not is_pi:
            return {
                "status": "offline",
                "port": self.port,
                "platform": "cloud"
            }

        is_connected = False
        try:
            if self._connection and self._connection.is_open:
                # Already connected — reuse existing connection
                is_connected = True
            else:
                # Quick non-blocking probe
                with serial.Serial(self.port, self.baudrate, timeout=0.1):
                    is_connected = True
        except Exception:
            is_connected = False

        return {
            "status": "online" if is_connected else "offline",
            "port": self.port,
            "platform": "pi"
        }

printer_service = SerialPrinter()
