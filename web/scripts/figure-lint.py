"""Geometry lint for diagram figures: flags labels that run past the box, labels that sit on
another part, and labels that lie on a line. Mirrors ProblemFigure.tsx's label placement.
usage: figure-lint.py <patch.json> [more patch.json...]  (prints one line per finding)"""
import json, math, sys

CH = 6.5  # px per character at 12 px; 11 px labels use 6.0, 10 px subs use 5.4


def text_box(x, y, text, size, anchor):
    w = len(str(text)) * (CH * size / 12)
    h = size
    if anchor == "middle":
        x0 = x - w / 2
    elif anchor == "end":
        x0 = x - w
    else:
        x0 = x
    return (x0, y - h * 0.8, x0 + w, y + h * 0.25)


def overlap(a, b, pad=0):
    return not (a[2] + pad < b[0] or b[2] + pad < a[0] or a[3] + pad < b[1] or b[3] + pad < a[1])


def seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def labels_of(items):
    """(owner_index, text, bbox) for every label the renderer draws."""
    out = []
    for i, it in enumerate(items):
        t = it.get("t")
        if t == "box" and it.get("label"):
            x, y, w, h = it["x"], it["y"], it["w"], it["h"]
            two = bool(it.get("sub"))
            out.append((i, it["label"], text_box(x + w / 2, y + h / 2 + (-2 if two else 4), it["label"], 12, "middle")))
            if two:
                out.append((i, it["sub"], text_box(x + w / 2, y + h / 2 + 13, it["sub"], 10, "middle")))
        elif t == "line" and it.get("label"):
            x1, y1, x2, y2 = it["x1"], it["y1"], it["x2"], it["y2"]
            dx, dy = x2 - x1, y2 - y1
            ln = math.hypot(dx, dy) or 1
            nx, ny = dy / ln * 11, -dx / ln * 11
            anchor = ("end" if nx < 0 else "start") if abs(nx) > 6 else "middle"
            out.append((i, it["label"], text_box((x1 + x2) / 2 + nx, (y1 + y2) / 2 + ny + 4, it["label"], 11, anchor)))
        elif t == "circle" and it.get("label"):
            out.append((i, it["label"], text_box(it["cx"], it["cy"] + 4, it["label"], 11, "middle")))
        elif t == "poly" and it.get("label"):
            ps = it["points"]
            cx = sum(p[0] for p in ps) / len(ps)
            cy = sum(p[1] for p in ps) / len(ps)
            out.append((i, it["label"], text_box(cx, cy + 4, it["label"], 11, "middle")))
        elif t == "dot" and it.get("label"):
            side = it.get("side", "right")
            dx = -7 if side == "left" else 7 if side == "right" else 0
            dy = -7 if side == "above" else 14 if side == "below" else 4
            anchor = "end" if side == "left" else "start" if side == "right" else "middle"
            out.append((i, it["label"], text_box(it["cx"] + dx, it["cy"] + dy, it["label"], 11, anchor)))
        elif t == "dim" and it.get("label"):
            x1, y1, x2, y2 = it["x1"], it["y1"], it["x2"], it["y2"]
            dx, dy = x2 - x1, y2 - y1
            ln = math.hypot(dx, dy) or 1
            nx, ny = -dy / ln * 5, dx / ln * 5
            out.append((i, it["label"], text_box((x1 + x2) / 2 + nx * 2.4, (y1 + y2) / 2 + ny * 2.4 + 4, it["label"], 11, "middle")))
        elif t == "text" and it.get("s"):
            out.append((i, it["s"], text_box(it["x"], it["y"], it["s"], it.get("size", 12), it.get("anchor", "start"))))
    return out


def resolve_frame(spec, index):
    """Mirror of lib/content/diagram-frames.ts: the base items with a frame's overrides."""
    base = spec.get("items", [])
    frames = spec.get("frames") or []
    if index >= len(frames) or not frames[index].get("set"):
        return base
    out = []
    for i, it in enumerate(base):
        over = frames[index]["set"].get(str(i))
        merged = {**it, **over} if over else it
        if not merged.get("hidden"):
            out.append(merged)
    return out


def lint(entry):
    fig = entry.get("figure") or entry.get("explanationFigure")
    if not fig or fig.get("kind") != "diagram":
        return []
    spec = fig["spec"]
    frames = spec.get("frames") or []
    if frames:
        finds = []
        for i in range(len(frames)):
            still = {**spec, "frames": None, "items": resolve_frame(spec, i)}
            for line in lint_items(still):
                finds.append(f"[frame {i + 1}] {line}")
        for i, f in enumerate(frames):
            for key in (f.get("set") or {}):
                if not key.isdigit() or int(key) >= len(spec.get("items", [])):
                    finds.append(f"[frame {i + 1}] set names item {key}, which does not exist")
        return finds
    return lint_items(spec)


def lint_items(spec):
    W, H = spec.get("w", 360), spec.get("h", 220)
    items = spec.get("items", [])
    finds = []
    labs = labels_of(items)
    shapes = []  # (index, bbox) of solid parts
    for i, it in enumerate(items):
        if it.get("t") == "box":
            shapes.append((i, (it["x"], it["y"], it["x"] + it["w"], it["y"] + it["h"])))
        elif it.get("t") == "circle":
            shapes.append((i, (it["cx"] - it["r"], it["cy"] - it["r"], it["cx"] + it["r"], it["cy"] + it["r"])))
    for owner, text, bb in labs:
        if bb[0] < 0 or bb[2] > W or bb[1] < 0 or bb[3] > H:
            finds.append(f"clipped: label '{text}' runs past the {W}x{H} box ({bb[0]:.0f}..{bb[2]:.0f}, {bb[1]:.0f}..{bb[3]:.0f})")
        for si, sb in shapes:
            if si != owner and overlap(bb, sb):
                finds.append(f"overlap: label '{text}' lies on item {si} ({items[si].get('label') or items[si].get('t')})")
        for li, it in enumerate(items):
            if it.get("t") in ("line", "dim") and li != owner:
                cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
                if seg_dist(cx, cy, it["x1"], it["y1"], it["x2"], it["y2"]) < 7:
                    finds.append(f"on-line: label '{text}' sits on the {it['t']} item {li}")
        for o2, t2, bb2 in labs:
            if (owner, text) < (o2, t2) and overlap(bb, bb2):
                finds.append(f"labels collide: '{text}' and '{t2}'")
    for si, it in enumerate(items):
        if it.get("t") == "box":
            need = len(str(it.get("label", ""))) * CH + 8
            if need > it["w"]:
                finds.append(f"label wider than its box: '{it['label']}' needs {need:.0f} px, box is {it['w']} px")
    if len(items) > 20:
        finds.append(f"too many items: {len(items)}")
    return finds


total = 0
for f in sys.argv[1:]:
    for e in json.load(open(f, encoding="utf-8")):
        for line in lint(e):
            total += 1
            print(f"{e.get('stepId') or e.get('problemId')}: {line}")
print(f"{total} finding(s)")
