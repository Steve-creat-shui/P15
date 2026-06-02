"""JEVS API Routes — 证据提取、场景构建、图像生成的全部端点。

所有端点均使用 async def，数据库 session 通过 Depends 注入。
"""

import json
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from sqlmodel import func, select

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models import Case, Evidence, GeneratedImage, Scene, SceneState
from app.schemas.document import DocumentRenderRequest
from app.schemas.evidence import (
    CaseCreate,
    CaseResponse,
    CaseUpdate,
    EvidenceResponse,
    EvidenceUpdate,
    SceneCreate,
    SceneResponse,
    SceneUpdate,
)
from app.services.document_renderer import (
    render_grid_paper,
    render_a4_document,
    render_chat_screenshot,
)
from app.services.evidence_filter import (
    EvidenceFilterResult,
    EvidenceItem,
    extract_evidence,
)
from app.services.file_parser import FileParser
from app.services.scene_engine import (
    SceneState as SceneStateSchema,
    SceneObject,
    build_scene_from_evidence,
    evidence_list_to_prompts,
    get_render_position,
    get_scene_prompt_warning,
    object_to_inpaint_prompt,
    scene_objects_to_rich_prompt,
    suggest_scenes_from_text,
)
from app.services.image_router import ImageRouter

router = APIRouter(tags=["evidence"])

# ==============================================================================
# Mock Extractor（无 API Key 时的规则 fallback）
# ==============================================================================


def _mock_extract(raw_text: str) -> EvidenceFilterResult:
    """规则式 mock 提取器。扫描关键词生成测试数据。

    当 DEEPSEEK_API_KEY 或 OPENAI_API_KEY 未配置时使用此 fallback。
    """
    extractable: list[EvidenceItem] = []
    uncertain: list[EvidenceItem] = []
    non_visual: list[str] = []

    # 规则匹配
    import re

    # 物证 + 位置
    patterns = [
        (r"床底.*?(一把)? ?(水果刀|菜刀|匕首)", "物证", "under_bed_left", {"bloody": True}),
        (r"床头柜.*?(一部)? ?(手机|iPhone|平板)", "物证", "on_desk", {"broken": True}),
        (r"桌.*?(一份)? ?(欠条|合同|借条|书证)", "书证", "on_desk", None),
        (r"门口.*?玻璃碎片", "物证", "near_door", {"broken": True}),
        (r"地面.*?玻璃碎片", "物证", "on_floor", {"broken": True}),
    ]

    found_any = False
    for pattern, ev_type, loc, state in patterns:
        m = re.search(pattern, raw_text)
        if m:
            desc = m.group(2) if m.lastindex and m.lastindex >= 2 else m.group(0)[:30]
            # 更精确的描述提取
            full_match = m.group(0)
            if "水果刀" in full_match:
                desc = "水果刀（刀刃有血迹）"
            elif "手机" in full_match or "iPhone" in full_match:
                desc = "iPhone手机（屏幕破碎）"
            elif "欠条" in full_match or "合同" in full_match or "借条" in full_match:
                desc = "手写欠条（载明欠款5万元）"
            elif "玻璃碎片" in full_match:
                desc = "玻璃碎片"

            extractable.append(EvidenceItem(
                evidence_type=ev_type,
                description=desc,
                location=loc,
                state=state,
                source_quote=full_match[:50],
            ))
            found_any = True

    # 心理活动 / 主观
    if "感到非常恐惧" in raw_text or "感到恐惧" in raw_text:
        non_visual.append("被害人感到非常恐惧的心理状态（不可视化）")
    if "恐惧" in raw_text:
        uncertain.append(EvidenceItem(
            evidence_type="空间关系",
            description="被害人张某的描述：感到恐惧",
            location=None,
            state=None,
            source_quote="被害人张某称当时感到非常恐惧",
        ))

    # 主观判断
    if "认为被告" in raw_text or "主观恶意" in raw_text or "蓄意" in raw_text:
        non_visual.append("公诉人对被告主观恶意的评价（不可视化）")

    if "张某称" in raw_text:
        uncertain.append(EvidenceItem(
            evidence_type="空间关系",
            description="张某的证词陈述",
            location=None,
            state=None,
            source_quote="被害人张某称当时感到非常恐惧，认为被告蓄意伤害",
        ))

    # 如果没有匹配到任何规则，回退到基础划分
    if not found_any and not uncertain:
        extractable.append(EvidenceItem(
            evidence_type="物证",
            description="案件材料中提及的物证",
            location="on_floor",
            state=None,
            source_quote=raw_text[:50],
        ))

    return EvidenceFilterResult(
        extractable_evidence=extractable,
        uncertain_evidence=uncertain,
        non_visualizable_content=non_visual,
    )


