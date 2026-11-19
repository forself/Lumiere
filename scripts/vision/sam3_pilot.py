"""Local, opt-in SAM3 segmentation pilot; not a reconstruction pipeline.

No package installation, model download, torch.compile, or application writes.
Runtime dependencies (not installed by this script): torch, transformers with
Sam3Model/Sam3Processor, safetensors and Pillow, plus their approved dependencies.

External model manifest, by default <model-dir>/pilot-manifest.json:
{"repo_id":"facebook/sam3", "revision":"<40 hexadecimal commit characters>",
 "source_url":"https://huggingface.co/facebook/sam3", "model_version":"SAM3"}
Optional manifest keys: license_name, license_url, acquisition_note.
This provenance declaration is recorded, not treated as a license grant.

Crop coordinates and source-space boxes use the EXIF-oriented display raster.
The report also includes an explicit transform back to the encoded raster.
Reference API: https://huggingface.co/docs/transformers/model_doc/sam3
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import sys
import time
from datetime import datetime, timezone
from types import SimpleNamespace

MAX_PIXELS = 40_000_000
MAX_PROMPTS = 20
MAX_INSTANCES = 100  # Total for the entire pilot, not per prompt.
OVERLAY_SIDE = 1600
MANIFEST_REQUIRED = {"repo_id", "revision", "source_url", "model_version"}
MANIFEST_OPTIONAL = {"license_name", "license_url", "acquisition_note"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"JSON 欄位重複：{key}")
        result[key] = value
    return result


def read_manifest(path: Path) -> dict:
    if not path.is_file() or path.stat().st_size > 65536:
        raise ValueError("需要外部模型來源 manifest，檔案須存在且不超過 64 KiB。")
    data = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=strict_object)
    if not isinstance(data, dict) or not MANIFEST_REQUIRED <= data.keys() or data.keys() - MANIFEST_REQUIRED - MANIFEST_OPTIONAL:
        raise ValueError("模型 manifest 須包含 repo_id、revision、source_url、model_version，且不得有未知欄位。")
    if any(not isinstance(v, str) or not v.strip() or len(v) > 2000 for v in data.values()):
        raise ValueError("模型 manifest 值須為非空文字。")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+", data["repo_id"]) or not re.fullmatch(r"[a-fA-F0-9]{40}", data["revision"]):
        raise ValueError("模型來源須為明確 repo_id 與完整 40 字元 commit revision，不接受 main。")
    if not data["source_url"].startswith("https://huggingface.co/"):
        raise ValueError("來源 URL 須記錄官方 Hugging Face 模型頁；本工具不連線讀取。")
    return {"declared": data, "manifest_path": str(path), "manifest_sha256": sha256_file(path),
            "verification": "external-declaration; not remote-authenticated or license-approval"}


def check_model_files(model_dir: Path) -> dict:
    if not model_dir.is_dir() or not (model_dir / "config.json").is_file():
        raise ValueError("--model-dir 必須是已有 config.json 的本機模型資料夾。")
    weights = sorted(model_dir.glob("*.safetensors"))
    if not weights:
        raise ValueError("本機資料夾沒有 safetensors 權重；不下載、不回退到 pickle/bin。")
    for path in weights:
        if not path.resolve().is_relative_to(model_dir):
            raise ValueError("權重符號連結不可指向指定模型資料夾外。")
    index = model_dir / "model.safetensors.index.json"
    if index.exists():
        if index.stat().st_size > 8 * 1024 * 1024:
            raise ValueError("safetensors index 大小異常。")
        mapping = json.loads(index.read_text(encoding="utf-8"), object_pairs_hook=strict_object).get("weight_map")
        if not isinstance(mapping, dict) or not mapping:
            raise ValueError("safetensors index 缺少有效 weight_map。")
        for name in set(mapping.values()):
            if not isinstance(name, str):
                raise ValueError("safetensors shard 名稱無效。")
            shard = (model_dir / name).resolve()
            if not shard.is_relative_to(model_dir) or shard.suffix != ".safetensors" or not shard.is_file():
                raise ValueError("safetensors shard 不存在或越出指定資料夾。")
    return {"config_sha256": sha256_file(model_dir / "config.json"),
            "weight_files": [{"name": p.name, "bytes": p.stat().st_size} for p in weights],
            "weight_integrity": "filenames-and-sizes-only; no claim of independently verified weight hashes"}


def validate_crop(width: int, height: int, crop) -> tuple[int, int, int, int]:
    if type(width) is not int or type(height) is not int or min(width, height) < 1 or width * height > MAX_PIXELS:
        raise ValueError("影像尺寸無效或超過 40 MP。")
    values = tuple(crop) if crop is not None else (0, 0, width, height)
    if len(values) != 4 or any(type(v) is not int for v in values):
        raise ValueError("crop 必須為四個整數 x y width height。")
    x, y, w, h = values
    if min(x, y) < 0 or min(w, h) < 1 or x + w > width or y + h > height:
        raise ValueError("裁切範圍必須完整位於 EXIF 校正後的原圖內。")
    return values


def orientation_matrix(orientation: int, width: int, height: int) -> list:
    """Display-oriented pixel-edge coordinates -> original encoded pixel edges."""
    matrices = {1: [[1, 0, 0], [0, 1, 0]], 2: [[-1, 0, width], [0, 1, 0]],
                3: [[-1, 0, width], [0, -1, height]], 4: [[1, 0, 0], [0, -1, height]],
                5: [[0, 1, 0], [1, 0, 0]], 6: [[0, 1, 0], [-1, 0, height]],
                7: [[0, -1, width], [-1, 0, height]], 8: [[0, -1, width], [1, 0, 0]]}
    if orientation not in matrices:
        raise ValueError("不支援的 EXIF orientation。")
    return [*matrices[orientation], [0, 0, 1]]


def map_box(box: list, matrix: list) -> list:
    if len(box) != 4 or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in box) or box[0] > box[2] or box[1] > box[3]:
        raise ValueError("模型 box 不是有效有限數值 xyxy。")
    corners = [(x, y) for x in (box[0], box[2]) for y in (box[1], box[3])]
    xs = [matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] for x, y in corners]
    ys = [matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] for x, y in corners]
    return [min(xs), min(ys), max(xs), max(ys)]


def write_json(path: Path, value: dict) -> None:
    # The directory is exclusively created by this invocation; atomic report updates.
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(path)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="SAM3 本機分割試驗；不建模、不下載、不安裝套件。")
    p.add_argument("--model-dir", required=True, type=Path)
    p.add_argument("--model-manifest", type=Path, help="預設 <model-dir>/pilot-manifest.json")
    p.add_argument("--image", required=True, type=Path)
    p.add_argument("--prompt", required=True, action="append", help="可重複，最多 20 個；每次只推論一個。")
    p.add_argument("--output-dir", required=True, type=Path, help="必須尚不存在；父資料夾須已存在。")
    p.add_argument("--crop", nargs=4, type=int, metavar=("X", "Y", "WIDTH", "HEIGHT"))
    p.add_argument("--device", default="cuda", help="cuda、cuda:N 或 cpu；不自動回退。")
    p.add_argument("--threshold", type=float, default=.5)
    p.add_argument("--max-instances", type=int, default=MAX_INSTANCES, help="全次試驗保存上限，最多 100。")
    return p


def validate_args(args) -> None:
    if not 1 <= len(args.prompt) <= MAX_PROMPTS or any(not p.strip() or len(p) > 500 for p in args.prompt):
        raise ValueError("須有 1–20 個非空提示，每個最多 500 字。")
    if not math.isfinite(args.threshold) or not 0 < args.threshold < 1:
        raise ValueError("threshold 必須介於 0 與 1 之間。")
    if not 1 <= args.max_instances <= MAX_INSTANCES:
        raise ValueError("整次試驗最多保存 100 個 instance。")
    if not re.fullmatch(r"cuda(?::[0-9]+)?|cpu", args.device):
        raise ValueError("device 僅支援 cuda、cuda:N 或 cpu。")


def memory_record(torch, device) -> dict:
    if device.type != "cuda":
        return {"peak_allocated_bytes": None, "peak_reserved_bytes": None}
    return {"peak_allocated_bytes": torch.cuda.max_memory_allocated(device),
            "peak_reserved_bytes": torch.cuda.max_memory_reserved(device)}


def run(args, report: dict, output: Path) -> None:
    # These are set before importing HF packages. No secrets/tokens are read or logged.
    for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE", "HF_HUB_DISABLE_TELEMETRY"):
        os.environ[name] = "1"
    model_dir = args.model_dir.resolve(strict=True)
    manifest = (args.model_manifest or model_dir / "pilot-manifest.json").resolve(strict=True)
    report["model"] = {"directory": str(model_dir), **read_manifest(manifest), **check_model_files(model_dir)}
    image_path = args.image.resolve(strict=True)
    if not image_path.is_file():
        raise ValueError("輸入必須是本機影像檔案。")
    image_hash = sha256_file(image_path)
    from PIL import Image, ImageDraw, ImageOps
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    with Image.open(image_path) as encoded:
        ew, eh = encoded.size
        validate_crop(ew, eh, None)
        if getattr(encoded, "n_frames", 1) != 1:
            raise ValueError("試驗只接受單一靜態影像。")
        orientation = encoded.getexif().get(274, 1)
        to_encoded = orientation_matrix(orientation, ew, eh)
        oriented = ImageOps.exif_transpose(encoded).convert("RGB")
    x, y, w, h = validate_crop(*oriented.size, args.crop)
    crop = oriented.crop((x, y, x + w, y + h))
    original_size = oriented.size
    del oriented
    if sha256_file(image_path) != image_hash:
        raise ValueError("讀取期間來源檔案已變更；未執行推論。")
    crop.save(output / "input-crop.png")
    report["image"] = {"path": str(image_path), "file_sha256": image_hash,
        "encoded_size": {"width": ew, "height": eh}, "exif_orientation": orientation,
        "source_size": {"width": original_size[0], "height": original_size[1]},
        "source_coordinate_space": "EXIF-oriented display raster; continuous pixel-edge coordinates",
        "crop_xywh": [x, y, w, h], "crop_size": {"width": w, "height": h},
        "crop_file": "input-crop.png", "crop_file_sha256": sha256_file(output / "input-crop.png"),
        "crop_to_source_matrix": [[1, 0, x], [0, 1, y], [0, 0, 1]],
        "source_to_encoded_matrix": to_encoded,
        "mask_coordinate_space": "crop pixels, PNG 0/255; no metric scale or inferred depth"}
    report["stage"] = "loading-runtime"
    write_json(output / "report.json", report)
    import torch
    from transformers import Sam3Model, Sam3Processor
    report["environment"].update({name: importlib.metadata.version(name) for name in ("torch", "transformers", "safetensors", "Pillow")})
    report["environment"]["cuda_runtime"] = torch.version.cuda
    device = torch.device(args.device)
    if device.type == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA 不可用；不自動改用 CPU。")
        if device.index is None:
            device = torch.device("cuda", torch.cuda.current_device())
        torch.cuda.set_device(device)
        if not torch.cuda.is_bf16_supported():
            raise RuntimeError("此 CUDA 裝置不支援 bfloat16；不改變精度偷偷執行。")
        free, total = torch.cuda.mem_get_info(device)
        reserve = max(512 * 1024 * 1024, int(total * .1))
        fraction = min(.70, max(0, (free - reserve) / total))
        if fraction * total < 512 * 1024 * 1024:
            raise RuntimeError("可用 VRAM 不足以保留渲染餘裕；未載入模型。")
        torch.cuda.set_per_process_memory_fraction(fraction, device)
        torch.cuda.reset_peak_memory_stats(device)
        report["gpu_budget"] = {"requested_allocator_fraction": .70, "effective_allocator_fraction": fraction,
            "free_before_model_bytes": free, "total_bytes": total, "reserved_headroom_bytes": reserve,
            "device_name": torch.cuda.get_device_name(device),
            "scope": "PyTorch allocator only; not a GPU compute, power, or whole-system memory cap"}
    else:
        report["gpu_budget"] = {"scope": "CPU explicitly requested; no CUDA allocation"}
    report["stage"] = "loading-model"
    write_json(output / "report.json", report)
    started = time.perf_counter()
    processor = Sam3Processor.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False)
    model = Sam3Model.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False,
        use_safetensors=True, attn_implementation="sdpa", dtype=torch.bfloat16).to(device).eval()
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    report["model_load"] = {"seconds": time.perf_counter() - started, **memory_record(torch, device)}
    report["model"]["actual_config_model_type"] = model.config.model_type
    remaining = args.max_instances
    preview = crop.copy()
    preview.thumbnail((OVERLAY_SIDE, OVERLAY_SIDE))
    preview_scale = [preview.width / w, preview.height / h]
    report["image"]["overlay_size"] = {"width": preview.width, "height": preview.height}
    report["image"]["crop_to_overlay_scale"] = preview_scale
    report["stage"] = "inference"
    # No batched prompts or cached full-resolution tensors. Only one prompt's logits live at a time.
    for prompt_index, prompt in enumerate(args.prompt, 1):
        entry = {"index": prompt_index, "prompt": prompt, "status": "running", "instances": []}
        report["prompts"].append(entry)
        write_json(output / "report.json", report)
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)
        started = time.perf_counter()
        inputs = outputs = None
        try:
            inputs = processor(images=crop, text=prompt, return_tensors="pt")
            inputs = {key: value.to(device=device, dtype=torch.bfloat16 if value.is_floating_point() else value.dtype)
                      for key, value in inputs.items()}
            report["inference_started"] = True
            with torch.inference_mode():
                outputs = model(**inputs)
            if device.type == "cuda":
                torch.cuda.synchronize(device)
            entry["inference_seconds"] = time.perf_counter() - started
            # The official processor's score convention: sigmoid(query) times sigmoid(presence).
            scores = outputs.pred_logits.detach().float().sigmoid()
            if outputs.presence_logits is not None:
                scores = scores * outputs.presence_logits.detach().float().sigmoid()
            if scores.ndim != 2 or scores.shape[0] != 1 or not torch.isfinite(scores).all():
                raise RuntimeError("SAM3 回傳的 score shape 或數值不符合單張影像契約。")
            candidates = torch.nonzero(scores[0] > args.threshold, as_tuple=False).flatten()
            candidates = candidates[torch.argsort(scores[0, candidates], descending=True)]
            entry["above_threshold_count"] = int(candidates.numel())
            selected = candidates[:remaining].cpu().tolist()
            entry["omitted_due_to_global_limit"] = int(candidates.numel()) - len(selected)
            del scores, candidates
            overlay = preview.copy()
            for ordinal, query_index in enumerate(selected, 1):
                # Resize one CPU mask at a time through the official processor. Its int64
                # full-resolution result would otherwise multiply by all instances on GPU.
                one = SimpleNamespace(pred_logits=outputs.pred_logits[:, query_index:query_index+1].detach().float().cpu(),
                    pred_boxes=outputs.pred_boxes[:, query_index:query_index+1].detach().float().cpu(),
                    pred_masks=outputs.pred_masks[:, query_index:query_index+1].detach().float().cpu(),
                    presence_logits=None if outputs.presence_logits is None else outputs.presence_logits.detach().float().cpu())
                result = processor.post_process_instance_segmentation(one, threshold=args.threshold,
                    mask_threshold=.5, target_sizes=[(h, w)])[0]
                if len(result["scores"]) != 1 or tuple(result["masks"].shape) != (1, h, w):
                    raise RuntimeError("官方後處理未回傳所選單一 instance；未偽造結果。")
                raw_box = result["boxes"][0].tolist()
                map_box(raw_box, [[1, 0, 0], [0, 1, 0], [0, 0, 1]])
                box = [min(w if i % 2 == 0 else h, max(0, v)) for i, v in enumerate(raw_box)]
                source_box = map_box(box, report["image"]["crop_to_source_matrix"])
                mask = result["masks"][0].to(torch.uint8).mul_(255).contiguous()
                mask_image = Image.frombytes("L", (w, h), mask.numpy().tobytes())
                file_name = f"prompt-{prompt_index:02d}-mask-{ordinal:03d}.png"
                mask_image.save(output / file_name)
                score = float(result["scores"][0])
                if not math.isfinite(score) or not 0 <= score <= 1:
                    raise RuntimeError("模型回傳非有限或越界 score。")
                entry["instances"].append({"id": f"p{prompt_index:02d}-{ordinal:03d}", "query_index": query_index,
                    "score": score, "box_crop_px_raw": raw_box, "box_crop_px": box,
                    "box_clipped_to_crop": box != raw_box, "box_source_px": source_box,
                    "box_encoded_px": map_box(source_box, to_encoded), "mask_file": file_name,
                    "mask_sha256": sha256_file(output / file_name), "mask_foreground_pixels": int(mask_image.histogram()[255]),
                    "empty_mask": mask_image.getbbox() is None})
                tint = ((ordinal * 71) % 192 + 63, (ordinal * 113) % 192 + 63, (ordinal * 149) % 192 + 63)
                small_mask = mask_image.resize(preview.size, Image.Resampling.NEAREST).point(lambda v: 90 if v else 0)
                overlay.paste(Image.new("RGB", preview.size, tint), (0, 0), small_mask)
                draw = ImageDraw.Draw(overlay)
                rect = [v * preview_scale[i % 2] for i, v in enumerate(box)]
                draw.rectangle(rect, outline=tint, width=2)
                draw.text((rect[0] + 3, rect[1] + 3), f"{ordinal}: {score:.3f}", fill="white", stroke_fill="black", stroke_width=1)
                del one, result, mask, mask_image, small_mask
                remaining -= 1
            overlay_file = f"prompt-{prompt_index:02d}-overlay.png"
            ImageDraw.Draw(overlay).text((8, 8), f"Prompt {prompt_index} | {len(selected)} instances | segmentation pilot", fill="white", stroke_fill="black", stroke_width=1)
            overlay.save(output / overlay_file)
            entry.update({"status": "complete", "saved_instance_count": len(selected), "overlay_file": overlay_file,
                          "overlay_sha256": sha256_file(output / overlay_file),
                          "total_seconds": time.perf_counter() - started, **memory_record(torch, device)})
            del overlay
        except Exception as error:
            entry.update({"status": "error", "error_type": type(error).__name__, "message": str(error),
                          "total_seconds": time.perf_counter() - started, **memory_record(torch, device)})
            raise
        finally:
            del inputs, outputs
            gc.collect()
            if device.type == "cuda":
                torch.cuda.empty_cache()
            write_json(output / "report.json", report)
    records = [report["model_load"], *report["prompts"]]
    report["cuda_peaks"] = {key: max((r.get(key) or 0 for r in records), default=0) if device.type == "cuda" else None
                            for key in ("peak_allocated_bytes", "peak_reserved_bytes")}
    report["saved_instance_count"] = args.max_instances - remaining


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = parser().parse_args(argv)
    output = None
    started = time.perf_counter()
    report = {"format": "lumiere-sam3-pilot", "version": 1, "scope": "local-segmentation-pilot-not-reconstruction",
        "status": "running", "stage": "preflight", "inference_started": False,
        "started_at": datetime.now(timezone.utc).isoformat(), "prompts": [],
        "settings": {"device": args.device, "dtype": "bfloat16", "attention": "sdpa", "threshold": args.threshold,
                     "mask_threshold": .5, "max_instances_total": args.max_instances, "local_files_only": True,
                     "trust_remote_code": False, "use_safetensors": True, "compile": False},
        "environment": {"python": sys.version, "platform": platform.platform()},
        "interpretation": "Scores describe model instance predictions, not geometric/metric certainty, depth, identity, or evidence validity. Empty masks and missed objects remain possible.",
        "limitations": ["No scene or capture JSON is edited.", "Masks are visible-image predictions; hidden surfaces are not reconstructed.",
                        "The allocator budget does not cap GPU compute utilization or power.", "No package/model installation or license acceptance is performed."]}
    try:
        validate_args(args)
        destination = args.output_dir.resolve()
        destination.mkdir(exist_ok=False)
        output = destination
        write_json(output / "report.json", report)
        run(args, report, output)
        report.update({"status": "complete", "stage": "finished"})
        code = 0
    except Exception as error:
        report.update({"status": "error", "error_type": type(error).__name__, "message": str(error)})
        code = 1
    report["total_seconds"] = time.perf_counter() - started
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if output is not None:
        write_json(output / "report.json", report)
    print(json.dumps({"status": report["status"], "inference_started": report["inference_started"],
                      "report": str(output / "report.json") if output else None,
                      **({"error_type": report["error_type"], "message": report["message"]} if code else {})}, ensure_ascii=False),
          file=sys.stderr if code else sys.stdout)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
