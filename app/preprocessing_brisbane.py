import numpy as np
import pandas as pd

KEY_VARS = ['Dissolved Oxygen', 'Turbidity', 'pH', 'Salinity',
            'Temperature', 'Specific Conductance', 'Chlorophyll']

def _add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    df['hour'] = df['Timestamp'].dt.hour
    df['dayofweek'] = df['Timestamp'].dt.dayofweek
    df['month'] = df['Timestamp'].dt.month
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    return df

def _add_lag_roll_features(df: pd.DataFrame) -> pd.DataFrame:
    lag_base_cols = [c for c in KEY_VARS if c in df.columns]
    for col in lag_base_cols:
        for lag in [1, 2, 3]:
            df[f'{col}_lag{lag}'] = df[col].shift(lag)
        df[f'{col}_roll3_mean'] = df[col].rolling(window=3, min_periods=1).mean()
        df[f'{col}_roll3_std']  = df[col].rolling(window=3, min_periods=1).std()
        df[f'{col}_roll6_mean'] = df[col].rolling(window=6, min_periods=1).mean()
        df[f'{col}_roll6_std']  = df[col].rolling(window=6, min_periods=1).std()
    return df

def _add_pollution_score(df: pd.DataFrame) -> pd.DataFrame:
    do = df['Dissolved Oxygen'].fillna(df['Dissolved Oxygen'].median())
    tur = df['Turbidity'].fillna(df['Turbidity'].median())
    sal = df['Salinity'].fillna(df['Salinity'].median())
    df['pollution_score'] = -do + tur + sal
    return df

def preprocess_brisbane(raw_records, feature_cols):
    """
    raw_records: list[dict] with keys like original columns
    feature_cols: list of cols expected by the model
    Returns: X (1-row DataFrame) for prediction on the **latest** timestamp
    """
    df = pd.DataFrame(raw_records)

    # parse time & sort
    df['Timestamp'] = pd.to_datetime(df['Timestamp'])
    df = df.sort_values('Timestamp').reset_index(drop=True)

    df = _add_time_features(df)
    df = _add_lag_roll_features(df)
    df = _add_pollution_score(df)

    # use latest row for prediction
    last_row = df.iloc[[-1]].copy()

    # ensure all expected columns exist
    for col in feature_cols:
        if col not in last_row.columns:
            last_row[col] = np.nan

    X = last_row[feature_cols]

    # simple NaN handling for inference (forward/back fill then mean)
    X = X.fillna(method="ffill").fillna(method="bfill")
    X = X.fillna(X.mean())
    # final safeguard: replace any remaining NaNs (e.g., single-row lags) with 0
    X = X.fillna(0)
    return X

def preprocess_brisbane_batch(raw_records, feature_cols):
    """
    Prepare features for ALL rows to support batch predictions.
    Returns a tuple: (X, df_after_engineering, original_input_columns)
    - X: DataFrame with feature_cols for every row
    - df_after_engineering: DataFrame including engineered columns (used by caller to attach predictions)
    - original_input_columns: the columns present in the original raw input (to reconstruct output CSV)
    """
    df = pd.DataFrame(raw_records)
    # remember original columns to include in output
    original_input_columns = list(df.columns)

    # parse time & sort
    df['Timestamp'] = pd.to_datetime(df['Timestamp'])
    df = df.sort_values('Timestamp').reset_index(drop=True)

    df = _add_time_features(df)
    df = _add_lag_roll_features(df)
    df = _add_pollution_score(df)

    # ensure all expected columns exist
    for col in feature_cols:
        if col not in df.columns:
            df[col] = np.nan

    X = df[feature_cols].copy()
    # simple NaN handling for inference (forward/back fill then mean)
    X = X.fillna(method="ffill").fillna(method="bfill")
    X = X.fillna(X.mean())
    X = X.fillna(0)

    return X, df, original_input_columns
