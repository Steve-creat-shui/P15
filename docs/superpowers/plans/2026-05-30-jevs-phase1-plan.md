# JEVS Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the JEVS backend: config keys, CRUD layer, API routes for cases/evidences/scenes, service skeletons, and database migration.

**Architecture:** Follow the existing FastAPI template patterns — `APIRouter` with `SessionDep`/`CurrentUser` deps, `crud.py` functions using `session.add → commit → refresh`, and `pydantic-settings` for config. All JEVS models (`Case`, `Evidence`, `SceneState`, `GeneratedImage`) already exist in `models.py` with `table=True`.

**Tech Stack:** FastAPI, SQLModel, Instructor, Alembic, Pydantic Settings

---

## File Structure

```
backend/app/
├── core/
│   └── config.py              ← EDIT: add 3 API key fields
├── crud.py                     ← EDIT: add 10 JEVS functions
├── models.py                   ← (already has Case/Evidence/SceneState/GeneratedImage)
├── schemas/
│   ├── evidence.py             ← EDIT: add CaseUpdate schema
│   └── scene.py                ← (already has SceneStateSnapshot/SceneObjectState)
├── services/
│   ├── evidence_filter.py      ← (already implemented)
│   ├── scene_engine.py         ← (already implemented)
│   ├── image_router.py         ← EDIT: add skeleton function
│   └── document_renderer.py    ← EDIT: add skeleton function
├── api/
│   ├── main.py                 ← EDIT: register 3 new routers
│   └── routes/
│       ├── cases.py            ← CREATE: 7 endpoints
│       ├── evidences.py        ← CREATE: 3 endpoints
│       └── scenes.py           ← CREATE: 2 endpoints
└── alembic/
    └── versions/
        └── <hash>_add_jevs_tables.py  ← AUTO-GENERATE
.env                            ← EDIT: add 3 placeholder lines
```

---

### Task 1: Add API Key Environment Variables

**Files:**
- Modify: `backend/app/core/config.py:26-48`
- Modify: `.env:42-46`

- [ ] **Step 1: Add three optional API key fields to Settings class**

Open `backend/app/core/config.py`. In the `Settings` class, find the `SENTRY_DSN` line (line ~52) and add below it:

```python
    SENTRY_DSN: HttpUrl | None = None
    # JEVS: AI Provider API keys
    DEEPSEEK_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    FLUX_API_KEY: str | None = None
```

These are `str | None = None` so they're optional — users can configure only the providers they use. `pydantic-settings` reads them from `.env` automatically.

- [ ] **Step 2: Add placeholder entries to .env**

Open `.env` in the project root. Append to the end of the file:

```
# JEVS AI Provider Keys
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
FLUX_API_KEY=
```

- [ ] **Step 3: Verify config loads correctly**

```bash
cd backend && uv run python -c "from app.core.config import settings; print('DEEPSEEK_API_KEY:', settings.DEEPSEEK_API_KEY); print('OPENAI_API_KEY:', settings.OPENAI_API_KEY); print('FLUX_API_KEY:', settings.FLUX_API_KEY)"
```

Expected: All three print `None` (or empty string if set in your `.env`).

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/config.py .env
git commit -m "feat: add DEEPSEEK_API_KEY, OPENAI_API_KEY, FLUX_API_KEY to config and .env"
```

---

### Task 2: Add CaseUpdate Schema

**Files:**
- Modify: `backend/app/schemas/evidence.py:19-27`

- [ ] **Step 1: Add CaseUpdate class**

Open `backend/app/schemas/evidence.py`. After the `CaseCreate` class (around line 43), add:

```python
class CaseUpdate(BaseModel):
    title: str | None = None
    raw_text: str | None = None
    status: str | None = None
```

This follows the `EvidenceUpdate` pattern already in this file (all optional fields, `exclude_unset=True` usage in PATCH endpoints).

- [ ] **Step 2: Verify the schema imports correctly**

```bash
cd backend && uv run python -c "from app.schemas.evidence import CaseUpdate; print(CaseUpdate(title='test').model_dump(exclude_unset=True))"
```

Expected: `{'title': 'test'}`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/evidence.py
git commit -m "feat: add CaseUpdate schema with all optional fields"
```

---

### Task 3: Add JEVS CRUD Functions

**Files:**
- Modify: `backend/app/crud.py:1-69`

- [ ] **Step 1: Replace imports at top of crud.py**

