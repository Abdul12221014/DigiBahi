/**
 * USB Printer Service using WebUSB API
 * Handles connection, data transfer, and device management.
 */

export class UsbPrinterService {
    private device: USBDevice | null = null;
    private interfaceNumber: number = 0;
    private endpointOut: number = 1;

    /**
     * Request and connect to a USB printer.
     * Shows the browser's USB device picker (requires user gesture).
     */
    async connect(): Promise<boolean> {
        try {
            // Filters for common printer classes (0x07 = Printer)
            this.device = await navigator.usb.requestDevice({
                filters: [{ classCode: 7 }]
            });
            return await this._openDevice(this.device);
        } catch (error) {
            console.error('USB Printer Connection Failed:', error);
            return false;
        }
    }

    /**
     * Silently reconnect to a previously paired USB printer.
     * Uses getDevices() — no user dialog. Safe to call on page load.
     * Returns true if reconnected, false if no paired device found.
     */
    async reconnect(): Promise<boolean> {
        try {
            if (!navigator.usb) return false;
            const devices = await navigator.usb.getDevices();

            // Prefer printer-class devices (interfaceClass 7), fallback to first paired device
            const printerDevice = devices.find(d =>
                d.configurations.some(cfg =>
                    cfg.interfaces.some(iface =>
                        iface.alternates.some(alt => alt.interfaceClass === 7)
                    )
                )
            ) ?? devices[0];

            if (!printerDevice) return false;
            this.device = printerDevice;
            return await this._openDevice(this.device);
        } catch (error) {
            console.error('USB Printer Reconnect Failed:', error);
            return false;
        }
    }

    /**
     * Internal: open device, select config, claim interface, find bulk OUT endpoint.
     */
    private async _openDevice(device: USBDevice): Promise<boolean> {
        try {
            if (!device.opened) {
                await device.open();
            }

            if (device.configuration === null) {
                await device.selectConfiguration(1);
            }

            // Find interface with a bulk OUT endpoint
            const interfaces = device.configuration?.interfaces || [];
            const printerInterface = interfaces.find(i =>
                i.alternates[0].endpoints.some(e => e.direction === 'out' && e.type === 'bulk')
            );

            if (!printerInterface) {
                throw new Error('No compatible bulk OUT interface found on this USB device.');
            }

            this.interfaceNumber = printerInterface.interfaceNumber;

            const endpoint = printerInterface.alternates[0].endpoints.find(
                e => e.direction === 'out' && e.type === 'bulk'
            );
            if (endpoint) {
                this.endpointOut = endpoint.endpointNumber;
            }

            await device.claimInterface(this.interfaceNumber);
            return true;
        } catch (error) {
            console.error('USB Device Open Failed:', error);
            this.device = null;
            return false;
        }
    }

    async print(data: Uint8Array): Promise<boolean> {
        if (!this.device || !this.device.opened) {
            console.error('Printer not connected');
            return false;
        }
        try {
            await this.device.transferOut(this.endpointOut, data as unknown as BufferSource);
            return true;
        } catch (error) {
            console.error('Print Failed:', error);
            return false;
        }
    }

    async disconnect() {
        if (this.device) {
            try {
                await this.device.releaseInterface(this.interfaceNumber);
                await this.device.close();
            } catch (e) {
                console.warn('Error closing USB device:', e);
            }
            this.device = null;
        }
    }

    isConnected(): boolean {
        return this.device !== null && this.device.opened;
    }
}

export const usbPrinter = new UsbPrinterService();
