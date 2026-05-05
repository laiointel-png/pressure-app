# RF-DETR Vision Integration

The mobile prototype has a camera intelligence layer that is ready to connect to RF-DETR.

## How the app uses it

`script.js` checks for a detection endpoint in:

```js
window.PRESSURE_VISION_ENDPOINT
```

or:

```js
localStorage.setItem("pressureVisionEndpoint", "http://localhost:8000/api/rfdetr/detect")
```

When an endpoint exists, the camera screen captures a 384x384 JPEG frame and sends:

```json
{
  "image": "data:image/jpeg;base64,...",
  "exercise": "Push-up hold",
  "confidence": 0.45
}
```

The endpoint should respond with:

```json
{
  "detections": [
    {
      "label": "person",
      "confidence": 0.96,
      "box": { "x": 0.28, "y": 0.18, "width": 0.45, "height": 0.68 }
    }
  ]
}
```

Box values can be normalized `0..1` or pixel values. The frontend normalizes both.

## Why this is split

RF-DETR is distributed as a Python package (`pip install rfdetr`) and through Roboflow's `inference` Python library. The static frontend cannot run the Python model directly. The production architecture should be:

```text
Phone camera -> frontend frame capture -> RF-DETR API -> detections -> trace UI / anti-cheat logic
```

## Local demo mode

If no endpoint is configured, the app stays usable with a local demo detector. It shows the same UI states and overlay shape, but labels are simulated.
