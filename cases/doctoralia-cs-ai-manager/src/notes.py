"""
Turns the 29,846 free-text notes into typed signals.

Rules, not a model. Every tag is traceable to the phrase that produced it, which
means a specialist can be shown why their account was flagged, and a wrong tag is
a line to fix rather than a retrain. The notes are written by the operation's own
people — they are the richest and least used column in the file.

    python3 src/notes.py     # coverage report
"""
from __future__ import annotations
import re
from pathlib import Path
import numpy as np
import pandas as pd

# (tag, priority, regex) — priority orders which signal wins when several fire.
# Lower number = more urgent. Written in the specialists' own Spanish.
RULES: list[tuple[str, int, str]] = [
    ("churn_threat",        1, r"si este mes no mejora|cancela\b|pasa a retenci|comparando con otra plataforma"),
    ("discouraged",         2, r"desanimado|hay que mostrarle avance|pidi[oó] que le mostremos resultados"),
    ("complaint_no_patients", 2, r"no le llegan (citas|pacientes)|muy pocas citas|pocos pacientes por la plataforma|se queja de que casi no le llegan"),
    ("complaint_noshow",    3, r"ausentismo|no se presentan|pacientes que no llegan|le fallan \d+ de cada"),
    ("billing_issue",       3, r"tarjeta|facturaci[oó]n|m[eé]todo (de pago)?"),
    ("hollow_calendar",     3, r"ning[uú]n horario|no (ha subido|carg[oó]) (disponibilidad|horarios)|encendida y con ning|sin disponibilidad|casi vac[ií]a|prendi[oó] el calendario|activ[oó] el calendario"),
    ("onboarding_no_show",  4, r"no se conect[oó] a la sesi[oó]n"),
    ("unreachable",         4, r"no contest[oó]|no respondi[oó]|sin respuesta|van \d+ intentos"),
    ("open_task_prices",    5, r"confirme sus precios|cargar sus precios"),
    ("open_task_photo",     5, r"subir foto|foto de perfil|foto y la descripci[oó]n sin cargar"),
    ("open_task_description", 5, r"completar su descripci[oó]n"),
    ("needs_help_agenda",   5, r"c[oó]mo publicar horarios|cargar horarios reales|no sabe entrar a su panel"),
    ("needs_help_reviews",  5, r"responder opiniones"),
    ("upsell_payments",     6, r"candidato para payments|cobrar anticipo|prepago"),
    ("upsell_first_class",  6, r"first class|aparecer m[aá]s arriba"),
    ("upsell_marketing360", 6, r"marketing 360"),
    ("upsell_website",      6, r"p[aá]gina web propia"),
    ("upsell_plan",         6, r"siguiente plan|pasar a upsell"),
    ("multi_site",          7, r"dos consultorios"),
    ("gatekeeper",          7, r"asistente maneja la agenda"),
    ("whatsapp_only",       7, r"solo por whatsapp"),
    ("commitment",          8, r"qued[oó] de |quedamos de "),
    ("agenda_healthy",      8, r"agenda publicada con \d+ horarios|usa la agenda a diario"),
    ("positive",            9, r"contento|satisfecho|agradece|recomend[oó] la plataforma|todo claro|sin pendientes|sin dudas|buen contacto|le subieron las citas"),
]
COMPILED = [(t, p, re.compile(r, re.I)) for t, p, r in RULES]

ATTEMPTS = re.compile(r"van (\d+) intentos", re.I)
SLOTS_SEEN = re.compile(r"agenda publicada con (\d+) horarios", re.I)

# What the specialist should read back to the doctor, per tag.
QUOTABLE = {
    "open_task_prices": "confirmar sus precios",
    "open_task_photo": "subir su foto de perfil",
    "open_task_description": "completar su descripción",
    "hollow_calendar": "publicar horarios en su agenda",
    "needs_help_agenda": "aprender a publicar horarios",
    "needs_help_reviews": "responder opiniones de pacientes",
}


def tag_note(note: str) -> list[str]:
    if not isinstance(note, str):
        return []
    return [t for t, _, rx in COMPILED if rx.search(note)]


def tag_interactions(inter: pd.DataFrame) -> pd.DataFrame:
    """Adds one row per (interaction, tag). Long format, so a note with three
    signals produces three rows and nothing is silently dropped."""
    out = []
    for r in inter.itertuples():
        tags = tag_note(r.note)
        att = ATTEMPTS.search(r.note or "")
        slots = SLOTS_SEEN.search(r.note or "")
        for t in tags or ["untagged"]:
            out.append((r.interaction_id, r.doctor_id, r.occurred_at, r.direction,
                        r.specialist_id, t, r.note,
                        int(att.group(1)) if att else None,
                        int(slots.group(1)) if slots else None))
    return pd.DataFrame(out, columns=["interaction_id", "doctor_id", "occurred_at", "direction",
                                      "specialist_id", "tag", "note", "attempts", "slots_seen"])


