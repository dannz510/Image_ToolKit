"""
=============================================================================
  Dannz AI Background & Image Studio  🎨
  Local Web App xử lý ảnh & bóc tách nền bằng AI — chạy hoàn toàn cục bộ.
  Stack: Streamlit + rembg (U²-Net / IS-Net) + ONNX Runtime + Pillow.
  Chạy:  streamlit run Dannz_AI_Background_Image_Studio.py
=============================================================================
"""

from __future__ import annotations

import base64
import io
import re
import time
import zipfile
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components
from PIL import Image, ImageDraw, ImageOps
from rembg import new_session, remove

APP_TITLE = "Dannz AI Background & Image Studio"
APP_ICON = "🎨"
SUPPORTED_TYPES = ["jpg", "jpeg", "png", "webp"]
MAX_PREVIEW_SIDE = 1400

AI_MODELS: dict[str, dict] = {
    "u2net": {
        "label": "U²-Net — Chuẩn",
        "desc": "🎯 Độ chính xác cao, giữ viền chi tiết tốt. Phù hợp đa số trường hợp: "
                "ảnh sản phẩm, chân dung, vật thể. Dung lượng mô hình ~176 MB.",
    },
    "isnet-general-use": {
        "label": "IS-Net — Chi tiết",
        "desc": "🧵 Mạng IS-Net chuyên dụng: tách tóc, lông thú, viền mềm mịn và chi tiết nhỏ "
                "vượt trội. Chậm hơn nhẹ so với U²-Net. Dung lượng ~179 MB.",
    },
    "u2netp": {
        "label": "U²-Net Lite",
        "desc": "⚡ Bản rút gọn chỉ ~4.7 MB: tải mô hình và xử lý cực nhanh, phù hợp máy cấu "
                "hình yếu hoặc ảnh đơn giản. Độ chi tiết thấp hơn hai model trên.",
    },
}

BG_COLORS: dict[str, dict] = {
    "transparent": {"label": "Trong suốt — Transparent PNG", "hex": None},
    "white": {"label": "Trắng tinh — #FFFFFF", "hex": "#FFFFFF"},
    "black": {"label": "Đen tuyền — #000000", "hex": "#000000"},
    "slate": {"label": "Xám kỹ thuật Slate — #708090", "hex": "#708090"},
}

OUTPUT_FORMATS = {
    "jpg": "JPG — dung lượng nhẹ, dùng cho web/sản phẩm",
    "png": "PNG — nén không mất dữ liệu, chất lượng cao nhất",
}

st.set_page_config(page_title=APP_TITLE, page_icon=APP_ICON, layout="wide")

PAGE_CSS = """
<style>
    .app-title { font-weight: 800; font-size: 2.1rem; line-height: 1.15; margin: 0; }
    .app-title .grad {
        background: linear-gradient(90deg, #38bdf8, #818cf8, #e879f9);
        -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .badge-row p { margin: 0 0 0.4rem 0; }
    .result-card {
        border: 1px solid rgba(120, 130, 150, 0.35);
        border-radius: 14px; padding: 12px 14px;
    }
</style>
"""


@st.cache_resource(show_spinner=False)
def load_ai_model(model_name: str):
    """Tải & cache mô hình ONNX — mỗi model chỉ load đúng 1 lần mỗi phiên."""
    return new_session(model_name)


def sanitize_filename(name: str) -> str:
    stem = Path(name).stem.strip() or "image"
    cleaned = re.sub(r"[^\w\s-]", "_", stem, flags=re.UNICODE)
    cleaned = re.sub(r"\s+", "_", cleaned).strip("_- ")
    return (cleaned or "image")[:80]


