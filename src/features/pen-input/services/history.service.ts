// Command stack for undo/redo
export type CommandAction = 'draw' | 'shape' | 'ocr' | 'ocr-correction' | 'clear';
export interface Command { 
  do(): void; 
  undo(): void; 
  action?: CommandAction; 
  metadata?: Record<string, unknown>;
}

export class History {
  private stack: Command[] = [];
  private redoStack: Command[] = [];
  private limit = 50;

  push(cmd: Command) {
    cmd.do();
    this.stack.push(cmd);
    this.redoStack = [];
    if (this.stack.length > this.limit) this.stack.shift();
  }

  undo() {
    const cmd = this.stack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do();
    this.stack.push(cmd);
  }

  clear() {
    this.stack = [];
    this.redoStack = [];
  }
}

export default History;

/**
 * Factory: Create OCR Correction Command
 * 
 * Encapsulates OCR recognition + user corrections as a single undoable action.
 */
export function createOCRCorrectionCommand(
  results: Array<{ id: string; text: string; box: { x: number; y: number; width: number; height: number } }>,
  onApply: (text: string) => void,
  onRevert: () => void
): Command {
  const consolidatedText = results.map(r => r.text).join(' ');
  
  return {
    action: 'ocr-correction',
    metadata: {
      boxes: results.length,
      text: consolidatedText,
      timestamp: Date.now()
    },
    do() {
      onApply(consolidatedText);
    },
    undo() {
      onRevert();
    }
  };
}
