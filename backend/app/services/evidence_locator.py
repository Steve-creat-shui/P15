"""
多模态 AI 辅助物证定位器。

在场景图中定位每件物证的真实像素坐标，
用于精确裁剪特写图（背景 100% 与场景图一致）。

策略：
1. 调用 GPT-4o（vision）分析场景图，返回物证坐标
2. 如果 AI 定位失败/不可用，返回 None（由调用方处理 fallback）
"""

import os
import json
import base64
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


async def locate_evidence_in_scene_image(
    scene_image_path: str,
    evidence_descriptions: list[str],
) -> dict[str, tuple[float, float]] | None:
    """
    调用多模态 AI 在场景图中定位物证。

    参数：
    - scene_image_path: 场景全图路径
    - evidence_descriptions: 物证描述列表，如 ["带血水果刀", "破碎手机"]

    返回：
    - 成功：{"带血水果刀": (0.23, 0.75), "破碎手机": (0.61, 0.42)}
      坐标为 0.0-1.0 的比例值（x=左到右，y=上到下）
    - 失败：None
    """
    if not os.path.exists(scene_image_path):
        logger.warning(f"[evidence_locator] 场景图不存在: {scene_image_path}")
        return None

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("[evidence_locator] 未配置 OPENAI_API_KEY，跳过 AI 定位")
        return None

    try:
        # 读取图片并转为 base64
        with open(scene_image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()

        # 构建 vision prompt
        items_list = "\n".join([f"- {desc}" for desc in evidence_descriptions])

        system_prompt = (
            "You are a forensic image analysis assistant. "
            "Your task is to locate specific evidence items in crime scene photos. "
            "Return ONLY a valid JSON object with no additional text. "
            "Coordinates must be relative values between 0.0 and 1.0, "
            "where (0,0) is the top-left corner and (1,1) is the bottom-right corner."
        )

        user_prompt = (
            f"In this crime scene photo, locate each of the following evidence items "
            f"and return their center coordinates as relative values (0.0 to 1.0):\n"
            f"{items_list}\n\n"
            f"Return ONLY this JSON format, no explanation:\n"
            f'{{"item_name": [x, y], "item_name2": [x2, y2]}}\n\n'
            f"If an item is not visible in the image, use null for its value.\n"
            f'Example: {{"水果刀": [0.23, 0.75], "手机": null}}'
        )

        import httpx

        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",  # 用 mini 节省成本，vision 够用
                    "max_tokens": 500,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{image_b64}",
                                        "detail": "low"  # low detail 足够定位用，省 token
                                    }
                                },
                                {"type": "text", "text": user_prompt}
                            ]
                        }
                    ],
                }
            )

        if response.status_code != 200:
            logger.error(f"[evidence_locator] API 返回错误: {response.status_code} {response.text[:200]}")
            return None

        result = response.json()
        raw_text = result["choices"][0]["message"]["content"].strip()

        # 解析 JSON（处理可能的 markdown 代码块包裹）
        if "```" in raw_text:
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]

        coordinates = json.loads(raw_text)

        # 标准化：确保坐标是 tuple[float, float]，过滤 null 值
        result_coords = {}
        for desc in evidence_descriptions:
            # 尝试精确匹配，再尝试模糊匹配
            coord = coordinates.get(desc)
            if coord is None:
                # 模糊匹配：找描述中包含关键词的
                for key, val in coordinates.items():
                    if key in desc or desc[:4] in key:
                        coord = val
                        break

            if coord and isinstance(coord, list) and len(coord) == 2:
                x, y = float(coord[0]), float(coord[1])
                # 验证坐标在合法范围内
                if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0:
                    result_coords[desc] = (x, y)
                    logger.info(f"[evidence_locator] 定位成功: {desc} → ({x:.2f}, {y:.2f})")
                else:
                    logger.warning(f"[evidence_locator] 坐标超出范围: {desc} → {coord}")
            else:
                logger.info(f"[evidence_locator] 未定位到: {desc}")

        return result_coords if result_coords else None

    except json.JSONDecodeError as e:
        logger.error(f"[evidence_locator] JSON 解析失败: {e} | 原始响应: {raw_text[:200] if 'raw_text' in dir() else 'N/A'}")
        return None
    except Exception as e:
        logger.error(f"[evidence_locator] 定位失败: {e}")
        return None


def crop_by_coordinates(
    scene_image_path: str,
    center_x: float,
    center_y: float,
    output_path: str,
    crop_ratio: float = 0.35,
) -> str:
    """
    根据比例坐标从场景图精确裁剪物证区域。

    参数：
    - center_x, center_y: AI 返回的比例坐标（0.0-1.0）
    - crop_ratio: 裁剪区域占图片的比例（默认 0.35，比原来的 0.45 更精准）

    返回：裁剪后的图片路径
    """
    from PIL import Image, ImageEnhance, ImageFilter

    img = Image.open(scene_image_path)
    img_w, img_h = img.size

    # 将比例坐标转为像素坐标
    cx = int(img_w * center_x)
    cy = int(img_h * center_y)

    # 计算裁剪框
    crop_w = int(img_w * crop_ratio)
    crop_h = int(img_h * crop_ratio)

    left   = max(0, cx - crop_w // 2)
    top    = max(0, cy - crop_h // 2)
    right  = min(img_w, left + crop_w)
    bottom = min(img_h, top + crop_h)

    # 边界修正
    if right > img_w:
        left = max(0, img_w - crop_w)
        right = img_w
    if bottom > img_h:
        top = max(0, img_h - crop_h)
        bottom = img_h

    cropped = img.crop((left, top, right, bottom))
    resized = cropped.resize((1024, 1024), Image.LANCZOS)

    # 增强
    enhanced = ImageEnhance.Sharpness(resized).enhance(2.0)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(1.15)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    enhanced.save(output_path, "PNG", quality=95)

    logger.info(
        f"[evidence_locator] 精确裁剪完成: 中心({cx},{cy}) "
        f"裁剪框({left},{top},{right},{bottom}) → {output_path}"
    )

    return output_path


def make_preview_with_dot(
    scene_image_path: str,
    cx: float,
    cy: float,
    output_path: str,
):
    """在场景图上画红点标记定位位置，用于前端展示。"""
    from PIL import Image, ImageDraw

    img = Image.open(scene_image_path).copy()
    w, h = img.size
    px, py = int(w * cx), int(h * cy)
    draw = ImageDraw.Draw(img)
    r = 15
    draw.ellipse([px-r, py-r, px+r, py+r], fill="red", outline="white", width=3)
    # 画裁剪框预览
    cw = int(w * 0.35)
    ch = int(h * 0.35)
    draw.rectangle(
        [max(0, px - cw // 2), max(0, py - ch // 2),
         min(w, px + cw // 2), min(h, py + ch // 2)],
        outline="red", width=3
    )
    img.save(output_path, "PNG")