def normalize_input(data: bytes) -> bytes:
    """Chuẩn hoá ảnh đầu vào về RGB/RGBA, xoay đúng theo EXIF, xử lý CMYK/P-mode."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        img = img.convert("RGBA")
    elif img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def erase_region(rgba: Image.Image, frac: tuple[float, float, float, float]) -> Image.Image:
    """Làm trong suốt một vùng chữ nhật (toạ độ tính theo tỉ lệ 0–1 của ảnh)."""
    w, h = rgba.size
    fx, fy, fw, fh = frac
    x0, y0 = max(0, int(fx * w)), max(0, int(fy * h))
    x1, y1 = min(w, int((fx + fw) * w)), min(h, int((fy + fh) * h))
    img = rgba.copy()
    alpha = img.split()[3]
    ImageDraw.Draw(alpha).rectangle([x0, y0, x1, y1], fill=0)
    img.putalpha(alpha)
    return img


def composite_on_solid(rgba: Image.Image, hex_color: str) -> Image.Image:
    """Ghép ảnh RGBA lên nền màu đặc — giữ nguyên độ phân giải gốc."""
    solid = Image.new("RGB", rgba.size, hex_color)
    solid.paste(rgba, (0, 0), mask=rgba.split()[3])
    return solid


def build_checkerboard(rgba: Image.Image, base_tile: int = 28) -> Image.Image:
    """Vẽ nền ô kẻ để hiển thị trực quan vùng trong suốt khi preview."""
    w, h = rgba.size
    tile = base_tile if max(w, h) <= base_tile * 24 else max(8, max(w, h) // 24)
    pat = Image.new("RGB", (tile * 2, tile * 2), (235, 237, 242))
    ImageDraw.Draw(pat).rectangle([0, 0, tile - 1, tile - 1], fill=(198, 200, 205))
    ImageDraw.Draw(pat).rectangle([tile, tile, tile * 2 - 1, tile * 2 - 1], fill=(198, 200, 205))
    bg = pat.resize((w, h), Image.Resampling.NEAREST).convert("RGBA")
    bg.alpha_composite(rgba)
    return bg.convert("RGB")


def image_to_b64(img: Image.Image, max_side: int = MAX_PREVIEW_SIDE) -> str:
    """Downscale + mã hoá ảnh thành base64 JPEG để nhúng vào HTML so sánh."""
    if img.mode == "RGBA":
        flat = Image.new("RGB", img.size, (13, 20, 36))
        flat.paste(img, mask=img.split()[3])
        img = flat
    elif img.mode != "RGB":
        img = img.convert("RGB")
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def comparison_slider_html(before_b64: str, after_b64: str, height: int = 460) -> str:
    """Thanh trượt so sánh trước/sau tương tác (kéo để trượt)."""
    return f"""
<div id="cmp" style="position:relative;width:100%;height:{height}px;background:#0b1220;border:1px solid #2b3a52;border-radius:14px;overflow:hidden;cursor:ew-resize;touch-action:none;user-select:none;">
  <img src="data:image/jpeg;base64,{after_b64}" draggable="false"
       style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;">
  <div id="cmpBefore" style="position:absolute;top:0;left:0;height:100%;width:50%;overflow:hidden;">
    <img src="data:image/jpeg;base64,{before_b64}" draggable="false"
         style="position:absolute;top:0;left:0;width:200%;height:100%;object-fit:contain;">
  </div>
  <div id="cmpLine" style="position:absolute;top:0;bottom:0;left:50%;width:3px;margin-left:-1.5px;background:#38bdf8;box-shadow:0 0 14px rgba(56,189,248,.9);"></div>
  <div id="cmpKnob" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;background:#38bdf8;color:#082f49;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;box-shadow:0 6px 18px rgba(0,0,0,.55);">&#8646;</div>
  <div style="position:absolute;top:12px;left:14px;background:rgba(2,6,23,.72);color:#e2e8f0;padding:5px 12px;border-radius:9px;font:600 13px/1.2 sans-serif;">&#128249; &#7843;nh g&#7897;c</div>
  <div style="position:absolute;top:12px;right:14px;background:rgba(2,6,23,.72);color:#e2e8f0;padding:5px 12px;border-radius:9px;font:600 13px/1.2 sans-serif;">&#10024; K&#7871;t qu&#7843;</div>
  <div style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(2,6,23,.72);color:#94a3b8;padding:4px 12px;border-radius:9px;font:500 12px/1.2 sans-serif;">K&#233;o thanh tr&#432;&#7907;t &#273;&#7875; so s&#225;nh</div>
