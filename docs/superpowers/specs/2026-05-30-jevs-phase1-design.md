# JEVS Phase 1 — Implementation Design

**Date**: 2026-05-30
**Scope**: Config + CRUD + API Routes + Service Skeletons
**Out of scope**: Full Image Router (FLUX API), Full Document Renderer (multi-format export)

---

## Architecture Overview

Phase 1 extends the existing Full Stack FastAPI Template with JEVS-specific modules. All new code follows the established patterns in `items.py` (routes), `crud.py` (data access), and `deps.py` (dependency injection).

```
                   ┌──────────────────────┐
                   │   api/router/main.py  │
                   │  (register 3 routers) │
                   └──────┬───────────────┘
            ┌─────────────┼──────────────┐
            ▼             ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ cases.py │  │evidences │  │ scenes.py│
    │  (7 ep)  │  │ .py (3)  │  │  (2 ep)  │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │              │
         ▼             ▼              ▼
    ┌──────────────────────────────────────┐
    │              crud.py                  │
    │  create_case, get_cases, get_case,   │
    │  create_evidences_batch,             │
    │  update_evidence, create_scene_state │
    └────────────────┬─────────────────────┘
                     │
    ┌────────────────┼─────────────────────┐
    │  Services                             │
    │  ┌──────────────────┐                 │
    │  │ evidence_filter   │ ✅ implemented │
    │  │ scene_engine      │ ✅ implemented │
    │  │ image_router      │ ⏳ skeleton    │
    │  │ document_renderer │ ⏳ skeleton    │
    │  └──────────────────┘                 │
    └───────────────────────────────────────┘
```

---

## Task Breakdown

### Task 1: Add API Key env vars to Config

**File**: `backend/app/core/config.py`

Add three optional fields to the `Settings` class:

```python
DEEPSEEK_API_KEY: str | None = None
OPENAI_API_KEY: str | None = None
FLUX_API_KEY: str | None = None
```

These are read automatically from `.env` by `pydantic-settings`. They are optional because users may only configure one provider.

Also add placeholder entries in `.env`:

```
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
FLUX_API_KEY=
```

**Estimated**: 2 edits, low risk.

---

### Task 2: Add JEVS CRUD functions

**File**: `backend/app/crud.py`

Follow the established pattern (`session.add → commit → refresh`). Add 9 functions:

| Function | Signature | Notes |
|----------|-----------|-------|
| `create_case` | `(session, case_in: CaseCreate) -> Case` | Maps to `Case` model (no owner — cases shared by all authenticated users) |
| `get_cases` | `(session, skip, limit) -> list[Case]` | Paginated by `created_at` desc; all authenticated users see all cases |
| `get_case` | `(session, case_id: int) -> Case \| None` | Simple PK lookup |
| `update_case` | `(session, db_case, case_update: CaseUpdate) -> Case` | `exclude_unset=True` update |
| `delete_case` | `(session, db_case) -> None` | Cascade deletes evidence/scenes/images |
| `create_evidences_batch` | `(session, case_id, evidences: list[dict]) -> list[Evidence]` | Bulk insert after LLM extraction |
| `get_evidences_by_case` | `(session, case_id) -> list[Evidence]` | Filter by case_id |
| `update_evidence` | `(session, db_evidence, evidence_update) -> Evidence` | For teacher approval/exclusion |
| `create_scene_state` | `(session, scene_data: dict) -> SceneState` | Save LLM-deduced scene |
| `get_scene_by_case` | `(session, case_id: int) -> SceneState \| None` | Latest scene for a case |

**Estimated**: ~80 lines, medium risk (touches existing file).

---

### Task 3: Create API Routes

Three new route files, all following `items.py` patterns.

#### `backend/app/api/routes/cases.py`

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| POST | `/cases/` | `create_case` | Body: `CaseCreate`; caller specifies `provider` in query param |
| GET | `/cases/` | `read_cases` | Paginated list; all authenticated users see all cases |
| GET | `/cases/{id}` | `read_case` | Returns case + evidence count |
| PATCH | `/cases/{id}` | `update_case` | Edit title, status, raw_text |
| DELETE | `/cases/{id}` | `delete_case` | Cascade delete |
| POST | `/cases/{id}/extract` | `extract_evidence` | Calls `evidence_filter.extract_evidence_from_text()`; `provider` query param; bulk-inserts results |
| POST | `/cases/{id}/scene` | `deduce_scene` | Calls `scene_engine.deduce_scene_state()`; `provider` query param |

#### `backend/app/api/routes/evidences.py`

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/evidences/case/{case_id}` | `read_evidences_by_case` | All evidences for a case |
| GET | `/evidences/{id}` | `read_evidence` | Single evidence by PK |
| PATCH | `/evidences/{id}` | `update_evidence` | Teacher flips `is_approved`/`is_excluded`, edits `description`/`location`/`state_json` |

#### `backend/app/api/routes/scenes.py`

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/scenes/{id}` | `read_scene` | Returns full scene snapshot |
| DELETE | `/scenes/{id}` | `delete_scene` | Remove scene state |

