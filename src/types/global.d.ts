export { };

declare global {
    interface Navigator {
        usb: {
            requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
            getDevices(): Promise<USBDevice[]>;
        };
    }

    interface USBDevice {
        opened: boolean;
        configuration: {
            interfaces: {
                interfaceNumber: number;
                alternates: {
                    endpoints: {
                        direction: 'in' | 'out';
                        type: 'bulk' | 'interrupt' | 'isochronous';
                        endpointNumber: number;
                    }[];
                }[];
            }[];
        } | null;
        open(): Promise<void>;
        selectConfiguration(configurationValue: number): Promise<void>;
        claimInterface(interfaceNumber: number): Promise<void>;
        transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
        close(): Promise<void>;
    }

    interface USBOutTransferResult {
        bytesWritten: number;
        status: 'ok' | 'stall' | 'babble';
    }
}
