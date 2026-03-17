from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pytesseract
from typing import Optional, List
import base64
import io
from PIL import Image
import numpy as np
import os
import logging
from google.cloud import vision
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocr-service")

# Configurations from environment
CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "config/vision-key.json")
# Ensure the path is absolute if it's relative to the service directory
if not os.path.isabs(CREDENTIALS_PATH):
    CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), CREDENTIALS_PATH)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Ensure Google Cloud Vision credentials are set
if os.path.exists(CREDENTIALS_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = CREDENTIALS_PATH
    logger.info(f"Using Google Vision credentials at {CREDENTIALS_PATH}")
else:
    logger.warning(f"Google Vision credentials not found at {CREDENTIALS_PATH}")

try:
    vision_client = vision.ImageAnnotatorClient()
    VISION_ENABLED = True
    logger.info("Google Cloud Vision client initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize Google Cloud Vision client: {e}")
    VISION_ENABLED = False


app = FastAPI(title="DigBahi Tesseract OCR Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Tesseract OCR", "vision_enabled": VISION_ENABLED}


@app.get("/")
def root():
    return {
        "service": "DigBahi Tesseract OCR Service",
        "engine": "Tesseract 5.x + Google Cloud Vision",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "recognize": "/recognize (POST) - Tesseract Legacy",
            "recognize-cloud": "/recognize-cloud (POST) - Google Cloud Vision (Recommended)",
            "docs": "/docs"
        }
    }


class OCRRequest(BaseModel):
    image_base64: str
    target_field: Optional[str] = None


@app.post("/recognize")
def recognize(req: OCRRequest):
    try:
        # Decode base64 image
        img_bytes = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as exc:
        logger.error(f"Invalid image data: {exc}")
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")

    try:
        # Perform OCR using Tesseract
        text = pytesseract.image_to_string(image, lang='eng+hin')
        
        # Get confidence data
        data = pytesseract.image_to_data(image, lang='eng+hin', output_type=pytesseract.Output.DICT)
        confidences = [float(conf) for conf in data['conf'] if conf != '-1']
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        
        return {
            "text": text.strip(),
            "confidence": avg_conf / 100.0  # Normalize to 0-1 range
        }
    except Exception as exc:
        logger.error(f"OCR processing (Tesseract) failed: {exc}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}")


@app.post("/recognize-cloud")
def recognize_cloud(req: OCRRequest):
    if not VISION_ENABLED:
        raise HTTPException(status_code=501, detail="Google Cloud Vision is not configured on this server.")
    
    try:
        # Decode base64 image
        img_bytes = base64.b64decode(req.image_base64)
    except Exception as exc:
        logger.error(f"Invalid image data for Cloud OCR: {exc}")
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")

    try:
        image = vision.Image(content=img_bytes)
        
        # We use DOCUMENT_TEXT_DETECTION because it is optimized for dense text and documents
        response = vision_client.document_text_detection(image=image)
        
        if response.error.message:
            raise Exception(response.error.message)
            
        annotation = response.full_text_annotation
        if not annotation:
            return {"text": "", "confidence": 0.0}
            
        # Extract text
        text = annotation.text
        
        # Calculate a rough confidence score
        confidences = []
        for page in annotation.pages:
            if hasattr(page, 'confidence') and page.confidence:
                confidences.append(page.confidence)
                
        avg_conf = sum(confidences) / len(confidences) if confidences else 1.0
        
        return {
            "text": text.strip(),
            "confidence": avg_conf
        }
    except Exception as exc:
        logger.error(f"Google Cloud Vision error: {exc}")
        raise HTTPException(status_code=500, detail=f"Cloud OCR processing failed: {exc}")