# ==============================================================================
# Cases（案件 CRUD）
# ==============================================================================


@router.post("/cases/", response_model=CaseResponse)
async def create_case(
    *, session: SessionDep, current_user: CurrentUser, case_in: CaseCreate
) -> Any:
    """创建新案件。

    Body: {"title": "案件标题", "raw_text": "判决书全文"}
    """
    db_case = crud.create_case(session=session, case_in=case_in)
    return db_case


@router.post("/cases/upload", response_model=CaseResponse)
async def create_case_from_file(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    title: str = Form(None),
) -> Any:
    """上传 PDF / DOCX / TXT 文件，自动提取文本并创建案件。

    使用 multipart/form-data:
    - file: 案件材料文件（.txt / .pdf / .docx）
    - title: 案件标题（可选，默认使用文件名）
    """
    # 校验文件大小（限制 20MB）
    MAX_SIZE = 20 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大（{len(content) / 1024 / 1024:.1f} MB），请上传 20 MB 以内的文件。",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="上传的文件为空。")

    # 解析文件提取文本
    filename = file.filename or "untitled"
    try:
        raw_text = FileParser.parse(content, filename=filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"文件解析失败: {str(e)}",
        )

    if not raw_text.strip():
        raise HTTPException(
            status_code=422,
            detail="文件中未提取到文本内容。请确认文件包含可读文字。",
        )

    # 自动生成标题（取文件名去掉扩展名）
    if not title:
        from pathlib import Path
        title = Path(filename).stem

    case_in = CaseCreate(title=title, raw_text=raw_text)
    db_case = crud.create_case(session=session, case_in=case_in)
    return db_case


@router.get("/cases/", response_model=dict)
def list_cases(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """列出案件，最新在前。"""
    count_statement = select(func.count()).select_from(Case)
    count = session.exec(count_statement).one()
    cases = crud.get_cases(session=session, skip=skip, limit=limit)
    return {"data": [CaseResponse.model_validate(c) for c in cases], "count": count}


@router.get("/cases/{case_id}", response_model=CaseResponse)
def read_case(
    session: SessionDep, current_user: CurrentUser, case_id: int
) -> Any:
    """获取单个案件。"""
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return db_case


@router.patch("/cases/{case_id}", response_model=CaseResponse)
def update_case_info(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
    case_update: CaseUpdate,
) -> Any:
    """更新案件标题、文本或状态。"""
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return crud.update_case(session=session, db_case=db_case, case_update=case_update)


@router.delete("/cases/{case_id}")
def remove_case(
    session: SessionDep, current_user: CurrentUser, case_id: int
) -> dict:
    """删除案件及关联的所有证据、场景、图片。"""
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="案件不存在")
    crud.delete_case(session=session, db_case=db_case)
    return {"message": "案件已删除"}


