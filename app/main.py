# app/main.py

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import io
import joblib
import numpy as np

from .preprocessing_brisbane import preprocess_brisbane, preprocess_brisbane_batch
from .preprocessing_nyc import preprocess_nyc

# ---------- load models on startup ----------
# Attempt to load model artifacts. If scikit-learn version mismatch causes failure,
# capture the exception and expose a helpful error when prediction endpoints are hit.
brisbane_model = None
brisbane_features = []
brisbane_thr = None
nyc_model = None
nyc_features = []
nyc_thr = None

def _load_artifacts():
    global brisbane_model, brisbane_features, brisbane_thr, nyc_model, nyc_features, nyc_thr
    try:
        artifact = joblib.load("models/brisbane_rf.joblib")
        brisbane_model = artifact["model"]
        brisbane_features = artifact["feature_cols"]
        brisbane_thr = artifact["threshold"]
    except Exception as e:
        print(f"[WARN] Failed to load brisbane model: {e}")
    try:
        artifact = joblib.load("models/nyc_rf.joblib")
        nyc_model = artifact["model"]
        nyc_features = artifact["feature_cols"]
        nyc_thr = artifact["threshold"]
    except Exception as e:
        print(f"[WARN] Failed to load nyc model: {e}")

_load_artifacts()

app = FastAPI(
    title="Urban Water Quality Early-Warning API",
    version="1.0.0"
)

# ---------- Static files (frontend) ----------
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

# Mount /static if the folder exists (created by setup)
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ---------- Pydantic Schemas ----------

class BrisbaneRecord(BaseModel):
    Timestamp: str
    Average_Water_Speed: Optional[float] = None
    Average_Water_Direction: Optional[float] = None
    Chlorophyll: Optional[float] = None
    Temperature: Optional[float] = None
    Dissolved_Oxygen: Optional[float] = None
    Dissolved_Oxygen_Saturation: Optional[float] = None
    pH: Optional[float] = None
    Salinity: Optional[float] = None
    Specific_Conductance: Optional[float] = None
    Turbidity: Optional[float] = None

    # we’ll map these to the original column names

class BrisbanePayload(BaseModel):
    records: List[BrisbaneRecord]

class BrisbaneBatchQuery(BaseModel):
    records: List[BrisbaneRecord]
    output_format: Optional[str] = "json"  # 'json' or 'csv'

class NYCSample(BaseModel):
    Sample_Date: str
    Sample_Time: str
    Sample_class: str
    Residual_Free_Chlorine_mg_L: float
    Turbidity_NTU: float

class NYCPayload(BaseModel):
    samples: List[NYCSample]

# ---------- Helpers to map field names ----------

def map_brisbane_payload(payload: BrisbanePayload):
    rows = []
    for r in payload.records:
        d = r.dict()
        rows.append({
            "Timestamp": d["Timestamp"],
            "Average Water Speed": d["Average_Water_Speed"],
            "Average Water Direction": d["Average_Water_Direction"],
            "Chlorophyll": d["Chlorophyll"],
            "Temperature": d["Temperature"],
            "Dissolved Oxygen": d["Dissolved_Oxygen"],
            "Dissolved Oxygen (%Saturation)": d["Dissolved_Oxygen_Saturation"],
            "pH": d["pH"],
            "Salinity": d["Salinity"],
            "Specific Conductance": d["Specific_Conductance"],
            "Turbidity": d["Turbidity"],
        })
    return rows

def map_nyc_payload(payload: NYCPayload):
    rows = []
    for s in payload.samples:
        d = s.dict()
        rows.append({
            "Sample Date": d["Sample_Date"],
            "Sample Time": d["Sample_Time"],
            "Sample class": d["Sample_class"],
            "Residual Free Chlorine (mg/L)": d["Residual_Free_Chlorine_mg_L"],
            "Turbidity (NTU)": d["Turbidity_NTU"],
        })
    return rows

# ---------- Endpoints ----------

@app.get("/")
def root():
    """Serve the frontend index.html if available; otherwise return basic status JSON."""
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"status": "ok", "message": "Water quality early-warning API"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict/brisbane")
def predict_brisbane(payload: BrisbanePayload):
    if brisbane_model is None:
        raise HTTPException(status_code=500, detail="Brisbane model not loaded due to scikit-learn version mismatch or missing artifact. Recreate environment with training scikit-learn version (e.g. 1.2.2) or retrain model under current version.")
    raw_rows = map_brisbane_payload(payload)
    X = preprocess_brisbane(raw_rows, brisbane_features)
    proba = float(brisbane_model.predict_proba(X)[:, 1][0])
    label = int(proba >= brisbane_thr)
    return {
        "probability_deterioration_soon": proba,
        "risk_label": label,
        "threshold_used": brisbane_thr
    }

@app.post("/predict/brisbane/batch")
def predict_brisbane_batch(query: BrisbaneBatchQuery):
    if brisbane_model is None:
        raise HTTPException(status_code=500, detail="Brisbane model not loaded.")
    raw_rows = map_brisbane_payload(BrisbanePayload(records=query.records))
    X, engineered_df, original_cols = preprocess_brisbane_batch(raw_rows, brisbane_features)
    # predict for every row
    probas = brisbane_model.predict_proba(X)[:, 1]
    labels = (probas >= brisbane_thr).astype(int)

    # attach predictions to output frame (aligned with engineered_df ordering)
    output_df = engineered_df[original_cols].copy()
    output_df['probability_deterioration_soon'] = probas
    output_df['risk_label'] = labels
    output_df['threshold_used'] = brisbane_thr

    if query.output_format == 'csv':
        # stream CSV to client as attachment
        csv_buf = io.StringIO()
        output_df.to_csv(csv_buf, index=False)
        csv_buf.seek(0)
        headers = {
            "Content-Disposition": "attachment; filename=brisbane_predictions.csv"
        }
        return StreamingResponse(csv_buf, media_type="text/csv", headers=headers)
    else:
        records = output_df.to_dict(orient="records")
        for r in records:
            r["probability_deterioration_soon"] = float(r["probability_deterioration_soon"])
            r["risk_label"] = int(r["risk_label"])
            r["threshold_used"] = float(r["threshold_used"])
        return {"predictions": records, "count": int(len(records))}

@app.post("/predict/nyc")
def predict_nyc(payload: NYCPayload):
    if nyc_model is None:
        raise HTTPException(status_code=500, detail="NYC model not loaded due to scikit-learn version mismatch or missing artifact. Recreate environment with training scikit-learn version (e.g. 1.2.2) or retrain model under current version.")
    raw_rows = map_nyc_payload(payload)
    X = preprocess_nyc(raw_rows, nyc_features)
    proba = nyc_model.predict_proba(X)[:, 1].tolist()
    labels = [int(p >= nyc_thr) for p in proba]
    return {
        "probability_failure": proba,
        "risk_labels": labels,
        "threshold_used": nyc_thr
    }
