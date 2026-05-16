import { GSTDashboard } from '@/features/gst';

// Company GSTIN and state are stored in user profile; these defaults
// are shown until the user configures their GST settings.
const PLACEHOLDER_GSTIN = '29AAAAA0000A1Z5';
const PLACEHOLDER_STATE = 29;

export default function GSTReports() {
  return (
    <GSTDashboard
      gstin={PLACEHOLDER_GSTIN}
      companyStateCode={PLACEHOLDER_STATE}
    />
  );
}
