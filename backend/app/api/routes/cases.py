import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlmodel import func, select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models import Case
from app.schemas.evidence import CaseCreate, CaseResponse, CaseUpdate
from app.schemas.scene import SceneStateSnapshot
from app.services.document_renderer import render_case_report
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


@router.get("/{case_id}/scene")
def read_case_scene(
    session: SessionDep, current_user: CurrentUser, case_id: int
) -> Any:
    """Get the latest scene state snapshot for a case."""
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    db_scene = crud.get_scene_by_case(session=session, case_id=case_id)
    if not db_scene:
        raise HTTPException(status_code=404, detail="No scene state found for this case")

    return {
        "id": db_scene.id,
        "case_id": db_scene.case_id,
        "scene_name": db_scene.scene_name,
        "state": json.loads(db_scene.state_json),
        "created_at": db_scene.created_at.isoformat(),
        "updated_at": db_scene.updated_at.isoformat(),
    }


@router.get("/{case_id}/report")
async def get_case_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
    fmt: str = Query("markdown", pattern="^(markdown|html)$"),
    evidence_ids: str | None = Query(None, description="Comma-separated evidence IDs to include"),
    image_ids: str | None = Query(None, description="Comma-separated image IDs to include"),
) -> Any:
    """Render a comprehensive case analysis report.

    Includes case info, evidence chain analysis, scene deduction results,
    and the original raw text excerpt. Available in markdown and HTML formats.

    Optionally filter by evidence_ids or image_ids (comma-separated).
    """
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    evidences = crud.get_evidences_by_case(session=session, case_id=case_id)

    # Filter by selected evidence IDs if provided
    if evidence_ids:
        selected_ids = set(int(x.strip()) for x in evidence_ids.split(",") if x.strip())
        evidences = [e for e in evidences if e.id in selected_ids]

    # Try to get scene state if available
    scene_snapshot = None
    db_scene = crud.get_scene_by_case(session=session, case_id=case_id)
    if db_scene:
        try:
            state_dict = json.loads(db_scene.state_json)
            scene_snapshot = SceneStateSnapshot(**state_dict)
        except Exception:
            pass  # Scene state is malformed, render without it

    try:
        report = await render_case_report(
            case=db_case,
            evidences=evidences,
            scene_state=scene_snapshot,
            fmt=fmt,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Report rendering failed: {str(e)}",
        )

    response_data = {
        "case_id": case_id,
        "format": fmt,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if fmt == "html":
        return HTMLResponse(content=report)
    else:
        response_data["content"] = report
        return response_data
