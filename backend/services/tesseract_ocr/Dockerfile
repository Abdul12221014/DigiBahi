FROM python:3.9-slim

WORKDIR /app

# Install Tesseract and required languages
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-hin \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose port
EXPOSE 9000

# Health check using dynamic port
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD sh -c "curl -f http://localhost:${PORT:-9000}/health || exit 1"

CMD ["sh", "-c", "uvicorn ocr_service:app --host 0.0.0.0 --port ${PORT:-9000}"]
