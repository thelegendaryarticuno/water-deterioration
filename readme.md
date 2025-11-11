# Urban Water Quality Early-Warning & Microbial Risk Dashboard

A FastAPI + Vanilla HTML/CSS/JS application that provides:

1. Brisbane River early water-quality deterioration risk estimation (single manual reading, latest row from uploaded CSV, or full CSV batch with downloadable predictions).
2. NYC Drinking Water microbial failure probability for individual samples.

Models were trained and experimentation performed in Kaggle: **Predictive Precision Notebook**  
Kaggle link: https://www.kaggle.com/code/namanmani/predctive-precision

> This repository contains only the serving layer (FastAPI + static frontend) and pre-trained model artifacts. Training code, detailed EDA, and experimentation are in the Kaggle notebook linked above and a detailed explanation of code has been done there.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Folder Structure](#folder-structure)
- [Models & Provenance](#models--provenance)
- [Environment & Requirements](#environment--requirements)
- [Running Locally (Windows PowerShell)](#running-locally-windows-powershell)
- [API Endpoints](#api-endpoints)
  - [Health](#health)
  - [Brisbane Prediction (Latest Row)](#brisbane-prediction-latest-row)
  - [Brisbane Batch Prediction](#brisbane-batch-prediction)
  - [Brisbane Single Manual Reading](#brisbane-single-manual-reading)
  - [NYC Microbial Risk Prediction](#nyc-microbial-risk-prediction)
- [Required / Expected Input Columns](#required--expected-input-columns)
- [Feature Engineering Summary](#feature-engineering-summary)
- [Frontend Features](#frontend-features)
- [Typical Ranges & Dynamic Coloring](#typical-ranges--dynamic-coloring)
- [Security / Validation Notes](#security--validation-notes)
- [Examples](#examples)
- [Future Improvements](#future-improvements)
- [License / Usage](#license--usage)

---

## Architecture Overview

The app serves a static single-page dashboard and exposes prediction endpoints using FastAPI. The frontend performs client-side CSV parsing (PapaParse) and communicates with JSON/CSV endpoints via `fetch()`. Pre-trained Random Forest models (serialized with `joblib`) are loaded on startup.

```
[Browser]
  ├── Upload CSV / Manual Form / NYC Form
  ├── Dynamic coloring & tooltips
  └── Fetch JSON/CSV → FastAPI
[FastAPI]
  ├── /predict/brisbane
  ├── /predict/brisbane/batch   (JSON or CSV streaming)
  ├── /predict/nyc
  └── /health
[Models]
  ├── models/brisbane_rf.joblib
  └── models/nyc_rf.joblib
```

---

## Folder Structure

```
app/
  main.py                 # FastAPI application, routes, static mounting
  preprocessing_brisbane.py  # Feature engineering for Brisbane (single + batch)
  preprocessing_nyc.py       # Feature engineering for NYC microbial risk
  streamlit_app.py        # (Original Streamlit prototype - now replaced by static frontend)
static/
  index.html              # Dashboard UI (tabs: Brisbane & NYC)
  style.css               # Styling including dynamic coloring classes
  script.js               # Frontend logic: CSV parsing, fetch calls, modal, input coloring
models/
  brisbane_rf.joblib      # Brisbane RandomForest model bundle (model + feature list + threshold)
  nyc_rf.joblib           # NYC RandomForest model bundle (model + feature list + threshold)
requirements.txt          # Pinned Python dependencies
README.md                 # Project documentation (this file)
```

---

## Models & Provenance

Both models were trained in the Kaggle environment referenced above. Each serialized artifact includes:

- `model`: A scikit-learn compatible estimator (RandomForestClassifier).
- `feature_cols`: Ordered list of features expected at inference.
- `threshold`: Custom decision threshold used to derive risk label from predicted probability.

Kaggle notebook: https://www.kaggle.com/code/namanmani/predctive-precision

---

## Environment & Requirements

- Python: 3.11.7 (venv)
- Core libs: FastAPI, Uvicorn, pandas, numpy, scikit-learn 1.7.2, joblib.
- See `requirements.txt` for exact pinned versions (fully reproducible environment).

Install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Run the server (development, auto-reload):

```powershell
uvicorn app.main:app --reload --port 8000
```

Then open: http://localhost:8000

---

## API Endpoints

### Health

`GET /health` → `{ "status": "ok" }`

### Brisbane Prediction (Latest Row)

`POST /predict/brisbane`

Body (JSON):

```json
{
  "records": [
    {
      "Timestamp": "2025-10-04 12:00",
      "Average_Water_Speed": 0.4,
      "Average_Water_Direction": 180,
      "Chlorophyll": 12.6,
      "Temperature": 24.1,
      "Dissolved_Oxygen": 7.8,
      "Dissolved_Oxygen_Saturation": 92.3,
      "pH": 7.4,
      "Salinity": 2.1,
      "Specific_Conductance": 480,
      "Turbidity": 4.2
    }
  ]
}
```

Returns probability and label for the **last row only**.

Response:

```json
{
  "probability_deterioration_soon": 0.34,
  "threshold_used": 0.3,
  "risk_label": 1,
  "n_rows_received": 120
}
```

### Brisbane Batch Prediction

`POST /predict/brisbane/batch`

Body (JSON): Same structure as above, multiple rows in `records`.
Optional: `"output_format": "csv"` to stream back a CSV.

JSON Response (if `output_format` omitted or set to `json`): list of per-row predictions + threshold.
CSV Response (if `output_format" = "csv"`): streamed file containing appended probability/label columns.

### Brisbane Single Manual Reading

Handled client-side: the frontend constructs a single-record array and reuses `/predict/brisbane` endpoint.

### NYC Microbial Risk Prediction

`POST /predict/nyc`

Body:

```json
{
  "samples": [
    {
      "Sample_Date": "2025-10-04",
      "Sample_Time": "12:05",
      "Sample_class": "Compliance",
      "Residual_Free_Chlorine_mg_L": 0.6,
      "Turbidity_NTU": 0.5
    }
  ]
}
```

Response:

```json
{
  "probability_failure": [0.07],
  "risk_labels": [0],
  "threshold_used": 0.25,
  "n_samples_received": 1
}
```

---

## Required / Expected Input Columns

### Brisbane CSV Required Columns

`Timestamp`, `Average Water Speed`, `Average Water Direction`, `Chlorophyll`, `Temperature`, `Dissolved Oxygen`, `Dissolved Oxygen (%Saturation)`, `pH`, `Salinity`, `Specific Conductance`, `Turbidity`

Internally these are mapped to underscore-separated keys for preprocessing.

### NYC Sample Fields

`Sample_Date`, `Sample_Time`, `Sample_class`, `Residual_Free_Chlorine_mg_L`, `Turbidity_NTU`

---

## Feature Engineering Summary

Brisbane:

- Time features (hour of day, day-of-week, month, cyclical encodings).
- Lag/rolling statistics (e.g., previous dissolved oxygen, rolling mean windows).
- Derived pollution score composites.
- Final `fillna(0)` to handle sparse manual inputs.

NYC:

- Basic temporal parsing (date/time to datetime index if needed).
- Direct use of chlorine & turbidity; categorical encoding for sample class.
- Probability threshold applied to derive risk label.

---

## Frontend Features

- Tabs for Brisbane and NYC.
- File upload & client-side CSV preview (last 10 rows).
- Validation of required columns with inline error messaging.
- Latest-row prediction button.
- Batch prediction with CSV download (server streaming).
- Manual single-entry form (Brisbane) with current timestamp autoload.
- NYC single sample form (date, time, class, chlorine, turbidity).
- Glossary & Ranges modal (shared definitions & typical ranges).
- Tooltip info icons next to each input parameter.
- Dynamic range-based coloring (green / amber / red) of numeric inputs for quick visual assessment.

---

## Typical Ranges & Dynamic Coloring

Indicative (non-regulatory) ranges used to color inputs:

Brisbane examples:

- Temperature: good 15–30°C; warn 10–35°C.
- pH: good 6.5–8.5; warn 6.0–9.0.
- Dissolved Oxygen: good 6–12 mg/L; warn 4–14 mg/L.
- Turbidity: good 0–5 NTU; warn 0–50 NTU.

NYC examples:

- Residual Free Chlorine: good 0.2–1.0 mg/L; warn 0.1–2.0 mg/L.
- Turbidity: good 0–0.3 NTU; warn 0.3–1.0 NTU.

Values outside warn ranges receive a red highlight. All ranges can be refined with domain calibration.

---

## Security / Validation Notes

- Minimal server-side validation presently (assumes sane numeric ranges); consider hard validation rules before production.
- No authentication; add an API key / OAuth layer for restricted deployments.
- CSV parsing done client-side; very large files may impact browser memory.
- Thresholds are static; adaptive thresholds could improve early-warning robustness.

---

## Examples

PowerShell `curl` (Invoke-WebRequest) for Brisbane latest-row style prediction:

```powershell
$body = '{"records":[{"Timestamp":"2025-10-04 12:00","Average_Water_Speed":0.4,"Average_Water_Direction":180,"Chlorophyll":12.6,"Temperature":24.1,"Dissolved_Oxygen":7.8,"Dissolved_Oxygen_Saturation":92.3,"pH":7.4,"Salinity":2.1,"Specific_Conductance":480,"Turbidity":4.2}]}'
Invoke-WebRequest -Uri http://localhost:8000/predict/brisbane -Method POST -ContentType 'application/json' -Body $body | Select-Object -ExpandProperty Content
```

Brisbane batch (CSV response):

```powershell
$body = '{"records":[{"Timestamp":"2025-10-04 12:00","Average_Water_Speed":0.4,"Average_Water_Direction":180,"Chlorophyll":12.6,"Temperature":24.1,"Dissolved_Oxygen":7.8,"Dissolved_Oxygen_Saturation":92.3,"pH":7.4,"Salinity":2.1,"Specific_Conductance":480,"Turbidity":4.2},{"Timestamp":"2025-10-04 12:10","Average_Water_Speed":0.5,"Average_Water_Direction":170,"Chlorophyll":13.1,"Temperature":24.3,"Dissolved_Oxygen":7.7,"Dissolved_Oxygen_Saturation":91.8,"pH":7.42,"Salinity":2.0,"Specific_Conductance":482,"Turbidity":4.4}],"output_format":"csv"}'
Invoke-WebRequest -Uri http://localhost:8000/predict/brisbane/batch -Method POST -ContentType 'application/json' -Body $body -OutFile brisbane_predictions.csv
```

NYC sample prediction:

```powershell
$body = '{"samples":[{"Sample_Date":"2025-10-04","Sample_Time":"12:05","Sample_class":"Compliance","Residual_Free_Chlorine_mg_L":0.6,"Turbidity_NTU":0.5}]}'
Invoke-WebRequest -Uri http://localhost:8000/predict/nyc -Method POST -ContentType 'application/json' -Body $body | Select-Object -ExpandProperty Content
```

---

## Future Improvements

- Add automated tests for preprocessing pipelines.
- Streaming large CSVs chunk-wise to reduce memory usage.
- More robust input validation & outlier detection.
- Historical trend visualizations (graphs) with small chart library.
- Configurable thresholds per deployment environment.
- Authentication & rate limiting.
- Containerization (Dockerfile + CI/CD pipeline).

---

## License / Usage

This project demonstrates a prototype early-warning and microbial risk interface. Typical ranges and risk labels are not substitutes for regulatory compliance or professional environmental assessment.

If redistributing or adapting, retain attribution to the Kaggle notebook and clearly document any retraining or threshold changes.

---

## Attribution

- Kaggle Notebook: https://www.kaggle.com/code/namanmani/predctive-precision
- Libraries: FastAPI, scikit-learn, pandas, numpy, PapaParse.

---

Questions or enhancement requests: open an issue or modify the README with added details.
