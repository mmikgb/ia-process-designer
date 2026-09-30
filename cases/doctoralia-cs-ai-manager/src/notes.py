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

from i18n import L

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
# What each tag means, for the Señales screen (bilingual; the notes themselves are data and
# stay as written).
THEME_LABELS = {
    "churn_threat": L("Said they may cancel", "Dijo que cancelaría"),
    "discouraged": L("Discouraged with results", "Desanimado con los resultados"),
    "complaint_no_patients": L("Complained: no patients", "Se quejó: no le llegan pacientes"),
    "complaint_noshow": L("Complained: patient no-shows", "Se quejó: pacientes que no llegan"),
    "upsell_payments": L("Interested in Doctoralia Payments", "Interés en Doctoralia Payments"),
    "open_task_prices": L("Prices missing from the profile", "Faltan precios en el perfil"),
    "open_task_photo": L("Profile photo missing", "Falta foto de perfil"),
    "onboarding_no_show": L("Missed an onboarding session", "Faltó a una sesión de onboarding"),
    "open_task_description": L("Profile description missing", "Falta descripción del perfil"),
    "positive": L("Positive feedback", "Comentario positivo"),
    "commitment": L("A commitment was made", "Se hizo un compromiso"),
    "needs_help_agenda": L("Needs help with the calendar", "Necesita ayuda con la agenda"),
    "hollow_calendar": L("Calendar too thin", "Agenda muy delgada"),
    "unreachable": L("Could not be reached", "No se le pudo contactar"),
    "whatsapp_only": L("Only answers on WhatsApp", "Solo contesta por WhatsApp"),
    "billing_issue": L("Billing issue", "Problema de facturación"),
    "needs_help_reviews": L("Needs help with reviews", "Necesita ayuda con opiniones"),
    "agenda_healthy": L("Calendar in good shape", "Agenda en buen estado"),
    "multi_site": L("Works at several sites", "Atiende en varias sedes"),
    "gatekeeper": L("Talks through an assistant", "Se habla con su asistente"),
    "upsell_first_class": L("Interested in First Class", "Interés en First Class"),
    "upsell_marketing360": L("Interested in Marketing 360", "Interés en Marketing 360"),
    "upsell_plan": L("Interested in a higher plan", "Interés en un plan superior"),
    "upsell_website": L("Interested in their own website", "Interés en sitio web propio"),
}
UPSELL_LABELS = {
    "upsell_payments": "Doctoralia Payments",
    "upsell_first_class": "First Class / visibilidad",
    "upsell_marketing360": "Marketing 360",
    "upsell_website": "sitio web propio",
    "upsell_plan": "plan superior",
}


# --- follow-ups the specialists scheduled in their own notes -----------------
# ("Lo agendé para revisión en 4 días", "Seguimiento el jueves"). Only the latest
# interaction per doctor counts: a newer contact supersedes an older promise.
WEEKDAYS = {"lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2, "jueves": 3, "viernes": 4}
FOLLOWUP_RULES: list[tuple[str, str]] = [
    ("review",     r"revisi[oó]n en (\d+) d[ií]as"),              # note date + N days
    ("reschedule", r"reagendar en (\d+) d[ií]as"),                # note date + N days
    ("retry",      r"reintentar la pr[oó]xima semana"),            # note date + 7 days
    ("weekday",    r"seguimiento el (lunes|martes|mi[eé]rcoles|jueves|viernes)"),  # next such day
]
FOLLOWUP_COMPILED = [(k, re.compile(r, re.I)) for k, r in FOLLOWUP_RULES]


def followup(note, at) -> tuple[pd.Timestamp, str] | None:
    """(due date, kind) for the follow-up a note schedules, or None. When a note
    schedules two (\"Reintentar la próxima semana. Seguimiento el viernes.\"), the
    earlier date wins: that is the first moment the doctor is owed a contact."""
    if not isinstance(note, str) or pd.isna(at):
        return None
    day = pd.Timestamp(at).normalize()
    found = []
    for kind, rx in FOLLOWUP_COMPILED:
        m = rx.search(note)
        if not m:
            continue
        if kind in ("review", "reschedule"):
            due = day + pd.Timedelta(days=int(m.group(1)))
        elif kind == "retry":
            due = day + pd.Timedelta(days=7)
        else:
            wd = WEEKDAYS[m.group(1).lower()]
            ahead = (wd - day.weekday()) % 7 or 7     # strictly after the note date
            due = day + pd.Timedelta(days=ahead)
        found.append((due, kind))
    return min(found) if found else None


def followups(inter: pd.DataFrame) -> pd.DataFrame:
    """One row per doctor whose latest interaction schedules a follow-up."""
    last = (inter.sort_values(["doctor_id", "occurred_at", "interaction_id"])
            .groupby("doctor_id").tail(1))
    rows = []
    for r in last.itertuples():
        f = followup(r.note, r.occurred_at)
        if f:
            rows.append((r.doctor_id, f[0], f[1], r.note, pd.Timestamp(r.occurred_at).normalize(),
                         r.specialist_id))
    return pd.DataFrame(rows, columns=["doctor_id", "followup_due_at", "followup_kind",
                                       "followup_note", "followup_set_at", "followup_set_by"]
                        ).set_index("doctor_id")


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
    fu = followups(t["interactions"])
    doc = t["doctors"].set_index("doctor_id")
    fu = fu[fu.index.map(doc.status) == "active"]
    asof = pd.Timestamp(PR["extract_date"])
    stale = PR.get("followup_stale_days", 14)
    late = (asof - fu.followup_due_at).dt.days
    print(f"\nfollow-ups in the latest note, active doctors: {len(fu)}")
    print(f"  overdue by 1-{stale} days: {int(late.between(1, stale).sum())}")
    print(f"  due today:                {int((late == 0).sum())}")
    print(f"  due within 5 days:        {int(late.between(-5, -1).sum())}")
    print(f"  due later:                {int((late < -5).sum())}")
    print(f"  stale (overdue >{stale} days): {int((late > stale).sum())}")
    print("  by kind:", fu.followup_kind.value_counts().to_dict())
    loose = t["interactions"].note.str.contains(r"reagend|seguimiento|reintent", case=False, na=False)
    parsed = t["interactions"].note.map(lambda n: followup(n, asof) is not None)
    print(f"  notes that mention scheduling but match no rule: {int((loose & ~parsed).sum())}"
          " (e.g. a bare \"Reagendar.\" after an onboarding no-show)")
    if untagged:
        print("\nsample untagged notes:")
        print(tg[tg.tag == "untagged"].note.dropna().drop_duplicates().head(10).to_string())
