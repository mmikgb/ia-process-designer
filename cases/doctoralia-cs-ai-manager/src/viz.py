"""
The visual layer: Plotly for anything with a hover, inline SVG for anything tiny.

Colours are validated against the light and dark chart surfaces for chroma,
contrast and colour-vision separation (scripts/validate_palette.js in the dataviz
skill). Two categorical hues only — a third series folds into "other".
"""
from __future__ import annotations
import html
from i18n import en
import plotly.graph_objects as go

LIGHT = {"bar": "#0d8159", "alt": "#5b5bd6", "ink": "#14211c", "mut": "#5f6f68",
         "grid": "#e2e8e5", "surface": "#ffffff", "warn": "#8a5d00", "bad": "#a8291f"}
DARK = {"bar": "#22a87c", "alt": "#9d7bf0", "ink": "#e8eeeb", "mut": "#98a8a1",
        "grid": "#2a332e", "surface": "rgba(0,0,0,0)", "warn": "#d9a441", "bad": "#ef8279"}


def pal(dark: bool = False) -> dict:
    return DARK if dark else LIGHT


def _layout(p, h, legend=True, ytitle=""):
    return dict(
        height=h, margin=dict(l=8, r=8, t=8, b=8),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="ui-sans-serif, -apple-system, Segoe UI, Roboto", size=12.5, color=p["mut"]),
        hovermode="x unified",
        hoverlabel=dict(bgcolor=p["ink"], font=dict(color=p["surface"], size=12.5), bordercolor=p["ink"]),
        xaxis=dict(showgrid=False, zeroline=False, linecolor=p["grid"], ticks="outside",
                   tickcolor=p["grid"], ticklen=4),
        yaxis=dict(title=ytitle, gridcolor=p["grid"], zeroline=False, linecolor="rgba(0,0,0,0)"),
        showlegend=legend,
        legend=dict(orientation="h", yanchor="bottom", y=1.0, xanchor="left", x=0,
                    bgcolor="rgba(0,0,0,0)"),
    )


def area(x, series: list[tuple[str, list]], dark=False, height=300, stack=False, ytitle=""):
    """Up to two series, same unit. Stacked only when the parts sum to a whole."""
    p = pal(dark)
    colors = [p["bar"], p["alt"]]
    fig = go.Figure()
    for i, (name, y) in enumerate(series[:2]):
        c = colors[i]
        fig.add_trace(go.Scatter(
            x=x, y=y, name=name, mode="lines", line=dict(color=c, width=2, shape="spline",
                                                         smoothing=0.5),
            fill="tonexty" if (stack and i) else "tozeroy",
            stackgroup="one" if stack else None,
            fillcolor=c.replace("#", "rgba(").replace("rgba(", "rgba(") if False else None,
            opacity=1, hovertemplate="%{y:,.0f}<extra>" + html.escape(name) + "</extra>"))
        fig.data[-1].fillcolor = _rgba(c, 0.12 if not stack else 0.22)
    fig.update_layout(**_layout(p, height, legend=len(series) > 1, ytitle=ytitle))
    return fig


def line(x, series: list[tuple[str, list]], dark=False, height=280, pct=False, ytitle=""):
    p = pal(dark)
    colors = [p["bar"], p["alt"]]
    fig = go.Figure()
    for i, (name, y) in enumerate(series[:2]):
        fig.add_trace(go.Scatter(x=x, y=y, name=name, mode="lines+markers",
                                 line=dict(color=colors[i], width=2),
                                 marker=dict(size=5, color=colors[i]),
                                 hovertemplate=("%{y:.1%}" if pct else "%{y:,.2f}")
                                 + "<extra>" + html.escape(name) + "</extra>"))
    fig.update_layout(**_layout(p, height, legend=len(series) > 1, ytitle=ytitle))
    if pct:
        fig.update_yaxes(tickformat=".0%")
    return fig


def control(chart: dict, dark=False, height=290):
    """Limit band, centre line, series, flagged points in amber."""
    p = pal(dark)
    pts = chart["points"]
    x = [q["period"] for q in pts]
    v = [q["value"] for q in pts]
    ucl = [q["ucl"] for q in pts]
    lcl = [q["lcl"] for q in pts]
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=x, y=ucl, mode="lines", line=dict(width=0),
                             hoverinfo="skip", showlegend=False))
    fig.add_trace(go.Scatter(x=x, y=lcl, mode="lines", line=dict(width=0), fill="tonexty",
                             fillcolor=_rgba(p["bar"], 0.07), name="control limits",
                             hoverinfo="skip", showlegend=False))
    fig.add_hline(y=chart["center"], line=dict(color=p["mut"], width=1, dash="dash"))
    fig.add_trace(go.Scatter(x=x, y=v, mode="lines", line=dict(color=p["bar"], width=1.8),
                             name="value", hovertemplate="%{y:,.3f}<extra></extra>"))
    fx = [q["period"] for q in pts if q["signals"]]
    fy = [q["value"] for q in pts if q["signals"]]
    ft = [", ".join(q["signals"]) for q in pts if q["signals"]]
    if fx:
        fig.add_trace(go.Scatter(x=fx, y=fy, mode="markers", name="signal",
                                 marker=dict(size=10, color=p["warn"],
                                             line=dict(color=p["surface"], width=1.5)),
                                 text=ft, hovertemplate="%{y:,.3f}<br>%{text}<extra></extra>"))
    fig.update_layout(**_layout(p, height, legend=False))
    return fig