@router.post("/cases/{case_id}/extract")
async def extract_case_evidence(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
) -> Any:
    """触发 Evidence Filtering Engine 提取证据。

    调用 evidence_filter.extract_evidence(case.raw_text)，
    将 extractable + uncertain 结果全部存入 Evidence 表，
    non_visualizable_content 也记录为 excluded 条目。
    case.status 更新为 "extracted"。
    """
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="案件不存在")

    if not db_case.raw_text:
        raise HTTPException(status_code=400, detail="案件没有原始文本可提取")

    # 调用 Evidence Filtering Engine（若 API Key 未配置则使用规则 fallback）
    used_llm = False
    try:
        from app.core.config import settings
        if settings.DEEPSEEK_API_KEY or settings.OPENAI_API_KEY:
            result: EvidenceFilterResult = await extract_evidence(db_case.raw_text)
            used_llm = True
        else:
            result = _mock_extract(db_case.raw_text)
    except Exception:
        # LLM 调用失败时自动 fallback 到规则提取器，确保用户不丢数据
        result = _mock_extract(db_case.raw_text)

    # 批量写入 extractable 证据
    extractable_dicts = [
        {
            "evidence_type": ev.evidence_type,
            "category": "extractable",
            "description": ev.description,
            "location": ev.location,
            "state_dict": ev.state,
        }
        for ev in result.extractable_evidence
    ]
    created_extractable = crud.create_evidences_batch(
        session=session, case_id=case_id, evidences=extractable_dicts
    )

    # 批量写入 uncertain 证据
    uncertain_dicts = [
        {
            "evidence_type": ev.evidence_type,
            "category": "uncertain",
            "description": ev.description,
            "location": ev.location,
            "state_dict": ev.state,
        }
        for ev in result.uncertain_evidence
    ]
    created_uncertain = crud.create_evidences_batch(
        session=session, case_id=case_id, evidences=uncertain_dicts
    )

    # 将 non_visualizable_content 也记录为 excluded 条目（供教师审核）
    nv_dicts = [
        {
            "evidence_type": "书证",
            "category": "non_visualizable",
            "description": desc[:255],
            "location": None,
            "state_dict": None,
        }
        for desc in result.non_visualizable_content
    ]
    if nv_dicts:
        nv_created = crud.create_evidences_batch(
            session=session, case_id=case_id, evidences=nv_dicts
        )
        # 自动排除不可视化内容
        for ev in nv_created:
            crud.update_evidence(
                session=session,
                db_evidence=ev,
                evidence_update=EvidenceUpdate(is_excluded=True),
            )

    # 更新案件状态
    crud.update_case(
        session=session,
        db_case=db_case,
        case_update=CaseUpdate(status="extracted"),
    )
    session.refresh(db_case)

    return {
        "case": CaseResponse.model_validate(db_case),
        "extraction_result": {
            "extractable_count": len(result.extractable_evidence),
            "uncertain_count": len(result.uncertain_evidence),
            "non_visualizable_count": len(result.non_visualizable_content),
        },
        "stored_evidence": {
            "extractable": [EvidenceResponse.model_validate(e) for e in created_extractable],
            "uncertain": [EvidenceResponse.model_validate(e) for e in created_uncertain],
        },
        "used_llm": used_llm,
    }


@router.get("/cases/{case_id}/evidence")
def get_case_evidence(
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
    category: str | None = Query(
        None, pattern="^(extractable|uncertain|non_visualizable)$"
    ),
) -> Any:
    """获取案件所有证据条目。支持按 category 过滤。

    category 可选值: extractable / uncertain / non_visualizable
    """
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="案件不存在")

    all_evidences = crud.get_evidences_by_case(session=session, case_id=case_id)

    if category:
        all_evidences = [ev for ev in all_evidences if ev.category == category]

    return [EvidenceResponse.model_validate(ev) for ev in all_evidences]


@router.patch("/evidence/{evidence_id}", response_model=EvidenceResponse)
def update_evidence_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    evidence_id: int,
    body: EvidenceUpdate,
) -> Any:
    """教师审核单条证据（人工确认/排除/编辑）。

    Body: {
        "is_approved": true,
        "is_excluded": false,
        "location": "under_bed_left",
        "description": "带血水果刀"
    }
    """
    db_evidence = crud.get_evidence(session=session, evidence_id=evidence_id)
    if not db_evidence:
        raise HTTPException(status_code=404, detail="证据不存在")

    return crud.update_evidence(
        session=session, db_evidence=db_evidence, evidence_update=body
    )


