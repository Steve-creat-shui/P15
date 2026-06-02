import sentry_sdk
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware
from pathlib import Path

from app.api.main import api_router
from app.core.config import settings


def custom_generate_unique_id(route: APIRoute) -> str:
    if route.tags:
        return f"{route.tags[0]}-{route.name}"
    return route.name


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
)

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

_static_images_dir = Path(__file__).resolve().parent.parent / "static" / "images"
_static_images_dir.mkdir(parents=True, exist_ok=True)

app.include_router(api_router, prefix=settings.API_V1_STR)

# Serve generated images
@app.get(f"{settings.API_V1_STR}/static/images/{{img_path:path}}")
def serve_static_image(img_path: str):
    full = _static_images_dir / img_path
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        full.resolve().relative_to(_static_images_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")
    return FileResponse(str(full))
