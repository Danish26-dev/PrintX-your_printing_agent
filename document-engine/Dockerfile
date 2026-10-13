# PrintX Document Engine
# Python service for deterministic document conversion + editing.
# LibreOffice is installed so DOCX -> PDF conversion works in production.

FROM python:3.12-slim

# System dependencies:
#  - libreoffice-writer: headless DOCX <-> PDF conversion (soffice)
#  - fonts: so converted PDFs render text correctly
#  - libgl1 / libglib: runtime libs required by opencv (pulled in by pdf2docx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-dejavu \
    fonts-liberation \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY app ./app

ENV PORT=5001 \
    WORK_DIR=/app/_work \
    SOFFICE_PATH=/usr/bin/soffice \
    PYTHONUNBUFFERED=1

EXPOSE 5001

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
