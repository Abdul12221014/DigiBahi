// Paper templates for different ledger formats
import { LedgerFormatId } from '@/features/ledger-formats';

export interface PaperTemplate {
  id: LedgerFormatId;
  name: string;
  backgroundColor: string;
  lineColor: string;
  drawBackground: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

// Traditional Khata Book - Realistic notebook paper
const traditionalKhata: PaperTemplate = {
  id: 'traditional-khata',
  name: 'Traditional Khata Book',
  backgroundColor: '#fdfbf7', // Slightly warmer/realistic paper color
  lineColor: '#cbd5e1', // Slate-300 for lines
  drawBackground: (ctx, width, height) => {
    // Fill background
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, width, height);

    // Draw horizontal lines (blue-ish like real notebook)
    ctx.strokeStyle = '#94a3b8'; // Slate-400
    ctx.lineWidth = 1;
    const lineSpacing = 40;

    // Top margin line (Red)
    const topMargin = 60;

    for (let y = topMargin; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw vertical columns
    const col1 = width * 0.15; // Date column
    const col2 = width * 0.40; // Party column
    const col3 = width * 0.70; // Details column

    // Vertical lines (Red for margin/columns)
    ctx.strokeStyle = '#f87171'; // Red-400
    ctx.lineWidth = 1.5; // Slightly thicker

    [col1, col2, col3].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });

    // Add column headers at top
    ctx.fillStyle = '#ef4444'; // Red text
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Date', 10, 35);
    ctx.fillText('Party Name', col1 + 10, 35);
    ctx.fillText('Details', col2 + 10, 35);
    ctx.fillText('Amount', col3 + 10, 35);
  }
};

// Cash Book - Two column format
const cashBook: PaperTemplate = {
  id: 'cash-book',
  name: 'Cash Book',
  backgroundColor: '#fffbeb',
  lineColor: '#fed7aa',
  drawBackground: (ctx, width, height) => {
    // Fill background
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(0, 0, width, height);

    // Draw center line (divides Cash In / Cash Out)
    const centerX = width / 2;
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Draw horizontal lines
    ctx.strokeStyle = '#fed7aa';
    ctx.lineWidth = 1;
    const lineSpacing = 40;

    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Add headers
    ctx.fillStyle = '#9a3412';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Cash In (Receipt)', 10, 20);
    ctx.fillText('Cash Out (Payment)', centerX + 10, 20);
  }
};

// Double Entry - Jama/Kharcha
const doubleEntry: PaperTemplate = {
  id: 'double-entry',
  name: 'Double Entry',
  backgroundColor: '#f0fdf4',
  lineColor: '#bbf7d0',
  drawBackground: (ctx, width, height) => {
    // Fill background
    ctx.fillStyle = '#f0fdf4';
    ctx.fillRect(0, 0, width, height);

    // Draw columns: Date | Jama | Kharcha
    const col1 = width * 0.25; // Date column
    const col2 = width * 0.60; // Jama column

    ctx.strokeStyle = '#bbf7d0';
    ctx.lineWidth = 1;

    // Vertical lines
    [col1, col2].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });

    // Horizontal lines
    const lineSpacing = 40;
    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Add headers
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Date', 10, 20);
    ctx.fillText('Jama (Credit)', col1 + 10, 20);
    ctx.fillText('Kharcha (Debit)', col2 + 10, 20);
  }
};

// Party Ledger - Customer accounts
const partyLedger: PaperTemplate = {
  id: 'party-ledger',
  name: 'Party Ledger',
  backgroundColor: '#f0f9ff',
  lineColor: '#bae6fd',
  drawBackground: (ctx, width, height) => {
    // Fill background
    ctx.fillStyle = '#f0f9ff';
    ctx.fillRect(0, 0, width, height);

    // Draw columns: Date | Party | Given | Received | Balance
    const col1 = width * 0.15; // Date
    const col2 = width * 0.35; // Party
    const col3 = width * 0.55; // Given
    const col4 = width * 0.75; // Received

    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1;

    // Vertical lines
    [col1, col2, col3, col4].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });

    // Horizontal lines
    const lineSpacing = 40;
    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Add headers
    ctx.fillStyle = '#075985';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Date', 10, 20);
    ctx.fillText('Party', col1 + 10, 20);
    ctx.fillText('Given', col2 + 10, 20);
    ctx.fillText('Received', col3 + 10, 20);
    ctx.fillText('Balance', col4 + 10, 20);
  }
};

// Plain paper
const plainPaper: PaperTemplate = {
  id: 'traditional-khata',
  name: 'Plain Paper',
  backgroundColor: '#ffffff',
  lineColor: '#e5e5e5',
  drawBackground: (ctx, width, height) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
};

export const PAPER_TEMPLATES: Record<LedgerFormatId, PaperTemplate> = {
  'traditional-khata': traditionalKhata,
  'cash-book': cashBook,
  'double-entry': doubleEntry,
  'party-ledger': partyLedger,
  'day-book': traditionalKhata, // Use same as traditional
  'stock-register': traditionalKhata, // Use same as traditional
  'modern-minimal': plainPaper,
  'hybrid-mix': traditionalKhata
};

export const getPaperTemplate = (formatId: LedgerFormatId): PaperTemplate => {
  return PAPER_TEMPLATES[formatId] || traditionalKhata;
};

// --- V2 API Compatibility Layer ---

export type TemplateId = LedgerFormatId | 'blank' | 'lined' | 'columnar';
export interface TemplateOptions {
  showDate?: boolean;
  showHeader?: boolean;
  lineHeight?: number;
  lineSpacing?: number;
  margin?: number;
  columnCount?: number;
  color?: string;
}
export const defaultTemplateId: TemplateId = 'traditional-khata';

export function getTemplateName(id: TemplateId): string {
  // Map simplified IDs to LedgerFormatIds
  if (id === 'blank') return 'Plain Paper';
  if (id === 'lined') return 'Lined Paper';
  if (id === 'columnar') return 'Traditional Khata';

  return PAPER_TEMPLATES[id as LedgerFormatId]?.name || 'Unknown Template';
}

export function getTemplateDescription(id: TemplateId): string {
  if (id === 'blank') return 'Clean canvas for freehand drawing';
  if (id === 'lined') return 'Standard ruled lines';
  if (id === 'columnar') return 'Classic accounting columns';
  return 'Accounting template';
}

export function drawTemplate(
  ctx: CanvasRenderingContext2D,
  id: TemplateId,
  width: number,
  height: number,
  options?: TemplateOptions
): void {
  // Map simplified IDs to internal templates
  let templateKey: LedgerFormatId = 'traditional-khata';

  if (id === 'blank' || id === 'modern-minimal') templateKey = 'modern-minimal';
  else if (id === 'lined') templateKey = 'traditional-khata'; // Fallback for now, or create specific
  else if (id === 'columnar') templateKey = 'traditional-khata';
  else if (PAPER_TEMPLATES[id as LedgerFormatId]) templateKey = id as LedgerFormatId;

  const template = PAPER_TEMPLATES[templateKey];
  if (template) {
    template.drawBackground(ctx, width, height);
  }
}

export function getTemplateThumbnail(
  id: TemplateId,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawTemplate(ctx, id, width, height);
  }
  return canvas;
}