# ==============================================================================
# Scene Building（场景构建）
# ==============================================================================


@router.post("/cases/{case_id}/build-scene")
def build_scene(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
) -> Any:
    """根据已确认的证据构建 Scene State。

    只处理 is_approved=True 且 is_excluded=False 的证据。
    调用 scene_engine.build_scene_from_evidence() 进行确定性映射（无 LLM）。
    结果存入 SceneState 表。
    """
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="案件不存在")

    # 收集已确认证据
    all_evidences = crud.get_evidences_by_case(session=session, case_id=case_id)
    approved = [ev for ev in all_evidences if ev.is_approved and not ev.is_excluded]

    if not approved:
        raise HTTPException(
            status_code=422,
            detail="没有已确认的证据。请先审核并确认至少一条证据。",
        )

    # 将 DB Evidence 转为 evidence_filter.EvidenceItem
    evidence_items = [
        EvidenceItem(
            evidence_type=ev.evidence_type,
            description=ev.description,
            location=ev.location,
            state=json.loads(ev.state_json) if ev.state_json else None,
            source_quote="",  # DB 中不存储 source_quote，从 extraction 结果中获取
        )
        for ev in approved
    ]

    # 调用 Scene State Engine（确定性，不调 LLM）
    try:
        scene = build_scene_from_evidence(evidence_items, scene_name=db_case.title)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"场景构建失败: {str(e)}",
        )

    # 存入 SceneState 表
    state_json = scene.model_dump_json(ensure_ascii=False)
    db_scene = crud.create_scene_state(
        session=session,
        case_id=case_id,
        scene_name=scene.scene_name,
        state_json=state_json,
    )

    # 更新案件状态
    crud.update_case(
        session=session,
        db_case=db_case,
        case_update=CaseUpdate(status="reviewed"),
    )
    session.refresh(db_case)

    return {
        "case": CaseResponse.model_validate(db_case),
        "scene": json.loads(db_scene.state_json),
        "scene_id": db_scene.id,
    }


# ==============================================================================
# Image Generation（图像生成）
# ==============================================================================


@router.post("/cases/{case_id}/generate-images")
async def generate_images(
    case_id: int,
    data: dict,  # {"scene_id": int, "provider_config": {...}, "provider": "dalle", "style": ...}
    session: SessionDep,
) -> Any:
    """
    为指定场景生成图片（单次 API 调用，包含所有物证）。
    移除了原有的 [:5] 硬上限和 inpainting 循环。
    """
    scene_id = data.get("scene_id")
    if scene_id is not None:
        scene_id = int(scene_id)
    provider_config = data.get("provider_config")
    provider = data.get("provider", "dalle")

    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")

    # 获取该场景已确认的证据
    if scene_id:
        evidences = session.exec(
            select(Evidence).where(
                Evidence.scene_id == scene_id,
                Evidence.is_approved == True,
                Evidence.is_excluded == False,
            )
        ).all()
        scene_obj = session.get(Scene, scene_id)
        scene_name = scene_obj.name if scene_obj else "案发现场"
        room_type = scene_obj.room_type if scene_obj else "unknown"
    else:
        # 向后兼容：未指定 scene_id 时使用所有已确认证据
        evidences = session.exec(
            select(Evidence).where(
                Evidence.case_id == case_id,
                Evidence.is_approved == True,
                Evidence.is_excluded == False,
            )
        ).all()
        scene_name = "案发现场"
        room_type = "unknown"

    if not evidences:
        raise HTTPException(
            status_code=400, detail="没有已确认的证据，请先在证据确认页审核证据"
        )

    # 构建 SceneState
    evidence_items = [
        EvidenceItem(
            evidence_type=e.evidence_type,
            description=e.description,
            location=e.location,
            state=json.loads(e.state_json) if e.state_json else {},
            source_quote="",
        )
        for e in evidences
    ]

    scene_state = build_scene_from_evidence(evidence_items, scene_name)
    scene_state.base_room_type = room_type

    # 检查 prompt 警告
    warning = get_scene_prompt_warning(scene_state)

    # 生成图片（单次 API 调用，无 [:5] 限制）
    image_router = ImageRouter(provider_config=provider_config)
    case_style = case.style_description if case else None
    image_path, omitted_items = await image_router.generate_scene_with_objects(
        scene_state, case_id, case_style=case_style
    )

    # 存入数据库
    prompt_used, _ = scene_objects_to_rich_prompt(scene_state, case_style=case_style)
    db_image = GeneratedImage(
        case_id=case_id,
        scene_id=scene_id,
        image_type="scene_overview",
        image_path=image_path,
        prompt_used=prompt_used,
        provider=provider,
        style=data.get("style", "realistic"),
        created_at=datetime.now(timezone.utc),
    )
    session.add(db_image)
    session.commit()
    session.refresh(db_image)

    return {
        "image": {
            "id": db_image.id,
            "case_id": db_image.case_id,
            "scene_id": db_image.scene_id,
            "image_type": db_image.image_type,
            "image_path": db_image.image_path,
            "provider": db_image.provider,
            "style": db_image.style,
            "created_at": db_image.created_at.isoformat() if db_image.created_at else None,
        },
        "omitted_items": omitted_items,
        "warning": warning if warning["should_warn"] else None,
    }