Open `backend/app/crud.py`. The current import block (lines 1-8) is:
```python
import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models import Item, ItemCreate, User, UserCreate, UserUpdate
```

Replace it with:
```python
import json
import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models import (
    Case,
    Evidence,
    GeneratedImage,
    Item,
    ItemCreate,
    SceneState,
    User,
    UserCreate,
    UserUpdate,
)
from app.schemas.evidence import CaseCreate, CaseUpdate, EvidenceUpdate
```

Note: `import uuid` and `from typing import Any` are kept — the existing `create_item` function uses `uuid.UUID` for the `owner_id` parameter. `CaseCreate` is imported from schemas (not models) because the Pydantic request schema lives in `schemas/evidence.py`, while `Case` (the DB model with `table=True`) lives in `models.py`.

- [ ] **Step 2: Append CRUD functions after the existing `create_item` function**

Add the following 10 functions at the end of `backend/app/crud.py`, after the `create_item` function (line 68):

```python
# ==============================================================================
# JEVS CRUD Functions
# ==============================================================================


def create_case(*, session: Session, case_in: CaseCreate) -> Case:
    """Create a new case from judgment text."""
    db_case = Case.model_validate(case_in)
    session.add(db_case)
    session.commit()
    session.refresh(db_case)
    return db_case


def get_cases(*, session: Session, skip: int = 0, limit: int = 100) -> list[Case]:
    """Get paginated list of cases, newest first. All authenticated users see all cases."""
    statement = (
        select(Case)
        .order_by(Case.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(session.exec(statement).all())


def get_case(*, session: Session, case_id: int) -> Case | None:
    """Get a single case by primary key."""
    return session.get(Case, case_id)


def update_case(*, session: Session, db_case: Case, case_update: CaseUpdate) -> Case:
    """Update case fields (title, raw_text, status)."""
    update_dict = case_update.model_dump(exclude_unset=True)
    db_case.sqlmodel_update(update_dict)
    session.add(db_case)
    session.commit()
    session.refresh(db_case)
    return db_case


def delete_case(*, session: Session, db_case: Case) -> None:
    """Delete a case. Evidence, scenes, and images are cascade-deleted by the DB."""
    session.delete(db_case)
    session.commit()


def create_evidences_batch(
    *, session: Session, case_id: int, evidences: list[dict]
) -> list[Evidence]:
    """Bulk-insert evidence items extracted by the LLM. Each dict has keys:
    evidence_type, category, description, location (optional), state_dict (optional).
    """
    db_evidences = []
    for ev in evidences:
        state_dict = ev.get("state_dict")
        state_json = json.dumps(state_dict, ensure_ascii=False) if state_dict else None
        db_ev = Evidence(
            case_id=case_id,
            category=ev["category"],
            evidence_type=ev["evidence_type"],
            description=ev["description"],
            location=ev.get("location"),
            state_json=state_json,
            is_approved=False,
            is_excluded=False,
        )
        session.add(db_ev)
        db_evidences.append(db_ev)
    session.commit()
    for ev in db_evidences:
        session.refresh(ev)
    return db_evidences


def get_evidences_by_case(*, session: Session, case_id: int) -> list[Evidence]:
    """Get all evidence items for a given case."""
    statement = select(Evidence).where(Evidence.case_id == case_id)
    return list(session.exec(statement).all())


def get_evidence(*, session: Session, evidence_id: int) -> Evidence | None:
    """Get a single evidence item by primary key."""
    return session.get(Evidence, evidence_id)


def update_evidence(
    *, session: Session, db_evidence: Evidence, evidence_update: EvidenceUpdate
) -> Evidence:
    """Update an evidence item (teacher review: approve, exclude, edit)."""
    update_dict = evidence_update.model_dump(exclude_unset=True)
    db_evidence.sqlmodel_update(update_dict)
    session.add(db_evidence)
    session.commit()
    session.refresh(db_evidence)
    return db_evidence


def create_scene_state(
    *, session: Session, case_id: int, scene_name: str, state_json: str
) -> SceneState:
    """Save a deduced scene state snapshot."""
    db_scene = SceneState(
        case_id=case_id,
        scene_name=scene_name,
        state_json=state_json,
    )
    session.add(db_scene)
    session.commit()
    session.refresh(db_scene)
    return db_scene


def get_scene_by_case(*, session: Session, case_id: int) -> SceneState | None:
    """Get the most recent scene state for a case."""
    statement = (
        select(SceneState)
        .where(SceneState.case_id == case_id)
        .order_by(SceneState.created_at.desc())
        .limit(1)
    )
    return session.exec(statement).first()
```

