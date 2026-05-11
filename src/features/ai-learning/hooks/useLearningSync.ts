import { useState, useEffect } from 'react';
import learningService from '../services/learning.service';
import type { ModelStatus, TrainingProgress, SyncStatus } from '../types';

export function useLearningSync() {
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgress>({
    status: 'idle',
    progress: 0,
    message: 'Ready to train'
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: 'idle',
    progress: 0,
    message: 'Ready to sync'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadModelStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await learningService.getModelStatus();
      setModelStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model status');
    } finally {
      setLoading(false);
    }
  };

  const trainLocally = async () => {
    try {
      setTrainingProgress({
        status: 'training',
        progress: 0,
        message: 'Starting local training...'
      });

      // Simulate training progress
      for (let i = 0; i <= 100; i += 10) {
        setTrainingProgress(prev => ({
          ...prev,
          progress: i,
          message: `Training model... ${i}%`
        }));
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const result = await learningService.trainLocalModel();
      setTrainingProgress(result);
      
      // Refresh model status after training
      await loadModelStatus();
    } catch (err) {
      setTrainingProgress({
        status: 'error',
        progress: 0,
        message: err instanceof Error ? err.message : 'Training failed'
      });
    }
  };

  const syncModel = async () => {
    try {
      setSyncStatus({
        status: 'uploading',
        progress: 0,
        message: 'Uploading model update...'
      });

      // Simulate upload progress
      for (let i = 0; i <= 100; i += 20) {
        setSyncStatus(prev => ({
          ...prev,
          progress: i,
          message: `Syncing... ${i}%`
        }));
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      setSyncStatus({
        status: 'completed',
        progress: 100,
        message: 'Model synced successfully',
        last_sync: new Date().toISOString()
      });

      // Refresh model status after sync
      await loadModelStatus();
    } catch (err) {
      setSyncStatus({
        status: 'error',
        progress: 0,
        message: err instanceof Error ? err.message : 'Sync failed'
      });
    }
  };

  useEffect(() => {
    loadModelStatus();
  }, []);

  return {
    modelStatus,
    trainingProgress,
    syncStatus,
    loading,
    error,
    trainLocally,
    syncModel,
    refreshStatus: loadModelStatus
  };
}
