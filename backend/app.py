"""Unified backend for the Pressure prototype.

Run (after installing deps into .venv):
    .venv/bin/python -m pip install fastapi uvicorn stripe
    STRIPE_SECRET_KEY=sk_test_... \
    PRESSURE_PASS_PRICE_ID=price_... \
    PRESSURE_APP_URL=http://localhost:5173 \
    .venv/bin/python -m uvicorn backend.app:app --port 8001

This server intentionally keeps the MVP payment model "payment-safe":
subscription + platform miss fee + transparent ledger, no pooled pot and no cash payouts.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import secrets
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from backend.payment_api_example import app as payments_app
except Exception:  # pragma: no cover - optional for prototype.
    payments_app = None


DATA_DIR = Path(__file__).resolve().parent / "data"
GROUPS_PATH = DATA_DIR / "groups.json"
CHECKINS_PATH = DATA_DIR / "checkins.json"
MEMBERS_PATH = DATA_DIR / "members.json"
PROFILES_PATH = DATA_DIR / "profiles.json"
INVITES_PATH = DATA_DIR / "invites.json"
LEDGER_PATH = DATA_DIR / "ledger.json"


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError:
        return default


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


app = FastAPI(title="Pressure Prototype API")
_default_origins = ["http://localhost:5173", "http://127.0.0.1:5173", "null"]
_extra_origins = [origin.strip() for origin in os.getenv("PRESSURE_ALLOWED_ORIGINS", "").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[*_default_origins, *_extra_origins],
    allow_origin_regex=r"https://.*\.github\.io$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "features": {
            "groups": True,
            "members": True,
            "profiles": True,
            "payments": payments_app is not None,
        },
    }


class GroupPayload(BaseModel):
    group_id: str
    name: str
    deadline: str = "22:00"
    fee_label: str = "EUR 10"
    destination_label: str = "Platform fee, geen cash-out"
    join_code: str = ""


@app.get("/api/groups")
def list_groups() -> dict[str, Any]:
    groups = _read_json(GROUPS_PATH, default={})
    return {"groups": list(groups.values())}


@app.get("/api/groups/{group_id}")
def get_group(group_id: str) -> dict[str, Any]:
    groups = _read_json(GROUPS_PATH, default={})
    group = groups.get(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="group_not_found")
    return {"group": group}


@app.post("/api/groups")
def upsert_group(payload: GroupPayload) -> dict[str, Any]:
    groups = _read_json(GROUPS_PATH, default={})
    previous = groups.get(payload.group_id) if isinstance(groups, dict) else None
    join_code = (payload.join_code or "").strip()
    if not join_code and isinstance(previous, dict):
        join_code = str(previous.get("join_code") or "").strip()

    group = payload.model_dump()
    group["join_code"] = join_code
    groups[payload.group_id] = group
    _write_json(GROUPS_PATH, groups)
    return {"group": group}


class GroupBulkPayload(BaseModel):
    groups: list[GroupPayload]


@app.post("/api/groups/bulk")
def upsert_groups_bulk(payload: GroupBulkPayload) -> dict[str, Any]:
    groups = _read_json(GROUPS_PATH, default={})
    if not isinstance(groups, dict):
        groups = {}

    upserted: list[dict[str, Any]] = []
    for item in payload.groups:
        previous = groups.get(item.group_id) if isinstance(groups, dict) else None
        join_code = (item.join_code or "").strip()
        if not join_code and isinstance(previous, dict):
            join_code = str(previous.get("join_code") or "").strip()

        record = item.model_dump()
        record["join_code"] = join_code
        groups[item.group_id] = record
        upserted.append(record)

    _write_json(GROUPS_PATH, groups)
    return {"upserted": len(upserted), "groups": upserted}


class CheckinPayload(BaseModel):
    group_id: str
    user_id: str
    display_name: str = "Jij"
    initial: str = "Y"
    date: str = ""  # YYYY-MM-DD (optional; server will bucket under "today" if empty)
    checks_completed: int = 0
    checks_total: int = 4
    verified: bool = False


def _bucket_date(raw: str) -> str:
    value = (raw or "").strip()
    # Keep it deliberately simple for the prototype; frontend may send empty.
    if value:
        return value
    from datetime import date

    return date.today().isoformat()


@app.get("/api/checkins/{group_id}/today")
def list_today_checkins(group_id: str) -> dict[str, Any]:
    checkins = _read_json(CHECKINS_PATH, default={})
    today = _bucket_date("")
    group_bucket = checkins.get(group_id, {})
    today_bucket = group_bucket.get(today, {})
    users = list(today_bucket.values()) if isinstance(today_bucket, dict) else []
    return {"date": today, "group_id": group_id, "checkins": users}


@app.post("/api/checkins")
def upsert_checkin(payload: CheckinPayload) -> dict[str, Any]:
    checkins = _read_json(CHECKINS_PATH, default={})
    bucket = _bucket_date(payload.date)
    group_bucket = checkins.setdefault(payload.group_id, {})
    day_bucket = group_bucket.setdefault(bucket, {})

    record = {
        "group_id": payload.group_id,
        "user_id": payload.user_id,
        "display_name": payload.display_name,
        "initial": payload.initial,
        "date": bucket,
        "checks_completed": max(0, min(payload.checks_completed, payload.checks_total)),
        "checks_total": payload.checks_total,
        "verified": bool(payload.verified),
    }
    day_bucket[payload.user_id] = record
    _write_json(CHECKINS_PATH, checkins)
    return {"checkin": record}


class MemberPayload(BaseModel):
    group_id: str
    user_id: str
    display_name: str = "Lid"
    initial: str = "Y"


@app.get("/api/members/{group_id}")
def list_members(group_id: str) -> dict[str, Any]:
    members = _read_json(MEMBERS_PATH, default={})
    group_bucket = members.get(group_id, {})
    users = list(group_bucket.values()) if isinstance(group_bucket, dict) else []
    return {"group_id": group_id, "members": users}


@app.post("/api/members")
def upsert_member(payload: MemberPayload) -> dict[str, Any]:
    members = _read_json(MEMBERS_PATH, default={})
    group_bucket = members.setdefault(payload.group_id, {})
    record = {
        "group_id": payload.group_id,
        "user_id": payload.user_id,
        "display_name": payload.display_name,
        "initial": payload.initial,
    }
    group_bucket[payload.user_id] = record
    _write_json(MEMBERS_PATH, members)
    return {"member": record}


class ProfilePayload(BaseModel):
    user_id: str
    name: str = ""
    email: str = ""
    stripe_customer_id: str = ""
    stripe_subscription_id: str = ""
    stripe_payment_method_id: str = ""


@app.get("/api/profiles/{user_id}")
def get_profile(user_id: str) -> dict[str, Any]:
    profiles = _read_json(PROFILES_PATH, default={})
    profile = profiles.get(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return {"profile": profile}


@app.post("/api/profiles")
def upsert_profile(payload: ProfilePayload) -> dict[str, Any]:
    profiles = _read_json(PROFILES_PATH, default={})
    profile = payload.model_dump()
    profiles[payload.user_id] = profile
    _write_json(PROFILES_PATH, profiles)
    return {"profile": profile}


class InviteCreatePayload(BaseModel):
    group_id: str
    requested_code: str = ""


def _normalize_join_code(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    allowed = "".join(ch for ch in value if ch.isalnum() or ch in {"_", "-"})
    return allowed[:64]


def _generate_join_code() -> str:
    return f"code_{secrets.token_hex(3)}"


@app.get("/api/invites/{join_code}")
def resolve_invite(join_code: str) -> dict[str, Any]:
    code = _normalize_join_code(join_code)
    invites = _read_json(INVITES_PATH, default={})
    group_id = invites.get(code) if isinstance(invites, dict) else None
    if not group_id:
        raise HTTPException(status_code=404, detail="invite_not_found")
    groups = _read_json(GROUPS_PATH, default={})
    group = groups.get(group_id) if isinstance(groups, dict) else None
    if not group:
        raise HTTPException(status_code=404, detail="group_not_found")
    return {"join_code": code, "group": group}


@app.post("/api/invites")
def create_invite(payload: InviteCreatePayload) -> dict[str, Any]:
    group_id = (payload.group_id or "").strip()
    if not group_id:
        raise HTTPException(status_code=400, detail="missing_group_id")

    groups = _read_json(GROUPS_PATH, default={})
    group = groups.get(group_id) if isinstance(groups, dict) else None
    if not group:
        raise HTTPException(status_code=404, detail="group_not_found")

    invites = _read_json(INVITES_PATH, default={})
    if not isinstance(invites, dict):
        invites = {}

    existing_code = str(group.get("join_code") or "").strip()
    if existing_code and invites.get(existing_code) == group_id:
        return {"join_code": existing_code, "group_id": group_id}

    requested = _normalize_join_code(payload.requested_code)
    code = requested or _generate_join_code()
    attempts = 0
    while code in invites and invites.get(code) != group_id:
        attempts += 1
        if attempts > 20:
            raise HTTPException(status_code=500, detail="invite_code_collision")
        code = _generate_join_code()

    invites[code] = group_id
    group["join_code"] = code
    groups[group_id] = group
    _write_json(INVITES_PATH, invites)
    _write_json(GROUPS_PATH, groups)
    return {"join_code": code, "group_id": group_id}


class LedgerEventPayload(BaseModel):
    group_id: str
    kind: str = "note"
    user_id: str = ""
    display_name: str = ""
    amount_cents: int = 0
    currency: str = "eur"
    description: str = ""
    status: str = "ok"
    payment_intent_id: str = ""
    created_at: str = ""  # ISO timestamp; server will fill if empty


def _read_ledger() -> list[dict[str, Any]]:
    items = _read_json(LEDGER_PATH, default=[])
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    return []


@app.get("/api/ledger/{group_id}")
def list_ledger(group_id: str, limit: int = 50) -> dict[str, Any]:
    entries = [item for item in _read_ledger() if item.get("group_id") == group_id]
    entries.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    safe_limit = max(1, min(int(limit or 50), 250))
    return {"group_id": group_id, "entries": entries[:safe_limit]}


@app.post("/api/ledger")
def append_ledger(payload: LedgerEventPayload) -> dict[str, Any]:
    group_id = (payload.group_id or "").strip()
    if not group_id:
        raise HTTPException(status_code=400, detail="missing_group_id")

    groups = _read_json(GROUPS_PATH, default={})
    if not isinstance(groups, dict) or group_id not in groups:
        raise HTTPException(status_code=404, detail="group_not_found")

    entry = payload.model_dump()
    entry["group_id"] = group_id
    entry["kind"] = (entry.get("kind") or "note")[:64]
    entry["currency"] = (entry.get("currency") or "eur")[:8].lower()
    entry["amount_cents"] = int(entry.get("amount_cents") or 0)
    entry["status"] = (entry.get("status") or "ok")[:32]
    entry["payment_intent_id"] = (entry.get("payment_intent_id") or "")[:128]
    entry["user_id"] = (entry.get("user_id") or "")[:128]
    entry["display_name"] = (entry.get("display_name") or "")[:128]
    entry["description"] = (entry.get("description") or "")[:280]

    if not entry.get("created_at"):
        from datetime import datetime, timezone

        entry["created_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if not entry.get("id"):
        entry["id"] = f"led_{secrets.token_hex(6)}"

    ledger = _read_ledger()
    ledger.append(entry)
    _write_json(LEDGER_PATH, ledger)
    return {"entry": entry}


if payments_app is not None:
    app.include_router(payments_app.router)