@router.post("/cases/{case_id}/generate-all-scenes")
async def generate_all_scenes(
    case_id: int,
    data: dict,  # {"provider": "dalle"|"flux"}
    session: SessionDep,
) -> Any:
    """
    ⭐ 串行批量生成所有场景图。

    重要：串行执行（不并发），原因：
    1. DALL·E 3 并发限制：每分钟 5 张（免费层 1 张）
    2. 并发打满会导致 429 错误，整批失败
    3. 串行确保稳定性，每张图间隔约 1.2 秒
    """
    import asyncio

    provider = data.get("provider", "dalle")
    provider_config = data.get("provider_config")
    scenes = crud.get_scenes_by_case(session=session, case_id=case_id)

    if not scenes:
        raise HTTPException(
            status_code=400, detail="该案件没有场景，请先在场景管理页创建场景"
        )

    results = []
    errors = []

    for i, scene in enumerate(scenes):
        try:
            # 获取该场景的已确认证据
            evidences = session.exec(
                select(Evidence).where(
                    Evidence.scene_id == scene.id,
                    Evidence.is_approved == True,
                    Evidence.is_excluded == False,
                )
            ).all()

            if not evidences:
                errors.append({"scene": scene.name, "error": "没有已确认的证据，跳过"})
                continue

            # 构建 SceneState
            evidence_items = [
                EvidenceItem(
                    evidence_type=e.evidence_type,
                    description=e.description,
                    location=e.location,
                    state=json.loads(e.state_json) if e.state_json else {},
                    source_quote="",
                )
                for e in evidences
            ]

            scene_state = build_scene_from_evidence(evidence_items, scene.name)
            scene_state.base_room_type = scene.room_type

            # 生成图片
            img_router = ImageRouter(provider_config=provider_config)
            db_case = session.get(Case, case_id)
            case_style = db_case.style_description if db_case else None
            image_path, omitted_items = await img_router.generate_scene_with_objects(
                scene_state, case_id, case_style=case_style
            )

            # 存入数据库
            prompt_used, _ = scene_objects_to_rich_prompt(scene_state, case_style=case_style)
            db_image = GeneratedImage(
                case_id=case_id,
                scene_id=scene.id,
                image_type="scene_overview",
                image_path=image_path,
                prompt_used=prompt_used,
                provider=provider,
                style="realistic",
                created_at=datetime.now(timezone.utc),
            )
            session.add(db_image)
            session.commit()
            session.refresh(db_image)

            results.append({
                "scene": scene.name,
                "scene_id": scene.id,
                "image_id": db_image.id,
                "image_path": image_path,
                "omitted_items": omitted_items,
                "progress": f"{i + 1}/{len(scenes)}",
            })

            # ⭐ 串行间隔：避免触发 API 速率限制
            if i < len(scenes) - 1:
                await asyncio.sleep(1.2)

        except Exception as e:
            errors.append({"scene": scene.name, "error": str(e)})
            # 单个场景失败不中断整体流程
            continue

    return {
        "total_scenes": len(scenes),
        "generated": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    }


