from PIL import Image, ImageDraw

S = 4  # 超采样倍数，先大图再缩小得到抗锯齿效果


def make_icon(size, bg="#0E639C", fg="#FFFFFF"):
    px = size * S
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(px * 0.22)
    d.rounded_rectangle([0, 0, px - 1, px - 1], radius=radius, fill=bg)

    # 发送箭头：横杠 + 三角形箭头
    bar = [px * 0.20, px * 0.415, px * 0.60, px * 0.585]
    d.rounded_rectangle(bar, radius=int(px * 0.045), fill=fg)
    d.polygon(
        [
            (px * 0.56, px * 0.245),
            (px * 0.90, px * 0.50),
            (px * 0.56, px * 0.755),
        ],
        fill=fg,
    )

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import os
    import sys

    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)
    for s in (16, 32, 48, 128):
        make_icon(s).save(os.path.join(out_dir, f"icon{s}.png"))
    print("icons written to", out_dir)