def segments(seg: list[dict], dark=False, height=54):
    """One stacked row. Parts of a whole, so stacking is legitimate."""
    p = pal(dark)
    shades = [_rgba(p["bar"], 1), _rgba(p["bar"], .55), _rgba(p["alt"], .65), _rgba(p["alt"], 1)]
    fig = go.Figure()
    for i, s in enumerate(seg):
        fig.add_trace(go.Bar(y=[""], x=[s["n"]], name=en(s["band"]), orientation="h",
                             marker=dict(color=shades[i % 4], line=dict(width=2, color=p["surface"])),
                             hovertemplate=f"{en(s['band'])}: %{{x:,.0f}} ({s['share']:.0%})<extra></extra>"))
    fig.update_layout(barmode="stack", height=height, margin=dict(l=0, r=0, t=0, b=0),
                      paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      showlegend=False, xaxis=dict(visible=False), yaxis=dict(visible=False),
                      hoverlabel=dict(bgcolor=p["ink"], font=dict(color=p["surface"])))
    return fig


def hbars(rows, dark=False, height=None, pct=True):
    """Single series, sorted, direct-labelled. No legend — the title names it."""
    p = pal(dark)
    rows = list(rows)
    labels = [r[0] for r in rows][::-1]
    vals = [r[1] for r in rows][::-1]
    fig = go.Figure(go.Bar(
        x=vals, y=labels, orientation="h", marker=dict(color=p["bar"]),
        text=[f"{v:.0%}" if pct else f"{v:,.0f}" for v in vals],
        textposition="outside", textfont=dict(color=p["ink"], size=12.5),
        hovertemplate=("%{x:.1%}" if pct else "%{x:,.0f}") + "<extra></extra>"))
    fig.update_layout(height=height or (34 * len(rows) + 30),
                      margin=dict(l=0, r=40, t=4, b=4),
                      paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      showlegend=False,
                      font=dict(size=12.5, color=p["mut"]),
                      xaxis=dict(visible=False), yaxis=dict(showgrid=False),
                      hoverlabel=dict(bgcolor=p["ink"], font=dict(color=p["surface"])))
    return fig


def _rgba(hex_color: str, a: float) -> str:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{a})"


# ── KPI card, rendered as HTML so it can carry a sparkline and a delta chip ──
def spark_svg(values, color, width=108, height=30) -> str:
    v = [x for x in values if x is not None]
    if len(v) < 2:
        return ""
    lo, hi = min(v), max(v)
    span = (hi - lo) or 1
    X = lambda i: 1 + (width - 2) * i / (len(v) - 1)
    Y = lambda x: height - 3 - (height - 8) * (x - lo) / span
    pts = " ".join(f"{X(i):.1f},{Y(x):.1f}" for i, x in enumerate(v))
    fill = f"{pts} {width-1},{height} 1,{height}"
    return (f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
            f'<polygon points="{fill}" fill="{color}" fill-opacity="0.10"/>'
            f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="1.6"/>'
            f'<circle cx="{X(len(v)-1):.1f}" cy="{Y(v[-1]):.1f}" r="2.6" fill="{color}"/></svg>')


def kpi_card(k: dict, dark=False) -> str:
    p = pal(dark)
    val = "—" if k["value"] is None else k["fmt"].format(k["value"])
    d = k.get("delta_pct")
    if d is None:
        chip = ""
    else:
        good = (d >= 0) if k["good"] == "up" else (d <= 0)
        col = p["bar"] if good else p["bad"]
        arrow = "▲" if d > 0 else ("▼" if d < 0 else "▬")
        chip = (f'<span style="color:{col};font-size:12px;font-weight:600;white-space:nowrap">'
                f'{arrow} {abs(d):.0%}</span>')
    sp = spark_svg(k["spark"], p["bar"]) if k.get("spark") else ""
    return f"""<div style="border:1px solid {p['grid']};border-radius:12px;padding:14px 16px;height:100%">
  <div style="color:{p['mut']};font-size:12.5px;line-height:1.3;min-height:32px">{html.escape(en(k['label']))}</div>
  <div style="display:flex;align-items:baseline;gap:8px;margin:6px 0 2px">
    <div style="font-size:27px;font-weight:650;color:{p['ink']};letter-spacing:-.02em">{val}</div>{chip}
  </div>
  <div style="margin:4px 0 2px">{sp}</div>
  <div style="color:{p['mut']};font-size:11.5px;line-height:1.35">{html.escape(en(k.get('suppressed') or k.get('note')) or '')}</div>
</div>"""