PRIORITY = {t: p for t, p, _ in RULES}
OPEN_TAGS = [t for t in PRIORITY if t.startswith(("open_task", "needs_help"))] + \
            ["hollow_calendar", "churn_threat", "discouraged", "complaint_no_patients",
             "complaint_noshow", "billing_issue"]
UPSELL_TAGS = [t for t in PRIORITY if t.startswith("upsell")]
UPSELL_LABELS = {
    "upsell_payments": "Doctoralia Payments",
    "upsell_first_class": "First Class / visibilidad",
    "upsell_marketing360": "Marketing 360",
    "upsell_website": "sitio web propio",
    "upsell_plan": "plan superior",
}


def doctor_signals(tagged: pd.DataFrame, asof: pd.Timestamp) -> pd.DataFrame:
    """Collapse the long table to one row per doctor."""
    t = tagged[tagged.tag != "untagged"].copy()
    t["priority"] = t.tag.map(PRIORITY)
    g = t.groupby("doctor_id")
    df = pd.DataFrame(index=g.size().index)

    # the most urgent signal still standing, and when it was last seen
    t = t.sort_values(["doctor_id", "priority", "occurred_at"], ascending=[True, True, False])
    top = t.groupby("doctor_id").head(1).set_index("doctor_id")
    df["top_signal"] = top.tag
    df["top_signal_at"] = top.occurred_at
    df["top_signal_note"] = top.note
    df["days_since_top_signal"] = (asof - df.top_signal_at).dt.days

    for tag in ["churn_threat", "discouraged", "gatekeeper", "whatsapp_only",
                "onboarding_no_show", "hollow_calendar", "multi_site", "billing_issue"]:
        df[f"sig_{tag}"] = df.index.isin(t[t.tag == tag].doctor_id)

    df["complaints"] = t[t.tag.str.startswith("complaint")].groupby("doctor_id").size()
    df["open_items"] = t[t.tag.isin(OPEN_TAGS)].groupby("doctor_id").tag.nunique()
    up = t[t.tag.isin(UPSELL_TAGS)].sort_values("occurred_at")
    df["upsell_signal"] = up.groupby("doctor_id").tag.agg(
        lambda s: ", ".join(UPSELL_LABELS.get(x, x) for x in sorted(set(s))))
    last_up = up.groupby("doctor_id").tail(1).set_index("doctor_id")
    df["upsell_note"] = last_up.note
    df["upsell_at"] = last_up.occurred_at
    df["max_attempts"] = tagged.groupby("doctor_id").attempts.max()

    # open commitment: the doctor promised something and nothing positive followed
    com = t[t.tag == "commitment"].groupby("doctor_id").occurred_at.max()
    pos = t[t.tag == "positive"].groupby("doctor_id").occurred_at.max()
    df["last_commitment_at"] = com
    df["commitment_open"] = com.notna() & ((pos.reindex(com.index).isna()) | (pos.reindex(com.index) < com))
    df["days_commitment_open"] = (asof - df.last_commitment_at).dt.days.where(df.commitment_open)

    # what to actually say
    df["open_ask"] = df.top_signal.map(QUOTABLE)

    # unanswered outbound streak — how many outbound since the last inbound
    inter = tagged.drop_duplicates("interaction_id").sort_values(["doctor_id", "occurred_at"])
    last_in = inter[inter.direction == "inbound"].groupby("doctor_id").occurred_at.max()
    ob = inter[inter.direction == "outbound"]
    df["unanswered_outbound"] = ob.merge(last_in.rename("li"), left_on="doctor_id",
                                         right_index=True, how="left") \
        .assign(after=lambda x: x.li.isna() | (x.occurred_at > x.li)) \
        .query("after").groupby("doctor_id").size()
    df["ever_replied"] = df.index.isin(last_in.index)

    for c in ["complaints", "open_items", "unanswered_outbound"]:
        df[c] = df[c].fillna(0).astype(int)
    df["commitment_open"] = np.asarray(df.commitment_open.where(df.commitment_open.notna(), False), dtype=bool)
    return df


if __name__ == "__main__":
    from pipeline import load, DATA, RULES as PR
    t = load(DATA)
    tg = tag_interactions(t["interactions"])
    total = tg.interaction_id.nunique()
    untagged = tg[tg.tag == "untagged"].interaction_id.nunique()
    print(f"notes: {total}   tagged: {total - untagged} ({1 - untagged/total:.1%})   untagged: {untagged}")
    print("\ntag frequency (interactions):")
    print(tg[tg.tag != "untagged"].groupby("tag").interaction_id.nunique().sort_values(ascending=False).to_string())
    d = doctor_signals(tg, pd.Timestamp(PR["extract_date"]))
    print(f"\ndoctors with at least one signal: {len(d)}")
    print("\ntop_signal distribution:"); print(d.top_signal.value_counts().to_string())
    if untagged:
        print("\nsample untagged notes:")
        print(tg[tg.tag == "untagged"].note.dropna().drop_duplicates().head(10).to_string())
