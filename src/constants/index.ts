// Application constants
export const APP_CONFIG = {
  name: 'DigitalMuneem',
  version: '1.0.0',
  description: 'Professional Accounting for Indian SMEs',
  author: 'DigitalMuneem Accounting Solutions',
  themeColor: '#2d7a4a',
} as const;

// Drawing constants
export const DRAWING_CONSTANTS = {
  MIN_STROKE_WIDTH: 1,
  MAX_STROKE_WIDTH: 20,
  DEFAULT_STROKE_WIDTH: 3,
  MIN_OPACITY: 0.1,
  MAX_OPACITY: 1,
  DEFAULT_OPACITY: 1,
  PALM_REJECTION_RADIUS: 20,
  PALM_REJECTION_TIME: 50,
  MIN_PRESSURE: 0.1,
  MAX_PRESSURE: 2,
} as const;

// Canvas constants
export const CANVAS_CONSTANTS = {
  DEFAULT_WIDTH: 800,
  DEFAULT_HEIGHT: 400,
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 3,
  ZOOM_STEP: 0.2,
  GRID_SPACING: 30,
} as const;

// Color palette
export const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Emerald', value: '#2E7D32' },
  { name: 'Gold', value: '#FBC02D' },
  { name: 'Marigold', value: '#F9A825' },
  { name: 'Blue', value: '#1976D2' },
  { name: 'Red', value: '#D32F2F' },
  { name: 'Purple', value: '#9C27B0' },
] as const;

// Background colors
export const BACKGROUND_COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Cream', value: '#FFF9E6' },
  { name: 'Light Blue', value: '#F0F8FF' },
  { name: 'Light Pink', value: '#FFF0F5' },
] as const;

// GST rates (Indian tax system)
export const GST_RATES = [0, 5, 12, 18, 28] as const;

// Recognition patterns
export const RECOGNITION_PATTERNS = {
  DATE: [
    /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/g,
    /(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/gi,
    /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})/gi,
  ],
  PHONE: /(\+?[\d\s-()]{10,})/g,
  EMAIL: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  AMOUNT: /(₹|Rs\.?|INR)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
} as const;

// Shape recognition thresholds
export const SHAPE_THRESHOLDS = {
  CIRCLE_CONFIDENCE: 0.7,
  RECTANGLE_ASPECT_RATIO_MIN: 0.8,
  RECTANGLE_ASPECT_RATIO_MAX: 1.2,
  ARROW_ANGLE_THRESHOLD: Math.PI / 2,
  MIN_POINTS_FOR_SHAPE: 10,
} as const;

// API endpoints
export const API_ENDPOINTS = {
  AUTH: '/api/auth',
  TRANSACTIONS: '/api/transactions',
  REPORTS: '/api/reports',
  EXPORT: '/api/export',
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'digbahi_user_preferences',
  CANVAS_SETTINGS: 'digbahi_canvas_settings',
  RECENT_TRANSACTIONS: 'digbahi_recent_transactions',
} as const;

// Animation durations (ms)
export const ANIMATIONS = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
  VERY_SLOW: 1000,
} as const;

// Touch targets (minimum size for accessibility)
export const TOUCH_TARGETS = {
  MINIMUM_SIZE: 44, // pixels
  RECOMMENDED_SIZE: 48,
} as const;