@router.post("/evidence/{evidence_id}/generate-closeup")
async def generate_evidence_closeup(
    evidence_id: int,
    data: dict,
    session: SessionDep,
) -> Any:
    """
    生成物证特写图。

    自动策略选择：
    - 该物证所在场景有已生成的全图 → 裁剪法（背景100%一致）
    - 无场景全图 → Prompt 锁定法（背景相似）

    返回字段包含 closeup_strategy，
    告知前端当前使用了哪种策略。
    """
    evidence = session.get(Evidence, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="证据不存在")

    provider_config = data.get("provider_config", None)
    image_router = ImageRouter(provider_config=provider_config)

    # 查找该物证所在场景的最新全图
    scene_image_path = None
    scene_name = "案发现场"
    room_type = "unknown"

    if evidence.scene_id:
        scene = session.get(Scene, evidence.scene_id)
        if scene:
            scene_name = scene.name
            room_type = scene.room_type

            # 找该场景最新的 scene_overview 图片
            latest_scene_image = session.exec(
                select(GeneratedImage)
                .where(
                    GeneratedImage.scene_id == evidence.scene_id,
                    GeneratedImage.image_type == "scene_overview",
                )
                .order_by(GeneratedImage.created_at.desc())
            ).first()

            if latest_scene_image:
                scene_image_path = latest_scene_image.image_path

    # 构建 SceneObject
    obj = SceneObject(
        id=f"evidence_{evidence_id}",
        object_type=evidence.evidence_type,
        description=evidence.description,
        location_key=evidence.location or "on_floor",
        render_position=get_render_position(evidence.location or "on_floor"),
        state=json.loads(evidence.state_json) if evidence.state_json else {},
        evidence_category=evidence.category,
    )

    # 生成特写（自动选择策略）
    # 获取 case 级别风格描述（如果可用）
    db_case = session.get(Case, evidence.case_id)
    case_style = db_case.style_description if db_case else None
    closeup_path, strategy_used = await image_router.generate_evidence_closeup(
        obj=obj,
        case_id=evidence.case_id,
        scene_image_path=scene_image_path,
        scene_name=scene_name,
        room_type=room_type,
        case_style=case_style,
    )

    # 查找参考预览图（裁剪法才有）
    preview_path = None
    if strategy_used == "crop":
        candidate = closeup_path.replace(".png", "_preview.png")
        if os.path.exists(candidate):
            preview_path = candidate

    # 存入数据库
    db_image = GeneratedImage(
        case_id=evidence.case_id,
        scene_id=evidence.scene_id,
        image_type="evidence_closeup",
        image_path=closeup_path,
        prompt_used=(
            f"[裁剪法，来自场景全图: {scene_image_path}]"
            if strategy_used == "crop"
            else object_to_inpaint_prompt(obj)
        ),
        provider="crop" if strategy_used == "crop" else image_router.config.get("evidence_closeup", "dalle"),
        style="realistic",
        created_at=datetime.now(timezone.utc),
        closeup_strategy=strategy_used,
        reference_preview_path=preview_path,
    )
    session.add(db_image)
    session.commit()
    session.refresh(db_image)

    return {
        "id": db_image.id,
        "case_id": db_image.case_id,
        "scene_id": db_image.scene_id,
        "image_type": db_image.image_type,
        "image_path": db_image.image_path,
        "provider": db_image.provider,
        "created_at": db_image.created_at.isoformat() if db_image.created_at else None,
        "strategy_used": strategy_used,
        "strategy_label": "裁剪法（背景100%一致）" if strategy_used == "crop" else "AI生成（背景相似）",
        "has_reference_preview": preview_path is not None,
        "scene_image_used": scene_image_path,
    }


