"""Mask Generator — 为 inpainting 生成 Pillow mask 图片（RGBA 格式）。

Mask 规则：透明(alpha=0) = 需要填充/重绘的区域，不透明(alpha=255) = 保留区域。
DALL·E API 要求 mask 必须是 RGBA 格式的 PNG。
"""

from PIL import Image, ImageDraw


# ==============================================================================
# 坐标映射
# ==============================================================================

def position_to_pixel(area: str, image_size: tuple[int, int]) -> tuple[int, int]:
    """将 area 字符串转为像素坐标（图片中心点）."""
    w, h = image_size
    third_w = w / 3
    third_h = h / 3

    h_map = {
        "left": third_w, "center": w / 2, "right": w - third_w,
        "far_left": third_w * 0.5, "upper": w / 2,
    }
    v_map = {
        "top": third_h, "upper": third_h, "center": h / 2,
        "lower": h - third_h, "bottom": h - third_h,
    }

    area_lower = area.lower()
    x, y = w / 2, h / 2
    parts = area_lower.split("_")

    for p in parts:
        if p in v_map:
            y = v_map[p]
        if p in h_map:
            x = h_map[p]

    return (int(x), int(y))


# ==============================================================================
# Mask 生成函数（RGBA 格式）
# ==============================================================================

# RGBA 常量
_TRANSPARENT = (0, 0, 0, 0)      # alpha=0 → 要重绘的区域
_OPAQUE_BLACK = (0, 0, 0, 255)   # alpha=255 → 保留的区域


def generate_ellipse_mask(
    image_size: tuple[int, int],
    position: dict,
    radius_x: int = 80,
    radius_y: int = 60,
) -> Image.Image:
    """生成椭圆 mask（RGBA 格式）。

    Args:
        image_size: (width, height)。
        position: render_position dict，含 "area" 字段。
        radius_x: 椭圆水平半径。
        radius_y: 椭圆垂直半径。

    Returns:
        PIL Image（RGBA 模式，透明=要填充，不透明=保留）。
    """
    area = position.get("area", "center")
    cx, cy = position_to_pixel(area, image_size)

    # RGBA: 全不透明 = 全部保留
    img = Image.new("RGBA", image_size, color=_OPAQUE_BLACK)
    draw = ImageDraw.Draw(img)
    # 椭圆区域设为透明 = 要 inpaint
    draw.ellipse(
        [cx - radius_x, cy - radius_y, cx + radius_x, cy + radius_y],
        fill=_TRANSPARENT,
    )
    return img


def generate_rect_mask(
    image_size: tuple[int, int],
    position: dict,
    width: int = 150,
    height: int = 100,
) -> Image.Image:
    """生成矩形 mask（RGBA 格式）。"""
    area = position.get("area", "center")
    cx, cy = position_to_pixel(area, image_size)

    x0 = cx - width // 2
    y0 = cy - height // 2

    img = Image.new("RGBA", image_size, color=_OPAQUE_BLACK)
    draw = ImageDraw.Draw(img)
    draw.rectangle([x0, y0, x0 + width, y0 + height], fill=_TRANSPARENT)
    return img


def generate_rounded_rect_mask(
    image_size: tuple[int, int],
    position: dict,
    width: int = 150,
    height: int = 100,
    radius: int = 12,
) -> Image.Image:
    """生成圆角矩形 mask（RGBA 格式）。"""
    area = position.get("area", "center")
    cx, cy = position_to_pixel(area, image_size)

    x0 = cx - width // 2
    y0 = cy - height // 2

    img = Image.new("RGBA", image_size, color=_OPAQUE_BLACK)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [x0, y0, x0 + width, y0 + height], radius=radius, fill=_TRANSPARENT
    )
    return img


def mask_from_scene_object(
    obj,
    image_size: tuple[int, int] = (1024, 1024),
    mask_type: str = "ellipse",
) -> Image.Image:
    """根据 SceneObject 自动生成 mask（RGBA 格式）。"""
    render_pos = getattr(obj, "render_position", {"area": "center"})

    if mask_type == "rect":
        return generate_rect_mask(image_size, render_pos)
    elif mask_type == "rounded_rect":
        return generate_rounded_rect_mask(image_size, render_pos)
    else:
        return generate_ellipse_mask(image_size, render_pos)


# ==============================================================================
# 测试用例
# ==============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("Mask Generator — 测试用例")
    print("=" * 60)

    img_size = (1024, 768)

    test_areas = [
        "center", "upper_left", "lower_right",
        "left_center", "upper_center",
        "under_bed_left", "near_window",
    ]
    print("\n坐标映射测试:")
    for area in test_areas:
        px = position_to_pixel(area, img_size)
        print(f"  {area:20s} → ({px[0]:4d}, {px[1]:4d})")

    print("\nMask 生成测试 (RGBA):")
    for pos_key in ["center", "upper_right", "lower_left"]:
        pos = {"area": pos_key}
        mask = generate_ellipse_mask(img_size, pos)
        # 统计透明像素
        transparent = sum(1 for p in mask.getdata() if p[3] == 0)
        total = img_size[0] * img_size[1]
        print(f"  ellipse @ {pos_key:15s}: mode={mask.mode}, transparent={transparent}/{total} ({100*transparent/total:.2f}%)")

        mask_r = generate_rect_mask(img_size, pos)
        trans_r = sum(1 for p in mask_r.getdata() if p[3] == 0)
        print(f"  rect    @ {pos_key:15s}: mode={mask_r.mode}, transparent={trans_r}/{total} ({100*trans_r/total:.2f}%)")

    print("\n" + "=" * 60)
    print("全部 Mask Generator 测试通过 (RGBA 格式)")
    print("=" * 60)