</div>
<script>
(function() {{
  var cmp = document.getElementById('cmp');
  var before = document.getElementById('cmpBefore');
  var line = document.getElementById('cmpLine');
  var knob = document.getElementById('cmpKnob');
  function set(pct) {{
    pct = Math.max(0, Math.min(100, pct));
    before.style.width = pct + '%';
    line.style.left = pct + '%';
    knob.style.left = pct + '%';
  }}
  var dragging = false;
  function move(ev) {{
    var rect = cmp.getBoundingClientRect();
    set(((ev.clientX - rect.left) / rect.width) * 100);
  }}
  cmp.addEventListener('pointerdown', function(ev) {{ dragging = true; move(ev); ev.preventDefault(); }});
  window.addEventListener('pointermove', function(ev) {{ if (dragging) move(ev); }});
  window.addEventListener('pointerup', function() {{ dragging = false; }});
}})();
</script>
"""


def build_zip(results: list[dict]) -> bytes:
    """Đóng gói toàn bộ kết quả batch thành file ZIP trong bộ nhớ."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for r in results:
            zf.writestr(r["out_name"], r["bytes"])
    return buf.getvalue()


def process_image(
    data: bytes,
    name: str,
    session,
    bg_key: str,
    out_fmt: str,
    region_frac: tuple[float, float, float, float] | None = None,
    progress_cb=None,
) -> dict:
    """Pipeline xử lý 1 ảnh: chuẩn hoá → AI bóc nền → (xoá vùng) → ghép nền → xuất file."""

    def _p(frac: float, text: str) -> None:
        if progress_cb:
            progress_cb(frac, text)

    t0 = time.time()
    _p(0.05, "Chuẩn hoá ảnh đầu vào...")
    normalized = normalize_input(data)

    _p(0.25, "Đang phân tích & bóc tách nền bằng AI...")
    rgba_bytes = remove(normalized, session=session)
    rgba = Image.open(io.BytesIO(rgba_bytes)).convert("RGBA")

    if region_frac is not None:
        _p(0.55, "Đang xoá vùng thủ công đã chọn...")
        rgba = erase_region(rgba, region_frac)

    _p(0.75, "Đang chuẩn hoá file đầu ra...")
    png_buf = io.BytesIO()
    rgba.save(png_buf, format="PNG", optimize=True)
    png_bytes = png_buf.getvalue()

    bg = BG_COLORS[bg_key]
    if bg_key == "transparent":
        main_bytes, main_ext, main_mime = png_bytes, "png", "image/png"
        preview = build_checkerboard(rgba)
    else:
        solid = composite_on_solid(rgba, bg["hex"])
        if out_fmt == "jpg":
            jpg_buf = io.BytesIO()
            solid.save(jpg_buf, format="JPEG", quality=95, optimize=True, progressive=True)
            main_bytes, main_ext, main_mime = jpg_buf.getvalue(), "jpg", "image/jpeg"
            preview = solid
        else:
            png_out = io.BytesIO()
            solid.save(png_out, format="PNG", optimize=True)
            main_bytes, main_ext, main_mime = png_out.getvalue(), "png", "image/png"
            preview = solid

    stem = sanitize_filename(name)
    out_name = f"{stem}_no_bg.png" if bg_key == "transparent" else f"{stem}_bg_{bg_key}.{main_ext}"

    return {
        "orig_name": name,
        "out_name": out_name,
        "bytes": main_bytes,
        "mime": main_mime,
        "png_bytes": png_bytes,
        "png_name": f"{stem}_transparent.png",
        "preview": preview,
        "size": rgba.size,
        "elapsed": time.time() - t0,
        "kb": len(main_bytes) / 1024,
    }


