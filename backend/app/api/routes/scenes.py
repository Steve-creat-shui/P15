import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models import GeneratedImage, SceneState
from app.schemas.scene import SceneStateSnapshot
from app.services.image_router import generate_scene_image

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


@router.post("/{scene_id}/render")
async def render_scene_image(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    scene_id: int,
    provider: str = Query("flux", pattern="^(flux|dalle|pillow)$"),
    style: str = Query("realistic", pattern="^(realistic|sketch|diagram)$"),
) -> Any:
    """Generate a visualization image from a SceneStateSnapshot.

    Uses the FLUX API if FLUX_API_KEY is configured, otherwise falls back to
    a Pillow-generated 2D top-down diagram. The result is saved to disk and
    recorded in the GeneratedImage table.
    """
    scene = session.get(SceneState, scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # Parse stored JSON into SceneStateSnapshot
    try:
        state_dict = json.loads(scene.state_json)
        scene_snapshot = SceneStateSnapshot(**state_dict)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse scene state JSON: {str(e)}",
        )

    # Generate the image
    try:
        result = await generate_scene_image(
            scene_state=scene_snapshot,
            provider=provider,
            style=style,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Image generation failed: {str(e)}",
        )

    # Record in database
    db_image = GeneratedImage(
        case_id=scene.case_id,
        scene_id=scene_id,
        image_type=result["image_type"],
        image_path=result["image_path"],
        prompt_used=result["prompt_used"],
        provider=result["provider"],
        style=result["style"],
    )
    session.add(db_image)
    session.commit()
    session.refresh(db_image)

    # Update case status to 'generated'
    db_case = crud.get_case(session=session, case_id=scene.case_id)
    if db_case:
        from app.schemas.evidence import CaseUpdate
        crud.update_case(
            session=session,
            db_case=db_case,
            case_update=CaseUpdate(status="generated"),
        )

    return {
        "id": db_image.id,
        "scene_id": scene_id,
        "case_id": scene.case_id,
        "image_path": result["image_path"],
        "prompt_used": result["prompt_used"],
        "provider": result["provider"],
        "style": result["style"],
        "image_type": result["image_type"],
    }
