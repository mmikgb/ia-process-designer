"""
Inline SVG bar charts. No libraries, no runtime, works in an emailed HTML file.

Single series only, so: one hue, no legend, direct labels on every bar (there are
never more than eight). Colors are validated against the light and dark chart
surfaces — see FINDINGS.md. Bars carry 4px rounded data-ends anchored to the
baseline and a 2px surface gap; the axis is recessive.
"""
from __future__ import annotations
import html

INK = "var(--fg)"
MUT = "var(--mut)"
BAR = "var(--bar)"


def hbars(rows, value_fmt="{:.0%}", width=620, row_h=30, label_w=150,
          highlight=None, note=None) -> str:
    """rows: [(label, value_0_to_1)] — already in the order you want them read."""
    if not rows:
        return ""
    h = len(rows) * row_h + 14
    plot_w = width - label_w - 56
    vmax = max(v for _, v in rows) or 1
    out = [f'<svg viewBox="0 0 {width} {h}" width="100%" height="{h}" role="img" '
           f'class="chart" preserveAspectRatio="xMinYMin meet">']
    for i, (lab, v) in enumerate(rows):
        y = i * row_h + 4
        bw = max(round(plot_w * v / vmax), 3)
        fill = "var(--bar-dim)" if (highlight and lab not in highlight) else BAR
        out.append(
            f'<text x="0" y="{y+15}" font-size="12.5" fill="{MUT}">{html.escape(str(lab))}</text>'
            f'<rect x="{label_w}" y="{y+3}" width="{bw}" height="{row_h-12}" rx="4" fill="{fill}"/>'
            f'<text x="{label_w+bw+8}" y="{y+15}" font-size="12.5" fill="{INK}" '
            f'font-weight="600">{value_fmt.format(v)}</text>')
    out.append("</svg>")
    if note:
        out.append(f'<p class="note">{note}</p>')
    return "".join(out)


def control(points, title="", value_fmt="{:.3f}", width=680, height=200,
            center=None, y_label="") -> str:
    """A control chart: limit band, centre line, the series, flagged points marked.

    Flagged points get amber + a ring, which is the only place amber appears in
    the whole system. Everything else is the recessive grey / one green rule.
    """
    if not points:
        return "<p class=note>Not enough data for this chart.</p>"
    n = len(points)
    pad_l, pad_r, pad_t, pad_b = 46, 14, 26, 28
    pw, ph = width - pad_l - pad_r, height - pad_t - pad_b
    vals = [p["value"] for p in points]
    ucl = [p.get("ucl") for p in points]
    lcl = [p.get("lcl") for p in points]
    lo = min([v for v in vals + lcl if v is not None])
    hi = max([v for v in vals + ucl if v is not None])
    span = (hi - lo) or 1
    lo, hi = lo - span * 0.12, hi + span * 0.12
    X = lambda i: pad_l + (pw * i / max(n - 1, 1))
    Y = lambda v: pad_t + ph - ph * (v - lo) / (hi - lo)

    band = (" ".join(f"{X(i):.1f},{Y(u):.1f}" for i, u in enumerate(ucl) if u is not None)
            + " " + " ".join(f"{X(i):.1f},{Y(l):.1f}" for i, l in reversed(list(enumerate(lcl)))
                             if l is not None))
    line = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(vals))
    c = center if center is not None else sum(vals) / n

    o = [f'<svg viewBox="0 0 {width} {height}" width="100%" height="{height}" role="img" '
         f'class="chart" preserveAspectRatio="xMinYMin meet">']
    if title:
        o.append(f'<text x="0" y="12" font-size="12.5" fill="{MUT}">{html.escape(title)}</text>')
    o.append(f'<polygon points="{band}" fill="var(--bar)" fill-opacity="0.07"/>')
    o.append(f'<line x1="{pad_l}" x2="{width-pad_r}" y1="{Y(c):.1f}" y2="{Y(c):.1f}" '
             f'stroke="{MUT}" stroke-dasharray="4 4" stroke-width="1"/>')
    o.append(f'<polyline points="{line}" fill="none" stroke="{BAR}" stroke-width="1.6"/>')
    for i, p in enumerate(points):
        flagged = bool(p.get("signals"))
        r, fill = (4.2, "var(--warn)") if flagged else (2.4, BAR)
        o.append(f'<circle cx="{X(i):.1f}" cy="{Y(p["value"]):.1f}" r="{r}" fill="{fill}"'
                 + (f' stroke="var(--bg)" stroke-width="1.5"' if flagged else "") + "/>")
    o.append(f'<text x="0" y="{Y(hi)+10:.1f}" font-size="10.5" fill="{MUT}">{value_fmt.format(hi)}</text>'
             f'<text x="0" y="{Y(lo):.1f}" font-size="10.5" fill="{MUT}">{value_fmt.format(lo)}</text>'
             f'<text x="{pad_l}" y="{height-8}" font-size="10.5" fill="{MUT}">{html.escape(str(points[0]["period"]))}</text>'
             f'<text x="{width-pad_r}" y="{height-8}" font-size="10.5" fill="{MUT}" '
             f'text-anchor="end">{html.escape(str(points[-1]["period"]))}</text>')
    o.append("</svg>")
    return "".join(o)


def spark(values, width=120, height=26) -> str:
    """Five dots, not a curve. Bookings are monthly and there are five months."""
    v = [x for x in values if x is not None]
    if len(v) < 2:
        return ""
    lo, hi = min(v), max(v)
    span = (hi - lo) or 1
    X = lambda i: 2 + (width - 4) * i / (len(v) - 1)
    Y = lambda x: height - 4 - (height - 8) * (x - lo) / span
    pts = " ".join(f"{X(i):.1f},{Y(x):.1f}" for i, x in enumerate(v))
    dots = "".join(f'<circle cx="{X(i):.1f}" cy="{Y(x):.1f}" r="2" fill="{BAR}"/>'
                   for i, x in enumerate(v))
    return (f'<svg viewBox="0 0 {width} {height}" width="{width}" height="{height}">'
            f'<polyline points="{pts}" fill="none" stroke="{BAR}" stroke-width="1.2" '
            f'stroke-opacity="0.5"/>{dots}</svg>')
