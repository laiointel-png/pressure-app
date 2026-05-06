"""Local RF-DETR detection API for the Pressure prototype.

Install with the bundled Python 3.12 runtime:
    /Users/videomarketing1/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m venv .venv
    .venv/bin/python -m pip install fastapi uvicorn pillow rfdetr supervision

Run:
    .venv/bin/python -m uvicorn backend.rfdetr_api_example:app --port 8000

Weights are cached outside the repo by default:
    ~/.cache/pressure-rfdetr/

Connect the frontend in DevTools:
    localStorage.setItem("pressureVisionEndpoint", "http://localhost:8000/api/rfdetr/detect")

RF-DETR is a generic object detector by default. It can detect COCO objects
such as "person"; exercise quality still needs pose/keypoint logic or a
custom fine-tuned workout model on top.
"""

from __future__ import annotations

import base64
import os
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

try:
    from rfdetr import RFDETRNano, RFDETRSmall, RFDETRMedium
    from rfdetr.assets.coco_classes import COCO_CLASSES
except ImportError:
    RFDETRNano = RFDETRSmall = RFDETRMedium = None
    COCO_CLASSES = {}


MODEL_FACTORIES = {
    "nano": RFDETRNano,
    "small": RFDETRSmall,
    "medium": RFDETRMedium,
}


class DetectionRequest(BaseModel):
    image: str
    exercise: str | None = None
    confidence: float = 0.45


app = FastAPI(title="Pressure RF-DETR Vision API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def decode_data_url(data_url: str) -> Image.Image:
    _, encoded = data_url.split(",", 1) if "," in data_url else ("", data_url)
    return Image.open(BytesIO(base64.b64decode(encoded))).convert("RGB")


@lru_cache(maxsize=1)
def get_detector() -> Any:
    model_size = os.getenv("PRESSURE_RFDETR_MODEL", "nano").lower()
    factory = MODEL_FACTORIES.get(model_size, RFDETRNano)
    if factory is None:
        raise RuntimeError("Install rfdetr to enable RF-DETR inference.")

    weights_dir = Path(os.getenv("PRESSURE_RFDETR_WEIGHTS_DIR", "~/.cache/pressure-rfdetr")).expanduser()
    weights_dir.mkdir(parents=True, exist_ok=True)
    weights_path = weights_dir / f"rf-detr-{model_size}.pth"
    return factory(pretrain_weights=str(weights_path))


def normalize_detections(detections: Any, image: Image.Image) -> list[dict[str, Any]]:
    image_width, image_height = image.size
    xyxy = getattr(detections, "xyxy", [])
    confidences = getattr(detections, "confidence", [])
    class_ids = getattr(detections, "class_id", [])

    normalized: list[dict[str, Any]] = []
    for index, box in enumerate(xyxy):
        x1, y1, x2, y2 = [float(value) for value in box]
        class_id = int(class_ids[index]) if index < len(class_ids) else -1
        label = COCO_CLASSES.get(class_id, "object")
        confidence = float(confidences[index]) if index < len(confidences) else 0

        normalized.append(
            {
                "label": label,
                "confidence": confidence,
                "box": {
                    "x": max(0, x1 / image_width),
                    "y": max(0, y1 / image_height),
                    "width": min(1, max(0, (x2 - x1) / image_width)),
                    "height": min(1, max(0, (y2 - y1) / image_height)),
                },
            }
        )

    return normalized


@app.get("/api/rfdetr/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "model": os.getenv("PRESSURE_RFDETR_MODEL", "nano"),
        "rfdetr_installed": RFDETRNano is not None,
    }


@app.post("/api/rfdetr/detect")
def detect(payload: DetectionRequest) -> dict[str, Any]:
    image = decode_data_url(payload.image)

    try:
        model = get_detector()
        detections = model.predict(image, threshold=payload.confidence)
        normalized = normalize_detections(detections, image)
        mode = f"rfdetr-{os.getenv('PRESSURE_RFDETR_MODEL', 'nano')}"
        message = "RF-DETR detections returned."
    except Exception as exc:
        normalized = []
        mode = "error"
        message = str(exc)

    return {
        "detections": normalized,
        "exercise": payload.exercise,
        "mode": mode,
        "message": message,
    }
