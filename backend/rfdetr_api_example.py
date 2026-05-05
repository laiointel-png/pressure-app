"""Example RF-DETR detection API for the Pressure prototype.

Install:
    python3 -m venv .venv
    source .venv/bin/activate
    pip install fastapi uvicorn pillow inference

Run:
    uvicorn backend.rfdetr_api_example:app --reload --port 8000

Connect the frontend in DevTools:
    localStorage.setItem("pressureVisionEndpoint", "http://localhost:8000/api/rfdetr/detect")

This example uses Roboflow Inference's RF-DETR model alias. For custom trained
exercise/equipment classes, replace "rfdetr-medium" with your deployed model id.
"""

from __future__ import annotations

import base64
from io import BytesIO
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

try:
    from inference import get_model
except ImportError:  # Keeps the module importable before dependencies are installed.
    get_model = None


class DetectionRequest(BaseModel):
    image: str
    exercise: str | None = None
    confidence: float = 0.45


app = FastAPI(title="Pressure RF-DETR Vision API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
)

model = get_model("rfdetr-medium") if get_model else None


def decode_data_url(data_url: str) -> Image.Image:
    _, encoded = data_url.split(",", 1) if "," in data_url else ("", data_url)
    return Image.open(BytesIO(base64.b64decode(encoded))).convert("RGB")


def normalize_prediction(prediction: Any, image: Image.Image) -> dict[str, Any]:
    width, height = image.size
    x = float(getattr(prediction, "x", 0))
    y = float(getattr(prediction, "y", 0))
    w = float(getattr(prediction, "width", 0))
    h = float(getattr(prediction, "height", 0))

    return {
        "label": getattr(prediction, "class_name", getattr(prediction, "class", "object")),
        "confidence": float(getattr(prediction, "confidence", 0)),
        "box": {
            "x": max(0, (x - w / 2) / width),
            "y": max(0, (y - h / 2) / height),
            "width": min(1, w / width),
            "height": min(1, h / height),
        },
    }


@app.post("/api/rfdetr/detect")
def detect(payload: DetectionRequest) -> dict[str, Any]:
    if model is None:
        return {
            "detections": [],
            "mode": "not_configured",
            "message": "Install the inference package to run RF-DETR.",
        }

    image = decode_data_url(payload.image)
    result = model.infer(image, confidence=payload.confidence)[0]
    predictions = getattr(result, "predictions", [])

    return {
        "detections": [normalize_prediction(prediction, image) for prediction in predictions],
        "exercise": payload.exercise,
        "mode": "rfdetr-medium",
    }
