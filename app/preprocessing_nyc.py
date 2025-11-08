import numpy as np
import pandas as pd

def parse_censored_numeric(v):
    if pd.isna(v):
        return np.nan
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s in ["", "-"]:
        return np.nan
    if s.startswith("<"):
        try:
            val = float(s[1:])
            return val / 2.0
        except:
            return np.nan
    if s.startswith(">"):
        try:
            return float(s[1:])
        except:
            return np.nan
    try:
        return float(s)
    except:
        return np.nan

def preprocess_nyc(raw_records, feature_cols):
    """
    raw_records: list[dict] with keys:
      'Sample Date', 'Sample Time', 'Sample class',
      'Residual Free Chlorine (mg/L)', 'Turbidity (NTU)'
    Returns X (DataFrame) with same feature_cols order.
    """
    df = pd.DataFrame(raw_records)

    # numeric cleaning
    df['Residual Free Chlorine (mg/L)'] = df['Residual Free Chlorine (mg/L)'].astype(float)
    df['Turbidity (NTU)'] = df['Turbidity (NTU)'].map(parse_censored_numeric)

    # time features
    df['SampleDate'] = pd.to_datetime(df['Sample Date'])
    df['SampleTime_str'] = df['Sample Time'].astype(str).str.strip()
    df['SampleDateTime'] = pd.to_datetime(
        df['SampleDate'].dt.date.astype(str) + " " + df['SampleTime_str'],
        errors="coerce"
    )

    df['year']      = df['SampleDateTime'].dt.year
    df['month']     = df['SampleDateTime'].dt.month
    df['dayofweek'] = df['SampleDateTime'].dt.dayofweek
    df['dayofyear'] = df['SampleDateTime'].dt.dayofyear

    # one-hot sample class
    class_dummies = pd.get_dummies(df['Sample class'], prefix='class')
    df = pd.concat([df, class_dummies], axis=1)

    # ensure all expected feature columns exist
    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0.0  # for missing dummy columns etc.

    X = df[feature_cols].copy()
    X = X.fillna(X.mean())
    return X