def run_diagnostics() -> list[tuple[str, bool, str]]:
    """Kiểm tra nhanh các thành phần hệ thống — giúp phát hiện lỗi môi trường."""
    checks = []
    try:
        import rembg
        checks.append(("rembg", True, f"v{rembg.__version__}"))
    except Exception as e:
        checks.append(("rembg", False, str(e)))
    try:
        import onnxruntime as ort
        checks.append(("onnxruntime", True, f"v{ort.__version__}"))
    except Exception as e:
        checks.append(("onnxruntime", False, str(e)))
    model_dir = Path.home() / ".rembg" / "models"
    if model_dir.exists():
        models = sorted(p.parent.name for p in model_dir.glob("**/*.onnx"))
        checks.append(("Mô hình đã tải", bool(models), ", ".join(models) if models else "chưa có"))
    else:
        checks.append(("Mô hình đã tải", False, "chưa tải — sẽ tự tải khi xử lý lần đầu"))
    return checks


def quick_test() -> tuple[str, tuple[int, int], float]:
    """Chạy thử pipeline trên ảnh mẫu 240x160 để xác nhận end-to-end hoạt động."""
    img = Image.new("RGB", (240, 160), (30, 120, 200))
    ImageDraw.Draw(img).ellipse([40, 20, 200, 140], fill=(240, 200, 60))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    session = load_ai_model("u2net")
    t0 = time.time()
    out = remove(buf.getvalue(), session=session)
    res = Image.open(io.BytesIO(out))
    return res.mode, res.size, time.time() - t0


