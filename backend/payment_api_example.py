"""Stripe payment API sketch for the Pressure beta model.

Install:
    .venv/bin/python -m pip install fastapi uvicorn stripe

Run:
    STRIPE_SECRET_KEY=sk_test_... \
    PRESSURE_PASS_PRICE_ID=price_... \
    PRESSURE_APP_URL=http://localhost:5173 \
    .venv/bin/python -m uvicorn backend.payment_api_example:app --port 8001

This file models the safer beta payment approach:
subscription + platform miss fee + transparent ledger.
It intentionally does not implement pooled pots, wallets, or winner payouts.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

try:
    import stripe
except ImportError:  # pragma: no cover - local dependency is optional for the prototype.
    stripe = None


STRIPE_API_VERSION = "2026-02-25.clover"
APP_URL = os.getenv("PRESSURE_APP_URL", "http://localhost:5173")
STRIPE_MODE = os.getenv("PRESSURE_STRIPE_MODE", "test_only").strip().lower()
ALLOW_LIVE = os.getenv("PRESSURE_STRIPE_ALLOW_LIVE", "").strip().lower() in {"1", "true", "yes", "on"}

router = APIRouter()

# Keep a standalone FastAPI app for local runs (`uvicorn backend.payment_api_example:app`),
# but export `router` for inclusion into `backend.app` without duplicating middleware.
app = FastAPI(title="Pressure Payment API")
app.include_router(router)


class CheckoutRequest(BaseModel):
    user_id: str
    email: str
    group_id: str = ""


class SetupSessionRequest(BaseModel):
    user_id: str
    email: str
    group_id: str = ""
    stripe_customer_id: str = ""
    currency: str = "eur"


class SetupRequest(BaseModel):
    stripe_customer_id: str


class MissFeeRequest(BaseModel):
    stripe_customer_id: str
    payment_method_id: str
    user_id: str
    group_id: str
    amount_cents: int = Field(default=1000, ge=100, le=5000)
    reason: str = "missed_live_checks"


class PortalRequest(BaseModel):
    stripe_customer_id: str = ""
    email: str = ""
    return_url: str = ""


def stripe_client_ready() -> bool:
    if stripe is None:
        return False
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    stripe.api_version = STRIPE_API_VERSION
    if not stripe.api_key:
        return False

    is_live_key = stripe.api_key.startswith("sk_live_")
    if is_live_key and not ALLOW_LIVE:
        # Safety guard: refuse to treat live keys as ready unless explicitly allowed.
        return False

    if STRIPE_MODE not in {"test_only", "live_allowed"}:
        # Unknown mode => fail closed.
        return False

    if STRIPE_MODE == "test_only" and is_live_key:
        return False

    return True


def demo_response(kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": "demo",
        "kind": kind,
        "message": "Stripe is not enabled (missing deps/keys or live key blocked). Set STRIPE_SECRET_KEY (sk_test_...) and install stripe.",
        **payload,
    }

def _safe_return_url(raw: str) -> str:
    candidate = (raw or "").strip()
    if not candidate:
        return f"{APP_URL}/#billing"

    allow_prefixes = (
        APP_URL,
        "http://localhost",
        "http://127.0.0.1",
        "https://localhost",
    )
    if candidate.startswith(allow_prefixes):
        return candidate
    if "github.io" in candidate:
        return candidate
    return f"{APP_URL}/#billing"


@router.get("/api/payments/health")
def health() -> dict[str, Any]:
    key = os.getenv("STRIPE_SECRET_KEY", "")
    is_live_key = key.startswith("sk_live_")
    return {
        "ok": True,
        "stripe_ready": stripe_client_ready(),
        "api_version": STRIPE_API_VERSION,
        "model": "subscription_plus_platform_miss_fee",
        "cash_payouts_enabled": False,
        "stripe_mode": STRIPE_MODE,
        "live_key_detected": is_live_key,
        "live_key_allowed": bool(ALLOW_LIVE),
    }

@router.get("/api/payments/checkout-session/{session_id}")
def get_checkout_session(session_id: str) -> dict[str, Any]:
    if not stripe_client_ready():
        return demo_response(
            "checkout_session",
            {
                "session_id": session_id,
                "session_mode": "",
                "customer_id": "",
                "subscription_id": "",
                "setup_intent_id": "",
                "payment_status": "unknown",
            },
        )

    session = stripe.checkout.Session.retrieve(session_id)
    customer_id = session.get("customer") or ""
    subscription_id = session.get("subscription") or ""
    payment_status = session.get("payment_status") or ""
    status = session.get("status") or ""
    session_mode = session.get("mode") or ""
    setup_intent_id = session.get("setup_intent") or ""
    return {
        "mode": "stripe",
        "session_id": session_id,
        "session_mode": session_mode,
        "status": status,
        "payment_status": payment_status,
        "customer_id": customer_id,
        "subscription_id": subscription_id,
        "setup_intent_id": setup_intent_id,
    }


@router.post("/api/payments/pass-checkout")
def create_pass_checkout(payload: CheckoutRequest) -> dict[str, Any]:
    price_id = os.getenv("PRESSURE_PASS_PRICE_ID")
    if not stripe_client_ready() or not price_id:
        return demo_response(
            "subscription_checkout",
            {"checkout_url": f"{APP_URL}/#billing", "price_id": price_id or "price_demo"},
        )

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer_email=payload.email,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{APP_URL}/#success?kind=pass&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{APP_URL}/#billing?cancel=1",
        metadata={
            "pressure_user_id": payload.user_id,
            "pressure_group_id": payload.group_id or "",
            "product": "pressure_pass",
        },
    )
    return {"mode": "stripe", "checkout_url": session.url, "session_id": session.id}


@router.post("/api/payments/setup-session")
def create_setup_session(payload: SetupSessionRequest) -> dict[str, Any]:
    if not stripe_client_ready():
        return demo_response(
            "setup_checkout",
            {"checkout_url": f"{APP_URL}/#billing", "currency": payload.currency or "eur"},
        )

    currency = (payload.currency or "eur").strip().lower()
    customer_id = (payload.stripe_customer_id or "").strip()
    params: dict[str, Any] = {
        "mode": "setup",
        "currency": currency,
        "success_url": f"{APP_URL}/#billing?setup=1&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{APP_URL}/#billing?setup_cancel=1",
        "setup_intent_data": {
            "usage": "off_session",
            "metadata": {
                "purpose": "future_pressure_miss_fees",
                "pressure_user_id": payload.user_id,
                "pressure_group_id": payload.group_id or "",
            },
        },
        "metadata": {
            "pressure_user_id": payload.user_id,
            "pressure_group_id": payload.group_id or "",
            "product": "pressure_miss_fee_mandate",
        },
    }

    if customer_id:
        params["customer"] = customer_id
    else:
        params["customer_creation"] = "always"
        params["customer_email"] = payload.email

    session = stripe.checkout.Session.create(**params)
    return {"mode": "stripe", "checkout_url": session.url, "session_id": session.id}


@router.get("/api/payments/setup-intent/{intent_id}")
def get_setup_intent(intent_id: str) -> dict[str, Any]:
    if not stripe_client_ready():
        return demo_response(
            "setup_intent",
            {
                "setup_intent_id": intent_id,
                "status": "unknown",
                "customer_id": "",
                "payment_method_id": "",
            },
        )

    intent = stripe.SetupIntent.retrieve(intent_id)
    payment_method_id = intent.get("payment_method") or ""
    customer_id = intent.get("customer") or ""
    status = intent.get("status") or ""
    return {
        "mode": "stripe",
        "setup_intent_id": intent_id,
        "status": status,
        "customer_id": customer_id,
        "payment_method_id": payment_method_id,
    }

@router.post("/api/payments/customer-portal")
def open_customer_portal(payload: PortalRequest) -> dict[str, Any]:
    if not stripe_client_ready():
        return demo_response("customer_portal", {"portal_url": f"{APP_URL}/#billing"})

    customer_id = (payload.stripe_customer_id or "").strip()
    email = (payload.email or "").strip()
    if not customer_id and email:
        customers = stripe.Customer.list(email=email, limit=1)
        data = customers.get("data") if isinstance(customers, dict) else []
        if data:
            customer_id = data[0].get("id") or ""

    if not customer_id:
        return demo_response("customer_portal", {"portal_url": f"{APP_URL}/#billing"})

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=_safe_return_url(payload.return_url),
    )
    return {"mode": "stripe", "portal_url": session.url, "customer_id": customer_id}


@router.post("/api/payments/setup-mandate")
def create_setup_intent(payload: SetupRequest) -> dict[str, Any]:
    if not stripe_client_ready():
        return demo_response("setup_intent", {"client_secret": "seti_demo_secret"})

    intent = stripe.SetupIntent.create(
        customer=payload.stripe_customer_id,
        usage="off_session",
        metadata={"purpose": "future_pressure_miss_fees"},
    )
    return {"mode": "stripe", "client_secret": intent.client_secret, "setup_intent_id": intent.id}


@router.post("/api/payments/miss-fee")
def charge_miss_fee(payload: MissFeeRequest) -> dict[str, Any]:
    if not stripe_client_ready():
        return demo_response(
            "miss_fee",
            {
                "ledger_status": "simulated",
                "amount_cents": payload.amount_cents,
                "cash_payout_created": False,
            },
        )

    intent = stripe.PaymentIntent.create(
        amount=payload.amount_cents,
        currency="eur",
        customer=payload.stripe_customer_id,
        payment_method=payload.payment_method_id,
        off_session=True,
        confirm=True,
        description="Pressure platform miss fee",
        metadata={
            "pressure_user_id": payload.user_id,
            "pressure_group_id": payload.group_id,
            "reason": payload.reason,
            "cash_payout_created": "false",
        },
    )
    return {
        "mode": "stripe",
        "payment_intent_id": intent.id,
        "status": intent.status,
        "cash_payout_created": False,
    }


@router.post("/api/payments/webhook")
async def stripe_webhook(request: Request) -> dict[str, Any]:
    raw_body = await request.body()
    signature = request.headers.get("stripe-signature")
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not stripe_client_ready() or not secret or not signature:
        return demo_response("webhook", {"received_bytes": len(raw_body)})

    try:
        event = stripe.Webhook.construct_event(raw_body, signature, secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"received": True, "event_type": event["type"]}
