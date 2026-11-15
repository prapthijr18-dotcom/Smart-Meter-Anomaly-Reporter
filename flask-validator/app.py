from flask import Flask, request, jsonify
from flask_cors import CORS
import re

app = Flask(__name__)
CORS(app)

# Concrete interpretation of the assignment's structured formats.
PHASES = {"R", "Y", "B"}
SECTIONS = {"A", "B", "C", "D", "E"}
METER_RE = re.compile(r"^GRID[A-E][0-9]{3}[RYB]$")
READING_RE = re.compile(r"^[0-9]{5}\.[0-9]{2}kWh$")

def meter_dfa(value):
    """DFA-style state walk for GRID + letter + 3 digits + phase."""
    states = ["G", "R", "I", "D", "LETTER", "D1", "D2", "D3", "PHASE", "ACCEPT"]
    expected = ["G", "R", "I", "D"]
    if not isinstance(value, str) or len(value) != 9:
        return False
    for i, char in enumerate(expected):
        if value[i] != char:
            return False
    if value[4] not in SECTIONS:
        return False
    if not all(c.isdigit() for c in value[5:8]):
        return False
    return value[8] in PHASES

def classify(text, urgency="Normal"):
    t = (text or "").lower()
    # Deterministic precedence: Tampering > Outage > Hardware > Communication > Overconsumption.
    rules = [
        ("Tampering", ["tamper", "seal broken", "magnet", "bypass", "meter opened"]),
        ("Outage", ["outage", "power cut", "no power", "blackout", "supply failure"]),
        ("Hardware", ["display", "screen", "burnt", "physical damage", "meter fault", "hardware"]),
        ("Communication", ["communication", "offline", "not transmitting", "signal", "network"]),
        ("Overconsumption", ["high usage", "overconsumption", "spike", "excess consumption", "abnormal reading"])
    ]
    for category, words in rules:
        if any(w in t for w in words):
            return category
    # Default category is explicit and deterministic, not an accidental null.
    return "Overconsumption"

@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "flask-validator"})

@app.post("/validate")
def validate():
    data = request.get_json(silent=True) or {}
    meter_id = str(data.get("meterId", "")).strip()
    reading = str(data.get("reading", "")).strip()
    description = str(data.get("description", "")).strip()
    urgency = str(data.get("urgency", "Normal")).strip().title()

    errors = []
    if not meter_id:
        errors.append("Meter ID is required.")
    elif not meter_dfa(meter_id):
        errors.append("Invalid meter ID. Expected GRID + uppercase letter + 3 digits + phase R/Y/B (example: GRIDA123R).")
    elif not METER_RE.fullmatch(meter_id):
        errors.append("DFA and regex validation disagree for meter ID.")
    if not reading:
        errors.append("Reading is required.")
    elif not READING_RE.fullmatch(reading):
        errors.append("Invalid reading. Expected five digits, decimal point, two digits and kWh (example: 12345.67kWh).")
    if not description:
        errors.append("Description is required.")
    if urgency not in {"Normal", "High", "Emergency", "Critical"}:
        errors.append("Urgency must be Normal, High, Emergency, or Critical.")

    accepted = len(errors) == 0
    category = classify(description, urgency) if accepted else None
    priority = "Critical" if urgency in {"Emergency", "Critical"} else urgency
    return jsonify({
        "accepted": accepted,
        "errors": errors,
        "dfaAccepted": meter_dfa(meter_id),
        "regexAccepted": bool(METER_RE.fullmatch(meter_id)),
        "readingAccepted": bool(READING_RE.fullmatch(reading)),
        "category": category,
        "priority": priority,
        "routingKey": meter_id[4] if accepted else None
    }), (200 if accepted else 400)

if __name__ == "__main__":
    app.run(port=5001, debug=True)
