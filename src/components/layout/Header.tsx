import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PenTool, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useOnline from '@/hooks/useOnline';
import useSyncStatus from '@/hooks/useSyncStatus';

interface Props { onOpenPen: () => void }

const Header: React.FC<Props> = ({ onOpenPen }) => {
  const { i18n } = useTranslation();
  const online = useOnline();
  const status = useSyncStatus();

  const indicator = !online ? (
    <span className="text-red-600 text-sm">Offline</span>
  ) : status === 'updating' ? (
    <span className="text-amber-600 text-sm">Syncing…</span>
  ) : (
    <span className="text-green-600 text-sm">Synced</span>
  );

  return (
    <header className="border-b shadow-medium bg-card sticky top-0 z-50 backdrop-blur-sm bg-card/95">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 animate-slide-in">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-medium overflow-hidden">
              <img 
                src="/digbahi-logo.png" 
                alt="DigBahi Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">DigBahi</h1>
              <p className="text-xs text-muted-foreground">Professional Accounting</p>
            </div>
          </div>
          <div className="flex items-center gap-4 animate-fade-in">
            <div>{indicator}</div>
            <Select value={i18n.language} onValueChange={(lang) => i18n.changeLanguage(lang)}>
              <SelectTrigger className="w-32 touch-friendly hover-lift border-primary/20">
                <Globe className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">हिन्दी</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={onOpenPen} className="touch-friendly bg-primary hover:bg-primary/90 text-white transition-smooth">
              <PenTool className="w-4 h-4 mr-2" />
              Pen Input
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;


