"""
物证特写生成器。

策略优先级：
1. 裁剪法（crop）：从场景全图裁出物证区域，Pillow 放大 + 增强
   - 优点：背景 100% 与场景全图一致，零 API 成本
   - 条件：该物证所在场景的全图已生成

2. Prompt 锁定法（prompt_lock）：无场景全图时的 fallback
   - 把场景全图的 style/lighting 描述强制写进特写 prompt
   - 优点：单独可用，不依赖场景全图
   - 缺点：不同模型生成，背景相似但不完全一致
"""

import os
import logging
from PIL import Image, ImageFilter, ImageEnhance
from pathlib import Path

logger = logging.getLogger(__name__)


# ===== 常量 =====

# 裁剪区域相对于图片尺寸的比例（宽/高各取多少）
# 值越大，裁剪范围越宽，物证在特写中越小但背景更多
CROP_REGION_RATIO = 0.60  # 取图片 60% 宽高的区域作为特写（扩大覆盖范围，减少位置偏差导致的目标丢失）

# 特写最终输出尺寸
CLOSEUP_OUTPUT_SIZE = (1024, 1024)

# 裁剪后的锐化增强参数
SHARPNESS_FACTOR = 2.0   # 1.0=原始，>1=增强锐度
CONTRAST_FACTOR = 1.15   # 1.0=原始，>1=增强对比度


# ===== 核心函数 =====

