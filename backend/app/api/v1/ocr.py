from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pytesseract
from typing import Optional
import base64
import io
from PIL import Image
import os
import logging
from google.cloud import vision

logger = logging.getLogger("ocr-api")

router = APIRouter()

import json

# Try to find credentials relative to project root or use env var
CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS_JSON")
CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "config/vision-key.json")

if CREDENTIALS_JSON:
    try:
        import tempfile
        import atexit
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tf:
            tf.write(CREDENTIALS_JSON)
            temp_creds_path = tf.name
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_creds_path
        atexit.register(lambda: os.path.exists(temp_creds_path) and os.unlink(temp_creds_path))
        logger.info("Using Google Vision credentials from environment variable")
    except Exception as e:
        logger.error(f"Failed to create temporary credentials file from environment: {e}")
elif os.path.exists(CREDENTIALS_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = CREDENTIALS_PATH
    logger.info(f"Using Google Vision credentials at {CREDENTIALS_PATH}")
else:
    logger.warning(f"Google Vision credentials not found at {CREDENTIALS_PATH} or GOOGLE_CREDENTIALS_JSON environment variable")

try:
    vision_client = vision.ImageAnnotatorClient()
    VISION_ENABLED = True
except Exception as e:
    logger.error(f"Failed to initialize Google Cloud Vision client: {e}")
    VISION_ENABLED = False

class OCRRequest(BaseModel):
    image_base64: str
    target_field: Optional[str] = None

@router.post("/recognize")
def recognize(req: OCRRequest):
    try:
        img_bytes = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")
    try:
        text = pytesseract.image_to_string(image, lang='eng+hin')
        data = pytesseract.image_to_data(image, lang='eng+hin', output_type=pytesseract.Output.DICT)
        confidences = [float(conf) for conf in data['conf'] if conf != '-1']
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        return {"text": text.strip(), "confidence": avg_conf / 100.0}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}")

@router.post("/recognize-cloud")
def recognize_cloud(req: OCRRequest):
    if not VISION_ENABLED:
        raise HTTPException(status_code=501, detail="Google Cloud Vision is not configured on this server.")
    try:
        img_bytes = base64.b64decode(req.image_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")
    try:
        image = vision.Image(content=img_bytes)
        response = vision_client.document_text_detection(image=image)
        if response.error.message:
            raise Exception(response.error.message)
        annotation = response.full_text_annotation
        if not annotation:
            return {"text": "", "confidence": 0.0}
        text = annotation.text
        confidences = []
        for page in annotation.pages:
            if hasattr(page, 'confidence') and page.confidence:
                confidences.append(page.confidence)
        avg_conf = sum(confidences) / len(confidences) if confidences else 1.0
        return {"text": text.strip(), "confidence": avg_conf}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cloud OCR processing failed: {exc}")
