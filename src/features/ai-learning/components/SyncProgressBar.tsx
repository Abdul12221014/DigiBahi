import React from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
interface SyncProgressBarProps {
  status: 'idle' | 'uploading' | 'downloading' | 'completed' | 'error';
  progress: number;
  message: string;
}

export function SyncProgressBar({ status, progress, message }: SyncProgressBarProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'uploading': case 'downloading': return 'bg-blue-500';
      default: return 'bg-gray-300';
    }
  };

  const getTextColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'uploading': case 'downloading': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card className="p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className={getTextColor(status)}>{message}</span>
          <span className="text-gray-500">{progress}%</span>
        </div>
        
        <Progress 
          value={progress} 
          className="h-2"
        />
        
        <div className={`h-1 rounded-full ${getStatusColor(status)}`} 
             style={{ width: `${progress}%` }} />
      </div>
    </Card>
  );
}
