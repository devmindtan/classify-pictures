"""Localens private GPU classifier. Binds loopback only; reached through an SSH tunnel."""

from __future__ import annotations

import asyncio
import io
import os
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from transformers import pipeline

MODEL_ID = os.environ.get("LOCALENS_MODEL", "google/siglip-base-patch16-224")
MAX_BODY_BYTES = 25 * 1024 * 1024
MAX_LABELS = 24
Image.MAX_IMAGE_PIXELS = 50_000_000

classifier = None
inference_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    global classifier
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the GPU classifier")
    classifier = pipeline(
        task="zero-shot-image-classification",
        model=MODEL_ID,
        device=0,
        dtype=torch.float16,
    )
    warmup = Image.new("RGB", (224, 224), color=(127, 127, 127))
    classifier(warmup, candidate_labels=["a photograph", "a screenshot"])
    yield
    classifier = None
    torch.cuda.empty_cache()


app = FastAPI(title="Localens GPU", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(127\.0\.0\.1|localhost):\d+$",
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


@app.get("/health")
def health():
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    return {
        "status": "ok" if classifier is not None else "starting",
        "model": MODEL_ID,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "gpu": gpu_name,
    }


def run_classification(image: Image.Image, labels: list[str]):
    assert classifier is not None
    predictions = classifier(image, candidate_labels=labels)
    # SigLIP returns independent sigmoid probabilities. For this closed album set,
    # normalize them so the UI gets a useful relative confidence like CLIP softmax.
    total = sum(max(float(item["score"]), 0.0) for item in predictions)
    return [
        {
            "label": str(item["label"]),
            "score": (max(float(item["score"]), 0.0) / total) if total > 0 else 0.0,
        }
        for item in predictions[: min(5, len(predictions))]
    ]


@app.post("/classify")
async def classify(request: Request, label: list[str] = Query(...)):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Model is still loading")
    labels = [value.strip() for value in label if 1 <= len(value.strip()) <= 160]
    if not labels or len(labels) > MAX_LABELS:
        raise HTTPException(status_code=400, detail="Invalid candidate labels")
    declared_size = int(request.headers.get("content-length", "0") or 0)
    if declared_size > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large")
    body = await request.body()
    if not body or len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Image is empty or too large")
    try:
        with Image.open(io.BytesIO(body)) as opened:
            opened.load()
            image = ImageOps.exif_transpose(opened).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=415, detail="Unsupported or unsafe image") from error
    async with inference_lock:
        predictions = await asyncio.to_thread(run_classification, image, labels)
    return {"model": MODEL_ID, "device": "cuda", "predictions": predictions}