def main() -> None:
    st.markdown(PAGE_CSS, unsafe_allow_html=True)

    st.markdown(
        f'<h1 class="app-title">{APP_ICON} Dannz AI <span class="grad">Background &amp; Image Studio</span></h1>',
        unsafe_allow_html=True,
    )
    st.caption(
        "🖥️ Ứng dụng web cục bộ — bóc tách nền bằng AI (U²-Net / IS-Net) • Xử lý hàng loạt • "
        "Ghép nền tùy chỉnh • 100% chạy trên máy bạn, ảnh không rời khỏi thiết bị."
    )

    def _clear_results() -> None:
        st.session_state.pop("single_result", None)
        st.session_state.pop("batch_results", None)

    # ------------------------------------------------------------------ SIDEBAR
    with st.sidebar:
        st.markdown("### ⚙️ AI Core & Xuất ảnh")

        model_key = st.radio(
            "🧠 Mô hình AI Core",
            list(AI_MODELS.keys()),
            format_func=lambda k: AI_MODELS[k]["label"],
            on_change=_clear_results,
            help="Chọn mạng neural dùng để phân tích chủ thể.",
        )
        st.info(AI_MODELS[model_key]["desc"], icon="🤖")

        model_dir = Path.home() / ".rembg" / "models"
        model_file = model_dir / model_key / f"{model_key}.onnx"
        if model_file.exists():
            st.caption(f"✅ Mô hình đã có sẵn trên máy (~{model_file.stat().st_size / 1e6:.0f} MB)")
        else:
            st.caption("⬇️ Mô hình chưa có — sẽ tự tải khi xử lý lần đầu (cần kết nối mạng)")

        st.divider()
        bg_key = st.radio(
            "🖼️ Màu nền đầu ra",
            list(BG_COLORS.keys()),
            format_func=lambda k: BG_COLORS[k]["label"],
            on_change=_clear_results,
            help="Trong suốt = giữ kênh alpha (PNG). Các màu còn lại = ghép nền đặc.",
        )

        out_fmt = "png"
        if bg_key != "transparent":
            out_fmt = st.radio(
                "📦 Định dạng xuất file",
                list(OUTPUT_FORMATS.keys()),
                format_func=lambda k: OUTPUT_FORMATS[k],
                on_change=_clear_results,
            )

        st.divider()
        with st.expander("🖌️ Xoá vùng thủ công (tuỳ chọn)", expanded=False):
            enable_region = st.checkbox(
                "Bật chọn vùng xoá",
                value=False,
                on_change=_clear_results,
                help="Vùng chữ nhật được chọn sẽ được làm trong suốt — hữu ích để xoá "
                     "vệt nền còn sót lại, watermark hoặc chi tiết không mong muốn.",
            )
            region_frac: tuple[float, float, float, float] | None = None
            if enable_region:
                st.caption("Vùng sẽ bị xoá (tính theo % kích thước ảnh):")
                rx = st.slider("Vị trí X (%)", 0, 100, 25, on_change=_clear_results)
                ry = st.slider("Vị trí Y (%)", 0, 100, 25, on_change=_clear_results)
                rw = st.slider("Chiều rộng (%)", 1, 100, 50, on_change=_clear_results)
                rh = st.slider("Chiều cao (%)", 1, 100, 50, on_change=_clear_results)
                region_frac = (rx / 100, ry / 100, rw / 100, rh / 100)

        st.divider()
        with st.expander("💡 Mẹo sử dụng", expanded=False):
            st.markdown(
                "- Ảnh nền đơn giản → **U²-Net Lite** là đủ nhanh.\n"
                "- Ảnh tóc, lông thú, viền phức tạp → **IS-Net**.\n"
                "- Cần dùng cho thiết kế/web → chọn **Trong suốt (PNG)**.\n"
                "- Cần đăng sản phẩm → nền **Trắng** + định dạng **JPG**.\n"
                "- Ảnh WebP động: chỉ khung hình đầu tiên được xử lý."
            )

        st.divider()
        with st.expander("🩺 Kiểm tra hệ thống", expanded=False):
            for name, ok, detail in run_diagnostics():
                st.markdown(f"{'✅' if ok else '⚠️'} **{name}** — {detail}")
            if st.button("⚡ Test nhanh pipeline (ảnh mẫu)", use_container_width=True):
                try:
                    mode, size, secs = quick_test()
                    st.success(f"Pipeline hoạt động! Ảnh mẫu {size[0]}×{size[1]} → {mode} trong {secs:.2f}s")
                except Exception as e:
                    st.error(f"Pipeline lỗi: {e}")

    # ------------------------------------------------------------------ MAIN
    tab_single, tab_batch = st.tabs(["📷 Xử lý đơn ảnh", "📦 Xử lý hàng loạt"])

    # ------------------------------------------------------------- TAB SINGLE
    with tab_single:
        uploaded = st.file_uploader(
            "📤 Tải ảnh lên — kéo thả hoặc bấm để chọn",
            type=SUPPORTED_TYPES,
            key="single_upload",
            help="Hỗ trợ JPG, PNG, WebP. Ảnh được xử lý giữ nguyên độ phân giải gốc.",
        )

        if uploaded is not None:
            data = uploaded.getvalue()
            orig = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
            w, h = orig.size
            kb = len(data) / 1024

            if (uploaded.name, len(data)) != st.session_state.get("last_upload"):
                st.session_state["last_upload"] = (uploaded.name, len(data))
                st.session_state.pop("single_result", None)

            if w * h > 12_000_000:
                st.warning(
                    f"⚠️ Ảnh có độ phân giải lớn ({w}×{h}). Thời gian xử lý có thể lâu hơn "
                    "(độ phân giải vẫn được giữ nguyên theo yêu cầu)."
                )

            show_img = orig if orig.mode == "RGB" else orig.convert("RGB")
            if region_frac is not None:
                overlay = show_img.copy()
                d = ImageDraw.Draw(overlay)
                x0, y0 = int(region_frac[0] * w), int(region_frac[1] * h)
                x1, y1 = int((region_frac[0] + region_frac[2]) * w), int((region_frac[1] + region_frac[3]) * h)
                d.rectangle([x0, y0, x1, y1], outline=(239, 68, 68), width=max(3, max(w, h) // 150))
                show_img = overlay

            col_orig, col_res = st.columns(2)
            with col_orig:
                st.markdown("**📷 Ảnh gốc**")
                st.image(show_img, width="stretch", caption=f"{uploaded.name} • {w}×{h} • {kb:.0f} KB")

            with col_res:
                st.markdown("**✨ Kết quả sau xử lý**")
                result = st.session_state.get("single_result")
                if result is not None:
                    st.markdown('<div class="result-card">', unsafe_allow_html=True)
                    st.image(
                        result["preview"],
                        width="stretch",
                        caption=f"{result['out_name']} • {result['size'][0]}×{result['size'][1]} • {result['kb']:.0f} KB",
                    )
                    st.markdown("</div>", unsafe_allow_html=True)
                else:
                    st.info("👈 Nhấn nút **Bóc tách nền** bên dưới để xử lý ảnh.", icon="✨")

            st.divider()
            if st.button("✨ Bóc tách nền ngay", type="primary", width="stretch", key="btn_single"):
                with st.status("🔄 Đang xử lý ảnh...", expanded=True) as status:
                    def _cb(frac: float, text: str) -> None:
                        st.progress(frac, text=text)

                    try:
                        session = load_ai_model(model_key)
                        result = process_image(
                            data, uploaded.name, session, bg_key, out_fmt, region_frac, progress_cb=_cb
                        )
                        st.progress(1.0, text="✅ Hoàn tất!")
                        st.session_state["single_result"] = result
                        status.update(label=f"✅ Hoàn tất trong {result['elapsed']:.2f}s", state="complete", expanded=False)
                        st.toast(f"✅ Đã bóc tách nền trong {result['elapsed']:.2f}s")
                    except Exception as e:
                        status.update(label="❌ Xử lý thất bại", state="error", expanded=True)
                        st.error(
                            f"Lỗi khi xử lý: {e}\n\n"
                            "💡 Nếu là lần đầu chạy, hãy kiểm tra kết nối mạng — mô hình AI "
                            "(~176 MB) cần được tải về 1 lần từ GitHub."
                        )

            result = st.session_state.get("single_result")
            if result is not None:
                st.markdown("**🔀 So sánh trực tiếp** *(kéo thanh trượt sang trái/phải)*")
                before_b64 = image_to_b64(orig)
                after_b64 = image_to_b64(result["preview"])
                components.html(comparison_slider_html(before_b64, after_b64), height=470, scrolling=False)

                st.divider()
                dc1, dc2, dc3 = st.columns(3)
                with dc1:
                    st.download_button(
                        "📥 Tải kết quả chính",
                        data=result["bytes"],
                        file_name=result["out_name"],
                        mime=result["mime"],
                        key="dl_main",
                        width="stretch",
                    )
                with dc2:
                    st.download_button(
                        "📥 Bản trong suốt PNG",
                        data=result["png_bytes"],
                        file_name=result["png_name"],
                        mime="image/png",
                        key="dl_png",
                        width="stretch",
                    )
                with dc3:
                    st.markdown(
                        f"⏱ **{result['elapsed']:.2f}s**\n\n"
                        f"🧠 `{model_key}`\n\n"
                        f"🖼 {result['size'][0]}×{result['size'][1]} px"
                    )

    # -------------------------------------------------------------- TAB BATCH
    with tab_batch:
        uploaded_files = st.file_uploader(
            "📤 Tải nhiều ảnh cùng lúc (JPG, PNG, WebP)",
            type=SUPPORTED_TYPES,
            accept_multiple_files=True,
            key="batch_upload",
            help="Chọn nhiều file cùng lúc (Ctrl + Click). Hệ thống xử lý tuần tự từng ảnh.",
        )

        if uploaded_files:
            total_mb = sum(f.size for f in uploaded_files) / 1024 / 1024
            st.info(f"Đã chọn **{len(uploaded_files)}** ảnh — tổng {total_mb:.1f} MB")
            if len(uploaded_files) > 30:
                st.warning("⚠️ Số lượng ảnh lớn — xử lý tuần tự để tránh quá tải bộ nhớ.")
            if region_frac is not None:
                st.warning("🖌️ Chế độ **Xoá vùng thủ công** đang BẬT — vùng đã chọn sẽ được áp dụng cho mọi ảnh.")

            sig = tuple((f.name, f.size) for f in uploaded_files)
            if sig != st.session_state.get("last_batch_sig"):
                st.session_state["last_batch_sig"] = sig
                st.session_state.pop("batch_results", None)

            if st.button("🚀 Bóc tách toàn bộ danh sách", type="primary", width="stretch", key="btn_batch"):
                session = load_ai_model(model_key)
                results: list[dict] = []
                bar = st.progress(0, text="Đang bắt đầu...")
                for i, f in enumerate(uploaded_files):
                    bar.progress(i / len(uploaded_files), text=f"Đang xử lý {i + 1}/{len(uploaded_files)}: {f.name}")
                    try:
                        results.append(process_image(f.getvalue(), f.name, session, bg_key, out_fmt, region_frac))
                    except Exception as e:
                        st.error(f"❌ Lỗi khi xử lý `{f.name}`: {e}")
                bar.progress(1.0, text=f"✅ Hoàn tất — {len(results)}/{len(uploaded_files)} ảnh thành công")
                st.session_state["batch_results"] = results
                st.toast(f"✅ Đã xử lý {len(results)} ảnh")

        results = st.session_state.get("batch_results")
        if results:
            total_time = sum(r["elapsed"] for r in results)
            total_kb = sum(r["kb"] for r in results)

            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Ảnh thành công", f"{len(results)}")
            m2.metric("Tổng thời gian", f"{total_time:.1f}s")
            m3.metric("TB mỗi ảnh", f"{total_time / max(len(results), 1):.2f}s")
            m4.metric("Tổng dung lượng", f"{total_kb / 1024:.1f} MB")

            zip_bytes = build_zip(results)
            st.download_button(
                "📦 Tải toàn bộ kết quả (.zip)",
                data=zip_bytes,
                file_name=f"dannz_bg_removed_{len(results)}_images.zip",
                mime="application/zip",
                key="dl_zip",
                width="stretch",
            )

            st.divider()
            per_row = 3
            for start in range(0, len(results), per_row):
                row = results[start:start + per_row]
                cols = st.columns(per_row)
                for idx, (col, r) in enumerate(zip(cols, row)):
                    with col:
                        st.markdown('<div class="result-card">', unsafe_allow_html=True)
                        st.image(r["preview"], width="stretch", caption=f"**{r['out_name']}**")
                        st.caption(f"⏱ {r['elapsed']:.2f}s • {r['kb']:.0f} KB • {r['size'][0]}×{r['size'][1]} px")
                        st.download_button(
                            "📥 Tải xuống",
                            data=r["bytes"],
                            file_name=r["out_name"],
                            mime=r["mime"],
                            key=f"dl_batch_{start + idx}",
                            width="stretch",
                        )
                        st.markdown("</div>", unsafe_allow_html=True)

    st.divider()
    st.caption(
        f"🎨 {APP_TITLE} • Xử lý cục bộ 100% với ONNX Runtime — không gửi ảnh lên máy chủ nào. "
        "Mô hình AI được cache trong bộ nhớ sau lần tải đầu tiên."
    )


if __name__ == "__main__":
    main()