**Estimated**: ~200 lines across 3 files, medium risk.

---

### Task 4: Route Registration

**File**: `backend/app/api/main.py`

Add three `include_router` calls:

```python
from app.api.routes import cases, evidences, scenes

api_router.include_router(cases.router)
api_router.include_router(evidences.router)
api_router.include_router(scenes.router)
```

**Estimated**: 2 lines, trivial risk.

---

### Task 5: Service Skeletons (Image Router + Document Renderer)

**File**: `backend/app/services/image_router.py`

Replace the placeholder comment with a function signature:

```python
async def generate_scene_image(
    scene_state: "SceneStateSnapshot",
    provider: str = "flux",
    style: str = "realistic"
) -> dict:
    """Generate a scene visualization image from a SceneStateSnapshot.
    
    Phase 2: Will call FLUX API or fall back to Pillow composite rendering.
    """
    raise NotImplementedError("Image Router will be implemented in Phase 2")
```

**File**: `backend/app/services/document_renderer.py`

Replace the placeholder comment with a function signature:

```python
async def render_case_report(
    case: "Case",
    evidences: list["Evidence"],
    scene_state: "SceneStateSnapshot | None" = None,
    format: str = "markdown"
) -> str:
    """Render a comprehensive case analysis report.
    
    Phase 2: Will support markdown, HTML, and PDF export using Jinja2 templates.
    """
    raise NotImplementedError("Document Renderer will be implemented in Phase 2")
```

**Estimated**: ~20 lines across 2 files, trivial risk.

---

### Task 6: Database Migration

**File**: `backend/app/alembic/versions/` (new auto-generated migration)

Run `alembic revision --autogenerate -m "add_jevs_tables"` to create migration for `Case`, `Evidence`, `SceneState`, `GeneratedImage` tables. Then apply with `alembic upgrade head`.

**Estimated**: 1 autogenerated file + 1 command, low risk.

---

## Data Flow: Full Pipeline

```
User uploads judgment text
        │
        ▼
POST /cases/                    → Case row in DB (status=pending)
        │
        ▼
POST /cases/{id}/extract        → evidence_filter.py calls LLM (Instructor)
  (provider=openai|deepseek)    → returns EvidenceExtractionResult
                                → bulk insert Evidence rows
                                → Case.status = "extracted"
        │
        ▼
Teacher reviews evidences
  PATCH /evidences/{id}         → flips is_approved / is_excluded
        │
        ▼
POST /cases/{id}/scene          → scene_engine.py calls LLM (Instructor)
  (provider=openai|deepseek)    → returns SceneStateSnapshot (as JSON)
                                → insert SceneState row
                                → Case.status = "reviewed"
        │
        ▼
[Phase 2] POST /scenes/{id}/render  → image_router.py → GeneratedImage row
[Phase 2] GET /cases/{id}/report    → document_renderer.py → report file
```

---

## Schemas Required (CRUD layer)

The routes need request/response schemas. Existing schemas in `schemas/evidence.py` (`CaseBase`, `CaseCreate`, `CaseResponse`, `EvidenceCreate`, `EvidenceUpdate`, `EvidenceResponse`) and `schemas/scene.py` (`SceneStateSnapshot`, `SceneObjectState`) cover most needs. One missing piece:

- **`CaseUpdate`**: Not yet defined. Will be added to `schemas/evidence.py` with all optional fields (`title`, `raw_text`, `status`), following the `ItemUpdate` pattern in `models.py`.

All schemas use `from_attributes = True` where needed to enable ORM → Pydantic conversion.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| LLM API call failures | Wrap in try/except, return HTTP 502 with error detail |
| Cascade delete not working | SQLModel relationships already defined; verify with test |
| Migration conflicts with existing DB | Run migration on fresh DB or use `--autogenerate` carefully |
| Large raw_text payloads | Add request body size limit; raw_text is Text type (unbounded) |

---

## Files Changed (Phase 1)

| File | Operation | Risk |
|------|-----------|------|
| `backend/app/core/config.py` | Edit — add 3 fields | Low |
| `.env` | Edit — add 3 placeholders | Low |
| `backend/app/crud.py` | Edit — add ~80 lines | Medium |
| `backend/app/api/routes/cases.py` | **Create** (~120 lines) | Medium |
| `backend/app/api/routes/evidences.py` | **Create** (~50 lines) | Low |
| `backend/app/api/routes/scenes.py` | **Create** (~30 lines) | Low |
| `backend/app/api/main.py` | Edit — add 3 lines | Trivial |
| `backend/app/services/image_router.py` | Edit — replace placeholder | Trivial |
| `backend/app/services/document_renderer.py` | Edit — replace placeholder | Trivial |
| `backend/app/alembic/versions/` | Auto-generate 1 file | Low |