- [ ] **Step 3: Verify imports and syntax**

```bash
cd backend && uv run python -c "from app.crud import create_case, get_cases, get_case, update_case, delete_case, create_evidences_batch, get_evidences_by_case, get_evidence, update_evidence, create_scene_state, get_scene_by_case; print('All CRUD functions imported OK')"
```

Expected: `All CRUD functions imported OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/crud.py
git commit -m "feat: add JEVS CRUD functions for Case, Evidence, SceneState"
```

---

### Task 4: Create Cases API Route

**Files:**
- Create: `backend/app/api/routes/cases.py`

- [ ] **Step 1: Create cases.py with all 7 endpoints**

Create the file `backend/app/api/routes/cases.py` with the following content:

```python
import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models import Case, Evidence
from app.schemas.evidence import CaseCreate, CaseResponse, CaseUpdate
from app.services.evidence_filter import extract_evidence_from_text
from app.services.scene_engine import deduce_scene_state

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post("/", response_model=CaseResponse)
async def create_case(
    *, session: SessionDep, current_user: CurrentUser, case_in: CaseCreate
) -> Any:
    """Create a new case by uploading judgment text."""
    db_case = crud.create_case(session=session, case_in=case_in)
    return db_case


@router.get("/", response_model=dict)
def read_cases(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """List all cases, newest first. Available to all authenticated users."""
    count_statement = select(func.count()).select_from(Case)
    count = session.exec(count_statement).one()
    cases = crud.get_cases(session=session, skip=skip, limit=limit)
    cases_response = [CaseResponse.model_validate(c) for c in cases]
    return {"data": cases_response, "count": count}


@router.get("/{case_id}", response_model=CaseResponse)
def read_case(
    session: SessionDep, current_user: CurrentUser, case_id: int
) -> Any:
    """Get a single case by ID."""
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    return db_case


@router.patch("/{case_id}", response_model=CaseResponse)
def update_case(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
    case_update: CaseUpdate,
) -> Any:
    """Update case title, raw text, or status."""
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    return crud.update_case(session=session, db_case=db_case, case_update=case_update)


@router.delete("/{case_id}")
def delete_case(
    session: SessionDep, current_user: CurrentUser, case_id: int
) -> dict:
    """Delete a case and all associated evidence, scenes, and images."""
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    crud.delete_case(session=session, db_case=db_case)
    return {"message": "Case deleted successfully"}


@router.post("/{case_id}/extract")
async def extract_evidence(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
    provider: str = Query("openai", pattern="^(openai|deepseek)$"),
) -> Any:
    """Extract evidence items from the case's raw text using LLM.
    
    The LLM extracts structured evidence (物证, 书证, 现场结构, 空间关系) and
    bulk-inserts them as Evidence rows. Case status is updated to 'extracted'.
    """
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not db_case.raw_text:
        raise HTTPException(status_code=400, detail="Case has no raw text to extract from")

    try:
        extraction_result = await extract_evidence_from_text(
            raw_text=db_case.raw_text, provider=provider
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"LLM evidence extraction failed: {str(e)}",
        )

    # Convert Pydantic models to dicts for batch insert
    evidence_dicts = [ev.model_dump() for ev in extraction_result.evidences]
    created = crud.create_evidences_batch(
        session=session, case_id=case_id, evidences=evidence_dicts
    )

    # Update case status
    crud.update_case(
        session=session,
        db_case=db_case,
        case_update=CaseUpdate(status="extracted"),
    )

    # Re-fetch to get updated state
    session.refresh(db_case)

    return {
        "case": CaseResponse.model_validate(db_case),
        "extracted_count": len(created),
        "evidences": [
            {
                "id": ev.id,
                "category": ev.category,
                "evidence_type": ev.evidence_type,
                "description": ev.description,
                "location": ev.location,
            }
            for ev in created
        ],
    }


@router.post("/{case_id}/scene")
async def deduce_scene(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
    provider: str = Query("openai", pattern="^(openai|deepseek)$"),
) -> Any:
    """Deduce 3D scene state from approved evidence items.
    
    Only evidence marked as is_approved=True and is_excluded=False is used.
    The LLM generates spatial coordinates, orientations, and environment
    parameters, saved as a SceneState row. Case status is updated to 'reviewed'.
    """
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Collect approved evidence
    all_evidences = crud.get_evidences_by_case(session=session, case_id=case_id)
    approved = [ev for ev in all_evidences if ev.is_approved and not ev.is_excluded]

    if not approved:
        raise HTTPException(
            status_code=400,
            detail="No approved evidence found. Please review and approve evidence first.",
        )

    try:
        scene_snapshot = await deduce_scene_state(
            scene_name=db_case.title,
            approved_evidences=approved,
            provider=provider,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"LLM scene deduction failed: {str(e)}",
        )

    # Save scene state
    state_json = scene_snapshot.model_dump_json(ensure_ascii=False)
    db_scene = crud.create_scene_state(
        session=session,
        case_id=case_id,
        scene_name=scene_snapshot.scene_name,
        state_json=state_json,
    )

    # Update case status
    crud.update_case(
        session=session,
        db_case=db_case,
        case_update=CaseUpdate(status="reviewed"),
    )
    session.refresh(db_case)

    return {
        "case": CaseResponse.model_validate(db_case),
        "scene": {
            "id": db_scene.id,
            "scene_name": db_scene.scene_name,
            "state": json.loads(db_scene.state_json),
        },
    }
```