def generate_closeup_by_crop(
    scene_image_path: str,
    render_position: dict,
    object_description: str,
    output_path: str,
    manual_position: dict | None = None,
) -> str:
    """
    从场景全图裁出物证区域，生成物证特写图。

    参数：
    - scene_image_path: 场景全图的本地路径
    - render_position: SceneObject.render_position（含 area 和 zone）
    - object_description: 物证描述（用于日志）
    - output_path: 输出路径
    - manual_position: 可选，用户手动点击的位置 {"x": 0.0-1.0, "y": 0.0-1.0}

    返回：输出图片路径
    """
    if not os.path.exists(scene_image_path):
        raise FileNotFoundError(f"场景全图不存在: {scene_image_path}")

    img = Image.open(scene_image_path)
    img_w, img_h = img.size

    # 1. 计算裁剪中心点 — 优先用手动坐标，否则用预定义 render_position
    if manual_position and "x" in manual_position and "y" in manual_position:
        cx = int(manual_position["x"] * img_w)
        cy = int(manual_position["y"] * img_h)
    else:
        cx, cy = _render_position_to_pixel_center(render_position, img_w, img_h)

    # 2. 计算裁剪框（以中心点为基准，取 CROP_REGION_RATIO 比例的区域）
    crop_w = int(img_w * CROP_REGION_RATIO)
    crop_h = int(img_h * CROP_REGION_RATIO)

    left   = max(0, cx - crop_w // 2)
    top    = max(0, cy - crop_h // 2)
    right  = min(img_w, left + crop_w)
    bottom = min(img_h, top + crop_h)

    # 边界修正（防止裁剪框超出图片）
    if right > img_w:
        left = max(0, img_w - crop_w)
        right = img_w
    if bottom > img_h:
        top = max(0, img_h - crop_h)
        bottom = img_h

    logger.info(
        f"[closeup_crop] 裁剪物证: {object_description} | "
        f"中心: ({cx},{cy}) | 裁剪框: ({left},{top},{right},{bottom})"
    )

    # 3. 裁剪
    cropped = img.crop((left, top, right, bottom))

    # 4. 放大到目标尺寸（使用高质量重采样）
    resized = cropped.resize(CLOSEUP_OUTPUT_SIZE, Image.LANCZOS)

    # 5. 图像增强（锐化 + 对比度）
    enhanced = ImageEnhance.Sharpness(resized).enhance(SHARPNESS_FACTOR)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(CONTRAST_FACTOR)

    # 6. 添加特写标注框（在裁剪区域对应的位置画红色边框，表示这是局部放大）
    enhanced = _add_closeup_border(enhanced)

    # 7. 保存
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    enhanced.save(output_path, "PNG", quality=95)

    return output_path


def generate_closeup_reference_preview(
    scene_image_path: str,
    render_position: dict,
    object_description: str,
    output_path: str
) -> str:
    """
    生成「场景全图 + 红框标注」的参考预览图。
    在场景全图上画出物证裁剪区域的红色矩形框，
    帮助教师确认特写是从哪个区域裁剪的。

    这个图显示在前端特写旁边（小图），不作为最终输出。
    """
    if not os.path.exists(scene_image_path):
        raise FileNotFoundError(f"场景全图不存在: {scene_image_path}")

    img = Image.open(scene_image_path).copy()
    img_w, img_h = img.size

    cx, cy = _render_position_to_pixel_center(render_position, img_w, img_h)
    crop_w = int(img_w * CROP_REGION_RATIO)
    crop_h = int(img_h * CROP_REGION_RATIO)

    left   = max(0, cx - crop_w // 2)
    top    = max(0, cy - crop_h // 2)
    right  = min(img_w, left + crop_w)
    bottom = min(img_h, top + crop_h)

    # 在图上画红色矩形框标注裁剪区域
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    draw.rectangle([left, top, right, bottom], outline="red", width=4)

    # 在框上方标注物证名称
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 20)
    except Exception:
        font = ImageFont.load_default()

    draw.text((left + 4, max(0, top - 28)), object_description, fill="red", font=font)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG")

    return output_path


def build_prompt_lock_closeup_prompt(
    obj_description: str,
    obj_type: str,
    obj_state: dict,
    scene_name: str,
    room_type: str,
    location_key: str = "on_floor",
    case_style: str | None = None,
    custom_details: str | None = None,
) -> str:
    """
    Prompt 锁定法：生成物证特写的 AI prompt。

    关键设计目标：
    1. 使用与场景全图完全相同的房间描述（_ROOM_TYPE_EN），确保背景一致
    2. 使用 scene_engine 的 _translate_state() 处理所有状态（不丢失指纹等细节）
    3. 使用真实位置描述（_area_to_natural_language）而非强制 floor
    4. 注入 case 级别的风格描述（如果可用），确保跨场景统一
    5. 注入用户自定义的细节描述（custom_details），补充物证特征细节

    Args:
        obj_description: 物证描述（如"带血水果刀"）
        obj_type: 物证类型（如"物证"）
        obj_state: 物证状态字典（如 {"血迹": true, "指纹": true}）
        scene_name: 场景名称
        room_type: 房间类型（对应 _ROOM_TYPE_EN）
        location_key: 位置键（如"under_bed_left"）
        case_style: 案件风格描述（可选）
        custom_details: 用户自定义的细节描述（可选，如"刀刃上有明显的血迹，血液已经氧化变黑"）

    返回英文 prompt。
    """
    from app.services.scene_engine import (
        _ROOM_TYPE_EN,
        _translate_state,
        _area_to_natural_language,
        get_render_position,
        _OBJ_TYPE_EN,
    )

    # 1. 构建房间背景描述（与场景全图使用相同的 _ROOM_TYPE_EN）
    room_full_desc = _ROOM_TYPE_EN.get(room_type, "a crime scene room")

    # 2. 注入 case 级别风格（如果可用）
    case_style_injection = ""
    if case_style:
        case_style_injection = (
            f" This is part of the following location: {case_style}."
            f" The background must reflect this specific environment."
        )

    # 3. 使用 _translate_state() 处理所有状态（包括指纹、血迹等中文关键词）
    full_state_desc = _translate_state(obj_state)

    # 4. 推导真实位置描述（非强制 on floor）
    render_position = get_render_position(location_key)
    position_desc = _area_to_natural_language(
        render_position.get("area", "center"),
        render_position.get("zone", "floor_area"),
    )

    # 5. 英文类型
    type_en = _OBJ_TYPE_EN.get(obj_type, "evidence item")

    # 6. 用户自定义细节描述（翻译为英文）
    custom_details_en = ""
    if custom_details and custom_details.strip():
        custom_details_en = f" Additional visible details: {custom_details.strip()}."

    # 7. 组装 prompt
    evidence_identity = (
        f"A {obj_description}" if obj_description else f"a {type_en}"
    )

    prompt = (
        f"Forensic evidence closeup photograph. "
        f"This is a {type_en}: {evidence_identity}. "
        f"Location: {position_desc}, in {room_full_desc}.{case_style_injection}"
    )

    if full_state_desc:
        prompt += f" Condition: {full_state_desc}."

    prompt += custom_details_en

    prompt += (
        f" The item is being photographed in-situ exactly where it was found, "
        f"with the {scene_name} crime scene environment visible around and behind it. "
        f"Evidence scale ruler beside the item, evidence label tag visible. "
        f"Professional forensic photography, realistic, 4k resolution, sharp focus, "
        f"overhead or close-up angle, no people, no text overlay."
    )

    return prompt


# ===== 内部辅助函数 =====

def _render_position_to_pixel_center(
    render_position: dict,
    img_w: int,
    img_h: int
) -> tuple[int, int]:
    """
    将 render_position 的 area 字段转为图片像素坐标（中心点）。
    将图片分为 3x3 网格，每个 area 对应一个格子中心。
    """
    AREA_GRID = {
        # 上排
        "upper_left":   (1/6, 1/6),
        "upper_center": (1/2, 1/6),
        "top_center":   (1/2, 1/8),
        "upper_right":  (5/6, 1/6),
        # 中排
        "left_center":  (1/6, 1/2),
        "center_left":  (1/3, 1/2),
        "center":       (1/2, 1/2),
        "center_right": (2/3, 1/2),
        "right_center": (5/6, 1/2),
        # 下排
        "lower_left":   (1/6, 5/6),
        "lower_center": (1/2, 5/6),
        "lower_right":  (5/6, 5/6),
        # 角落
        "far_left":     (1/12, 1/2),
        "far_right":    (11/12, 1/2),
    }

    area = render_position.get("area", "center")
    ratio_x, ratio_y = AREA_GRID.get(area, (0.5, 0.5))

    return int(img_w * ratio_x), int(img_h * ratio_y)


def _add_closeup_border(img: Image.Image) -> Image.Image:
    """
    在特写图四周添加细红色边框，
    视觉上表示这是从场景图局部放大的区域。
    """
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    w, h = img.size
    draw.rectangle([0, 0, w-1, h-1], outline="#CC0000", width=3)
    return img


# ===== background_inpaint 策略 =====

# 背景裁剪比例（比纯裁剪法更大，确保背景足够）
INPAINT_CROP_RATIO = 0.70  # 取图片 70% 宽高作为背景

# mask 椭圆尺寸（在 1024x1024 图中）
INPAINT_MASK_SIZE = 256  # mask 椭圆半轴长度


def generate_closeup_background_and_mask(
    scene_image_path: str,
    render_position: dict,
    object_description: str,
    output_dir: str,
) -> tuple[str, str]:
    """
    从场景全图裁剪背景区域，并生成 inpainting mask。

    返回：
    - base_path: 裁剪+放大后的背景图路径（1024×1024 RGBA PNG）
    - mask_path: 对应的 mask 图路径（白色=保留区域，透明=要重绘的区域）
    """
    if not os.path.exists(scene_image_path):
        raise FileNotFoundError(f"场景全图不存在: {scene_image_path}")

    img = Image.open(scene_image_path).convert("RGB")
    img_w, img_h = img.size

    # 1. 计算裁剪中心点（与 render_position 对应）
    cx, cy = _render_position_to_pixel_center(render_position, img_w, img_h)

    # 2. 计算裁剪框（取 INPAINT_CROP_RATIO 比例，比纯裁剪法更大）
    crop_w = int(img_w * INPAINT_CROP_RATIO)
    crop_h = int(img_h * INPAINT_CROP_RATIO)

    left = max(0, cx - crop_w // 2)
    top = max(0, cy - crop_h // 2)
    right = min(img_w, left + crop_w)
    bottom = min(img_h, top + crop_h)

    if right > img_w:
        left = max(0, img_w - crop_w)
        right = img_w
    if bottom > img_h:
        top = max(0, img_h - crop_h)
        bottom = img_h

    logger.info(
        f"[closeup_inpaint] 裁剪背景: {object_description} | "
        f"中心: ({cx},{cy}) | 裁剪框: ({left},{top},{right},{bottom})"
    )

    # 3. 裁剪背景
    cropped = img.crop((left, top, right, bottom))

    # 4. 放大到 1024×1024（inpaint API 要求正方形）
    base_img = cropped.resize(CLOSEUP_OUTPUT_SIZE, Image.LANCZOS)

    # 5. 保存背景图
    os.makedirs(output_dir, exist_ok=True)
    import time as _time
    base_path = os.path.join(output_dir, f"inpaint_base_{int(_time.time())}.png")
    base_img.save(base_path, "PNG")

    # 6. 生成 mask：中央椭圆透明区域 = 要绘制物证的位置
    mask_img = Image.new("RGBA", CLOSEUP_OUTPUT_SIZE, color=(0, 0, 0, 255))
    from PIL import ImageDraw as _ImageDraw
    draw = _ImageDraw.Draw(mask_img)
    cx_m, cy_m = CLOSEUP_OUTPUT_SIZE[0] // 2, CLOSEUP_OUTPUT_SIZE[1] // 2
    draw.ellipse(
        [
            cx_m - INPAINT_MASK_SIZE,
            cy_m - INPAINT_MASK_SIZE,
            cx_m + INPAINT_MASK_SIZE,
            cy_m + INPAINT_MASK_SIZE,
        ],
        fill=(0, 0, 0, 0),  # 透明 = 要 inpainting
    )

    mask_path = os.path.join(output_dir, f"inpaint_mask_{int(_time.time())}.png")
    mask_img.save(mask_path, "PNG")

    logger.info(
        f"[closeup_inpaint] 背景图: {base_path} | mask: {mask_path}"
        f" | 椭圆中心: ({cx_m},{cy_m}) | 半轴: {INPAINT_MASK_SIZE}"
    )

    return base_path, mask_path


def build_inpaint_item_prompt(
    obj_description: str,
    obj_type: str,
    obj_state: dict,
    custom_details: str | None = None,
) -> str:
    """
    构建 inpainting 专用 prompt — 只描述物证本身，不涉及背景环境。
    因为背景来自场景全图裁剪，DALL·E 只需要在 mask 区域绘制物证。

    Args:
        obj_description: 物证描述
        obj_type: 物证类型
        obj_state: 物证状态字典
        custom_details: 用户自定义的细节描述（可选）

    返回英文 prompt。
    """
    from app.services.scene_engine import _translate_state, _OBJ_TYPE_EN

    type_en = _OBJ_TYPE_EN.get(obj_type, "evidence item")
    full_state_desc = _translate_state(obj_state)

    evidence_desc = f"A {obj_description}" if obj_description else f"a {type_en}"

    # 用户自定义细节
    custom_details_en = ""
    if custom_details and custom_details.strip():
        custom_details_en = f" Additional visible details: {custom_details.strip()}."

    prompt = (
        f"Forensic evidence closeup photograph of {evidence_desc}. "
        f"This is a {type_en}."
    )

    if full_state_desc:
        prompt += f" Condition: {full_state_desc}."

    prompt += custom_details_en

    prompt += (
        f" Evidence scale ruler beside the item, evidence label tag visible. "
        f"Professional forensic photography, realistic, 4k resolution, sharp focus, "
        f"overhead angle, no people, no text overlay. "
        f"The item should be placed on the visible floor/surface exactly as it appears, "
        f"matching the lighting and shadows of the surrounding scene."
    )

    return prompt
