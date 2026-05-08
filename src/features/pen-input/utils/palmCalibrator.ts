/**
 * Palm Rejection Calibration Utility
 * 
 * This utility helps users find optimal palm rejection settings for their device.
 * Run this in the browser console while using the pen canvas.
 */

export class PalmRejectionCalibrator {
    private _handler?: (e: PointerEvent) => void;
    private _canvas?: HTMLCanvasElement;
    private touchSamples: Array<{
        type: 'stylus' | 'palm' | 'finger';
        width: number;
        height: number;
        timestamp: number;
    }> = [];

    /**
     * Start collecting touch samples
     * User should:
     * 1. Make 5 stylus strokes
     * 2. Rest palm 5 times
     * 3. Make 5 finger touches
     */
    startCalibration() {
        console.log('🎯 Palm Rejection Calibration Started');
        console.log('');
        console.log('Instructions:');
        console.log('1. Make 5 strokes with your stylus');
        console.log('2. Rest your palm on the screen 5 times');
        console.log('3. Touch with your finger 5 times');
        console.log('');
        console.log('Then call: calibrator.analyzeAndRecommend()');

        this.touchSamples = [];

        // Intercept pointer events
        const canvas = document.querySelector('canvas');
        if (!canvas) {
            console.error('Canvas not found!');
            return;
        }

        const handler = (e: PointerEvent) => {
            if (e.pointerType !== 'touch') return;

            const width = e.width || 0;
            const height = e.height || 0;
            const size = Math.max(width, height);

            console.log(`Touch detected: ${size.toFixed(1)}px (width: ${width.toFixed(1)}, height: ${height.toFixed(1)})`);

            // Ask user to classify
            const type = prompt('Was this: (s)tylus, (p)alm, or (f)inger?');
            if (type === 's' || type === 'p' || type === 'f') {
                this.touchSamples.push({
                    type: type === 's' ? 'stylus' : type === 'p' ? 'palm' : 'finger',
                    width,
                    height,
                    timestamp: Date.now()
                });
                console.log(`✅ Recorded as ${type === 's' ? 'stylus' : type === 'p' ? 'palm' : 'finger'} (${this.touchSamples.length} samples)`);
            }
        };

        canvas.addEventListener('pointerdown', handler);

        // Store handler for cleanup
        this._handler = handler;
        this._canvas = canvas as HTMLCanvasElement;
    }

    /**
     * Stop calibration
     */
    stopCalibration() {
        const canvas = this._canvas;
        const handler = this._handler;

        if (canvas && handler) {
            canvas.removeEventListener('pointerdown', handler);
        }

        console.log('🛑 Calibration stopped');
    }

    /**
     * Analyze collected samples and recommend settings
     */
    analyzeAndRecommend() {
        if (this.touchSamples.length < 5) {
            console.warn('⚠️  Need at least 5 samples. Current:', this.touchSamples.length);
            return;
        }

        const stylusTouch = this.touchSamples.filter(s => s.type === 'stylus');
        const palmTouches = this.touchSamples.filter(s => s.type === 'palm');
        const fingerTouches = this.touchSamples.filter(s => s.type === 'finger');

        console.log('\n📊 Analysis Results:');
        console.log('='.repeat(50));

        // Stylus stats
        if (stylusTouch.length > 0) {
            const stylusSizes = stylusTouch.map(s => Math.max(s.width, s.height));
            const avgStylus = stylusSizes.reduce((a, b) => a + b, 0) / stylusSizes.length;
            const maxStylus = Math.max(...stylusSizes);
            console.log(`\n✏️  Stylus (${stylusTouch.length} samples):`);
            console.log(`   Average size: ${avgStylus.toFixed(1)}px`);
            console.log(`   Max size: ${maxStylus.toFixed(1)}px`);
        }

        // Palm stats
        if (palmTouches.length > 0) {
            const palmSizes = palmTouches.map(s => Math.max(s.width, s.height));
            const avgPalm = palmSizes.reduce((a, b) => a + b, 0) / palmSizes.length;
            const minPalm = Math.min(...palmSizes);
            console.log(`\n🖐️  Palm (${palmTouches.length} samples):`);
            console.log(`   Average size: ${avgPalm.toFixed(1)}px`);
            console.log(`   Min size: ${minPalm.toFixed(1)}px`);
        }

        // Finger stats
        if (fingerTouches.length > 0) {
            const fingerSizes = fingerTouches.map(s => Math.max(s.width, s.height));
            const avgFinger = fingerSizes.reduce((a, b) => a + b, 0) / fingerSizes.length;
            console.log(`\n👆 Finger (${fingerTouches.length} samples):`);
            console.log(`   Average size: ${avgFinger.toFixed(1)}px`);
        }

        // Calculate recommended threshold
        if (stylusTouch.length > 0 && palmTouches.length > 0) {
            const maxStylus = Math.max(...stylusTouch.map(s => Math.max(s.width, s.height)));
            const minPalm = Math.min(...palmTouches.map(s => Math.max(s.width, s.height)));

            // Threshold should be between max stylus and min palm
            const recommendedThreshold = Math.floor((maxStylus + minPalm) / 2);

            console.log('\n🎯 Recommended Settings:');
            console.log('='.repeat(50));
            console.log(`\nsizeThreshold: ${recommendedThreshold}`);
            console.log(`  (Midpoint between max stylus ${maxStylus.toFixed(1)}px and min palm ${minPalm.toFixed(1)}px)`);

            // Check for overlap
            if (maxStylus >= minPalm) {
                console.warn('\n⚠️  WARNING: Stylus and palm sizes overlap!');
                console.warn(`   Max stylus (${maxStylus.toFixed(1)}px) >= Min palm (${minPalm.toFixed(1)}px)`);
                console.warn('   Recommendation: Use temporal delay and velocity analysis');
                console.log('\nSuggested config:');
                console.log(`{
  sizeThreshold: ${recommendedThreshold},
  enableTemporalDelay: true,
  temporalDelayMs: 50,
  enableVelocityAnalysis: true,
  velocityThreshold: 3
}`);
            } else {
                console.log('\n✅ Good separation between stylus and palm!');
                console.log('   You can use size-based rejection alone.');
                console.log('\nSuggested config:');
                console.log(`{
  sizeThreshold: ${recommendedThreshold},
  enableTemporalDelay: false,  // Not needed
  enableVelocityAnalysis: false  // Not needed
}`);
            }
        }

        console.log('\n');
        this.stopCalibration();
    }

    /**
     * Export samples as JSON for debugging
     */
    exportSamples() {
        const json = JSON.stringify(this.touchSamples, null, 2);
        console.log('📋 Sample Data:');
        console.log(json);
        return json;
    }

    /**
     * Clear all samples
     */
    clear() {
        this.touchSamples = [];
        console.log('🗑️  Samples cleared');
    }
}

// Global instance for easy console access
if (typeof window !== 'undefined') {
    (window as Window & { palmCalibrator?: PalmRejectionCalibrator }).palmCalibrator = new PalmRejectionCalibrator();
    console.log('💡 Palm Rejection Calibrator loaded!');
    console.log('   Usage: palmCalibrator.startCalibration()');
}

export default PalmRejectionCalibrator;