@router.get("/cases/{case_id}/images")
def get_case_images(
    session: SessionDep,
    current_user: CurrentUser,
    case_id: int,
    image_type: str | None = Query(
        None, pattern="^(scene_overview|evidence_closeup|document_render)$"
    ),
) -> Any:
    """获取案件所有生成图片。

    支持按 image_type 过滤。
    """
    db_case = crud.get_case(session=session, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="案件不存在")

    statement = select(GeneratedImage).where(GeneratedImage.case_id == case_id)
    if image_type:
        statement = statement.where(GeneratedImage.image_type == image_type)
    statement = statement.order_by(GeneratedImage.created_at.desc())

    images = list(session.exec(statement).all())

    return [
        {
            "id": img.id,
            "case_id": img.case_id,
            "scene_id": img.scene_id,
            "image_type": img.image_type,
            "image_path": img.image_path,
            "provider": img.provider,
            "style": img.style,
            "created_at": img.created_at.isoformat() if img.created_at else None,
        }
        for img in images
    ]


# ==============================================================================
# Projects（案件列表）
# ==============================================================================


@router.get("/projects")
def list_projects(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """获取所有案件列表（简要信息）。

    包含每个案件的证据数量和图片数量。
    """
    cases = crud.get_cases(session=session, skip=skip, limit=limit)

    projects = []
    for c in cases:
        evidence_count = len(crud.get_evidences_by_case(session=session, case_id=c.id))
        img_count_stmt = select(func.count()).select_from(GeneratedImage).where(
            GeneratedImage.case_id == c.id
        )
        image_count = session.exec(img_count_stmt).one()

        projects.append({
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "style_description": c.style_description,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "evidence_count": evidence_count,
            "image_count": image_count,
        })

    return projects


# Static images are served via FastAPI StaticFiles mount in app/main.py
# URL: /api/v1/static/images/{file_path}


# ==============================================================================
# Scene 管理端点
# ==============================================================================


@router.post("/cases/{case_id}/scenes/suggest")
async def suggest_scenes(case_id: int, session: SessionDep):
    """扫描案件文本，返回建议的场景列表。"""
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    suggestions = suggest_scenes_from_text(case.raw_text)
    return {"suggestions": suggestions}


@router.post("/cases/{case_id}/scenes", response_model=SceneResponse)
async def create_scene_endpoint(
    case_id: int, data: SceneCreate, session: SessionDep
):
    """为案件创建新场景。"""
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    scene = crud.create_scene(session=session, case_id=case_id, data=data)
    count = crud.get_scene_evidence_count(session=session, scene_id=scene.id)
    return SceneResponse(**scene.model_dump(), evidence_count=count)


@router.get("/cases/{case_id}/scenes", response_model=list[SceneResponse])
async def list_scenes(case_id: int, session: SessionDep):
    """列出案件所有场景，含每个场景的证据数量。"""
    scenes = crud.get_scenes_by_case(session=session, case_id=case_id)
    result = []
    for s in scenes:
        count = crud.get_scene_evidence_count(session=session, scene_id=s.id)
        result.append(SceneResponse(**s.model_dump(), evidence_count=count))
    return result


@router.patch("/scenes/{scene_id}", response_model=SceneResponse)
async def update_scene_endpoint(
    scene_id: int, data: SceneUpdate, session: SessionDep
):
    """更新场景名称或房间类型。"""
    scene = crud.update_scene(session=session, scene_id=scene_id, data=data)
    if not scene:
        raise HTTPException(status_code=404, detail="场景不存在")
    count = crud.get_scene_evidence_count(session=session, scene_id=scene.id)
    return SceneResponse(**scene.model_dump(), evidence_count=count)


@router.delete("/scenes/{scene_id}")
async def delete_scene_endpoint(scene_id: int, session: SessionDep):
    """删除场景。该场景下的证据自动解除绑定（ON DELETE SET NULL）。"""
    ok = crud.delete_scene(session=session, scene_id=scene_id)
    if not ok:
        raise HTTPException(status_code=404, detail="场景不存在")
    return {"message": "场景已删除，该场景下的证据已自动解除绑定"}


@router.patch("/cases/{case_id}/scenes/reorder")
async def reorder_scenes_endpoint(
    case_id: int,
    data: dict,
    session: SessionDep,
):
    """重新排列场景顺序。Body: {"scene_ids": [3, 1, 2]}"""
    scene_ids = data.get("scene_ids", [])
    scenes = crud.reorder_scenes(
        session=session, case_id=case_id, scene_ids_ordered=scene_ids
    )
    return {"scenes": scenes}


# ==============================================================================
# 书证模板渲染
# ==============================================================================


@router.get("/templates")
async def list_templates():
    """返回可用的书证模板列表及所需字段。"""
    return {
        "templates": [
            {
                "type": "grid_paper",
                "label": "格子纸（手写风格）",
                "description": "适用于手写笔记、便条、手写协议等",
                "required_fields": ["text_content"],
                "optional_fields": ["title"],
            },
            {
                "type": "a4_document",
                "label": "A4 打印文件",
                "description": "适用于合同、欠条、正式文件、证明材料等",
                "required_fields": ["text_content"],
                "optional_fields": ["title", "document_date"],
            },
            {
                "type": "chat_screenshot",
                "label": "手机聊天截图",
                "description": "适用于微信/短信聊天记录等电子书证",
                "required_fields": ["messages"],
                "optional_fields": [],
            },
        ]
    }


@router.post("/evidence/{evidence_id}/render-document")
async def render_document(
    evidence_id: int,
    data: DocumentRenderRequest,
    session: SessionDep,
) -> Any:
    """
    根据模板类型调用 Pillow 渲染书证图片。
    文字 100% 来自请求参数，不经过任何 AI 处理。
    """
    evidence = session.get(Evidence, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="证据不存在")

    # 确定输出目录
    from pathlib import Path
    output_dir = Path(__file__).resolve().parent.parent.parent / "static" / "images" / str(evidence.case_id) / "documents"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(output_dir / f"doc_{evidence_id}_{int(datetime.now(timezone.utc).timestamp())}.png")

    if data.template_type == "grid_paper":
        if not data.text_content:
            raise HTTPException(status_code=422, detail="格子纸模板需要 text_content")
        image_path = render_grid_paper(
            text=data.text_content,
            title=data.title,
            output_path=output_path,
        )
    elif data.template_type == "a4_document":
        if not data.text_content:
            raise HTTPException(status_code=422, detail="A4 模板需要 text_content")
        image_path = render_a4_document(
            text=data.text_content,
            title=data.title,
            document_date=data.document_date,
            output_path=output_path,
        )
    elif data.template_type == "chat_screenshot":
        if not data.messages:
            raise HTTPException(status_code=422, detail="聊天截图模板需要 messages")
        messages_dict = [m.model_dump() for m in data.messages]
        image_path = render_chat_screenshot(
            messages=messages_dict,
            output_path=output_path,
        )
    else:
        raise HTTPException(status_code=400, detail=f"不支持的模板类型: {data.template_type}")

    # 存入数据库
    db_image = GeneratedImage(
        case_id=evidence.case_id,
        scene_id=evidence.scene_id,
        image_type="document_render",
        image_path=image_path,
        prompt_used=f"[Pillow渲染，无AI] 模板: {data.template_type}, 标题: {data.title}",
        provider="pillow",
        style="document",
        created_at=datetime.now(timezone.utc),
    )
    session.add(db_image)
    session.commit()
    session.refresh(db_image)

    return {
        "id": db_image.id,
        "case_id": db_image.case_id,
        "scene_id": db_image.scene_id,
        "image_type": db_image.image_type,
        "image_path": db_image.image_path,
        "provider": db_image.provider,
        "style": db_image.style,
        "created_at": db_image.created_at.isoformat() if db_image.created_at else None,
    }