- [ ] **Step 2: Verify the file imports correctly**

```bash
cd backend && uv run python -c "from app.api.routes.cases import router; print('Cases router OK, routes:', [r.path for r in router.routes])"
```

Expected: `Cases router OK, routes: ['/', '/', '/{case_id}', '/{case_id}', '/{case_id}', '/{case_id}/extract', '/{case_id}/scene']`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/cases.py
git commit -m "feat: add cases API route with 7 endpoints including LLM extract and scene deduce"
```

---

### Task 5: Create Evidences API Route

**Files:**
- Create: `backend/app/api/routes/evidences.py`

- [ ] **Step 1: Create evidences.py with 3 endpoints**

Create the file `backend/app/api/routes/evidences.py` with:

```python
from typing import Any

from fastapi import APIRouter, HTTPException

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.schemas.evidence import EvidenceResponse, EvidenceUpdate

router = APIRouter(prefix="/evidences", tags=["evidences"])


@router.get("/case/{case_id}", response_model=list[EvidenceResponse])
def read_evidences_by_case(
    session: SessionDep, current_user: CurrentUser, case_id: int
) -> Any:
    """Get all evidence items for a case."""
    evidences = crud.get_evidences_by_case(session=session, case_id=case_id)
    return evidences


@router.get("/{evidence_id}", response_model=EvidenceResponse)
def read_evidence(
    session: SessionDep, current_user: CurrentUser, evidence_id: int
) -> Any:
    """Get a single evidence item by ID."""
    evidence = crud.get_evidence(session=session, evidence_id=evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return evidence


@router.patch("/{evidence_id}", response_model=EvidenceResponse)
def update_evidence(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    evidence_id: int,
    evidence_update: EvidenceUpdate,
) -> Any:
    """Update an evidence item (approve, exclude, or edit details).
    
    Teachers use this to review extracted evidence: flip is_approved to True
    for items to include in scene deduction, or is_excluded to True to ignore.
    """
    db_evidence = crud.get_evidence(session=session, evidence_id=evidence_id)
    if not db_evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return crud.update_evidence(
        session=session, db_evidence=db_evidence, evidence_update=evidence_update
    )
```

- [ ] **Step 2: Verify the file imports**

```bash
cd backend && uv run python -c "from app.api.routes.evidences import router; print('Evidences router OK, routes:', [r.path for r in router.routes])"
```

Expected: `Evidences router OK, routes: ['/case/{case_id}', '/{evidence_id}', '/{evidence_id}']`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/evidences.py
git commit -m "feat: add evidences API route with list, get, and update endpoints"
```

---

### Task 6: Create Scenes API Route

**Files:**
- Create: `backend/app/api/routes/scenes.py`

- [ ] **Step 1: Create scenes.py with 2 endpoints**

Create the file `backend/app/api/routes/scenes.py` with:

```python
import json
from typing import Any

from fastapi import APIRouter, HTTPException

from app.api.deps import CurrentUser, SessionDep
from app.models import SceneState

router = APIRouter(prefix="/scenes", tags=["scenes"])


@router.get("/{scene_id}")
def read_scene(
    session: SessionDep, current_user: CurrentUser, scene_id: int
) -> Any:
    """Get a scene state snapshot with parsed JSON."""
    scene = session.get(SceneState, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return {
        "id": scene.id,
        "case_id": scene.case_id,
        "scene_name": scene.scene_name,
        "state": json.loads(scene.state_json),
        "created_at": scene.created_at.isoformat(),
        "updated_at": scene.updated_at.isoformat(),
    }


@router.delete("/{scene_id}")
def delete_scene(
    session: SessionDep, current_user: CurrentUser, scene_id: int
) -> dict:
    """Delete a scene state snapshot."""
    scene = session.get(SceneState, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    session.delete(scene)
    session.commit()
    return {"message": "Scene deleted successfully"}
```

- [ ] **Step 2: Verify the file imports**

```bash
cd backend && uv run python -c "from app.api.routes.scenes import router; print('Scenes router OK, routes:', [r.path for r in router.routes])"
```

Expected: `Scenes router OK, routes: ['/{scene_id}', '/{scene_id}']`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/scenes.py
git commit -m "feat: add scenes API route with get and delete endpoints"
```

---

### Task 7: Register New Routes in API Main

**Files:**
- Modify: `backend/app/api/main.py:1-14`

- [ ] **Step 1: Add import and registration lines**

Open `backend/app/api/main.py`. Change the imports from:
```python
from app.api.routes import items, login, private, users, utils
```

To:
```python
from app.api.routes import cases, evidences, items, login, private, scenes, users, utils
```

Then append after the last `include_router` line (after `api_router.include_router(private.router)`):

```python
api_router.include_router(cases.router)
api_router.include_router(evidences.router)
api_router.include_router(scenes.router)
```

- [ ] **Step 2: Verify all routers are registered**

```bash
cd backend && uv run python -c "
from app.main import app
paths = [r.path for r in app.routes]
print('Total routes:', len(paths))
for p in sorted(paths):
    if 'case' in p or 'evidence' in p or 'scene' in p:
        print(f'  JEVS: {p}')
"
```

Expected: Should list case, evidence, and scene paths (e.g., `/api/v1/cases/`, `/api/v1/evidences/case/{case_id}`, `/api/v1/scenes/{scene_id}`, etc.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/main.py
git commit -m "feat: register cases, evidences, and scenes routers in API main"
```

---

### Task 8: Add Service Skeletons for Image Router and Document Renderer

**Files:**
- Modify: `backend/app/services/image_router.py`
- Modify: `backend/app/services/document_renderer.py`

- [ ] **Step 1: Replace image_router.py placeholder**

Open `backend/app/services/image_router.py`. Replace the entire file content:

```python
"""Image Router — Phase 2: Will route scene state snapshots to FLUX API or Pillow fallback."""

from app.schemas.scene import SceneStateSnapshot


async def generate_scene_image(
    scene_state: SceneStateSnapshot,
    provider: str = "flux",
    style: str = "realistic",
) -> dict:
    """Generate a scene visualization image from a SceneStateSnapshot.

    Args:
        scene_state: The deduced 3D scene state with objects and environment.
        provider: Image generation backend. Options: "flux", "dalle", "pillow".
        style: Visual style. Options: "realistic", "sketch", "diagram".

    Returns:
        dict with keys: image_path, prompt_used, provider, style.

    Raises:
        NotImplementedError: Will be implemented in Phase 2.
    """
    raise NotImplementedError(
        "Image Router will be implemented in Phase 2. "
        "It will call FLUX API for photorealistic scene rendering, "
        "or fall back to Pillow for composite diagram generation."
    )
```

- [ ] **Step 2: Replace document_renderer.py placeholder**

Open `backend/app/services/document_renderer.py`. Replace the entire file content:

```python
"""Document Renderer — Phase 2: Will render case analysis reports in multiple formats."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Case, Evidence
    from app.schemas.scene import SceneStateSnapshot


async def render_case_report(
    case: Case,
    evidences: list[Evidence],
    scene_state: SceneStateSnapshot | None = None,
    fmt: str = "markdown",
) -> str:
    """Render a comprehensive case analysis report.

    Args:
        case: The case to generate a report for.
        evidences: All evidence items associated with the case.
        scene_state: Optional deduced scene state for spatial visualization.
        fmt: Output format. Options: "markdown", "html", "pdf".

    Returns:
        The rendered report as a string (for markdown/html) or PDF binary path.

    Raises:
        NotImplementedError: Will be implemented in Phase 2.
    """
    raise NotImplementedError(
        "Document Renderer will be implemented in Phase 2. "
        "It will use Jinja2 templates to render case analysis reports "
        "with evidence chains, scene diagrams, and deduction rationale."
    )
```

- [ ] **Step 3: Verify both files import cleanly**

```bash
cd backend && uv run python -c "from app.services.image_router import generate_scene_image; from app.services.document_renderer import render_case_report; print('Service skeletons imported OK')"
```

Expected: `Service skeletons imported OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/image_router.py backend/app/services/document_renderer.py
git commit -m "feat: add service skeletons for Image Router and Document Renderer (Phase 2)"
```

---

### Task 9: Generate and Apply Database Migration

**Files:**
- Create: `backend/app/alembic/versions/<hash>_add_jevs_tables.py` (auto-generated)

- [ ] **Step 1: Ensure PostgreSQL is running**

```bash
docker compose up -d postgres
```

Or if using a local PostgreSQL, verify connection:
```bash
cd backend && uv run python -c "from app.core.config import settings; print(settings.SQLALCHEMY_DATABASE_URI)"
```

- [ ] **Step 2: Generate the autogenerated migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "add_jevs_tables"
```

Expected: Creates a new file in `backend/app/alembic/versions/` like `xxxxxxxxxxxx_add_jevs_tables.py`. Check the output for the filename.

This will detect the `Case`, `Evidence`, `SceneState`, and `GeneratedImage` SQLModel tables (they all have `table=True` in `models.py`) and generate the appropriate `create_table` operations.

- [ ] **Step 3: Review the generated migration**

Read the generated file to verify it contains the expected tables. Look for `op.create_table('case', ...)`, `op.create_table('evidence', ...)`, `op.create_table('scenestate', ...)`, `op.create_table('generatedimage', ...)`.

- [ ] **Step 4: Apply the migration**

```bash
cd backend && uv run alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade ... -> xxxxxxxxxxxx, add_jevs_tables`

- [ ] **Step 5: Verify tables exist in the database**

```bash
cd backend && uv run python -c "
from sqlmodel import Session, text
from app.core.db import engine
with Session(engine) as session:
    result = session.exec(text(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public'\")).all()
    for row in sorted(result):
        print(row[0])
"
```

Expected: Should list `case`, `evidence`, `generatedimage`, `scenestate` along with existing tables.

- [ ] **Step 6: Commit the migration**

```bash
git add backend/app/alembic/versions/*add_jevs_tables*.py
git commit -m "feat: add alembic migration for JEVS tables (Case, Evidence, SceneState, GeneratedImage)"
```

---

### Task 10: End-to-End Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Start the backend server**

```bash
cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
sleep 2
```

- [ ] **Step 2: Verify the OpenAPI docs load**

```bash
curl -s http://localhost:8000/api/v1/openapi.json | uv run python -c "
import json, sys
spec = json.load(sys.stdin)
paths = spec.get('paths', {})
jev_paths = [p for p in paths if any(kw in p for kw in ['case', 'evidence', 'scene'])]
print(f'JEVS endpoints in OpenAPI spec: {len(jev_paths)}')
for p in sorted(jev_paths):
    methods = list(paths[p].keys())
    print(f'  {methods[0].upper():6s} {p}')
"
```

Expected: Should show 12 JEVS endpoints (7 cases + 3 evidences + 2 scenes).

- [ ] **Step 3: Stop the server**

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 4: Commit (if any changes)**

```bash
git status
# Only commit if there are unexpected changes from verification
```

---

## Verification Checklist

After all tasks are complete, verify:

1. **Config**: `uv run python -c "from app.core.config import settings; print(settings.DEEPSEEK_API_KEY)"` prints `None`
2. **CRUD**: All 10 functions importable from `app.crud`
3. **Routes**: All 12 endpoints appear in OpenAPI spec under `/api/v1/openapi.json`
4. **Migrations**: `uv run alembic current` shows the latest migration applied
5. **DB Tables**: `case`, `evidence`, `scenestate`, `generatedimage` exist in PostgreSQL
6. **Service Skeletons**: Both raise `NotImplementedError` with descriptive messages
7. **Clean imports**: `uv run python -c "import app.main"` succeeds without errors
