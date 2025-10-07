import pandas as pd
import json
from pathlib import Path

# === Configurable date range (default: 2025-03-01 to 2025-05-01, UTC aware) ===
DATE_START = pd.Timestamp("2025-03-01", tz="UTC")
DATE_END = pd.Timestamp("2025-05-01", tz="UTC")

# === Input & output paths ===
INPUT_CSV = Path("all_riders.csv")
FILTERED_JSON = Path("cornell_filtered.json")
SUMMARY_JSON = Path("cornell_summary.json")

# === CSV column schema ===
COLS = [
    "vehicle", "time", "lat", "long", "Server_Time", "Route", "Trip", "Inbound_Outbound",
    "Stop_Name", "Stop_Id", "timestamp", "uuid", "ts", "bus", "trk2", "text",
    "description", "media_text", "dropfile_id", "fob", "rule", "parameter"
]

CHUNK_SIZE = 250_000

UNMATCHED_FIELDS = [
    "ts", "bus", "trk2", "text", "description", "media_text", "dropfile_id",
    "fob", "rule", "parameter"
]
filtered_chunks = []
summary_chunks = []

# === Read & filter in chunks ===
for chunk in pd.read_csv(
    INPUT_CSV,
    chunksize=CHUNK_SIZE,
    names=COLS,
    header=0,
    dtype=str,
    low_memory=False
):
    # Normalize whitespace and fill NaN
    chunk = chunk.applymap(lambda x: x.strip() if isinstance(x, str) else x)
    chunk.fillna("", inplace=True)

    # Parse a usable datetime
    if "time" in chunk.columns:
        chunk["datetime"] = pd.to_datetime(chunk["time"], errors="coerce", utc=True)
    elif "timestamp" in chunk.columns:
        chunk["datetime"] = pd.to_datetime(chunk["timestamp"], errors="coerce", utc=True)
    else:
        raise ValueError("Expected 'time' or 'timestamp' column in CSV.")

    # Filter to requested date range (inclusive)
    date_mask = chunk["datetime"].between(DATE_START, DATE_END)

    if not date_mask.any():
        continue
    chunk = chunk.loc[date_mask].copy()
    chunk["date"] = chunk["datetime"].dt.date

    # Identify Cornell rows
    cornell_mask = chunk["description"].eq("Cornell Card")

    # Identify unmatched boardings (all last 10 fields blank)
    blank_mask = chunk[UNMATCHED_FIELDS].apply(lambda row: all(v == "" for v in row), axis=1)

    combined_mask = cornell_mask | blank_mask
    filtered = chunk.loc[combined_mask].copy()

    if filtered.empty:
        continue

    filtered_chunks.append(filtered)

    # Aggregate Cornell-only summary
    cornell_only = filtered[filtered["description"] == "Cornell Card"]
    if not cornell_only.empty:
        grouped = (
            cornell_only.groupby(["date", "parameter"], as_index=False)
            .size()
            .rename(columns={"size": "count"})
        )
        summary_chunks.append(grouped)

# === Combine and output ===
if not filtered_chunks:
    raise RuntimeError(f"No matching Cornell or unmatched rows found between {DATE_START.date()} and {DATE_END.date()}.")

filtered_df = pd.concat(filtered_chunks, ignore_index=True)

# --- Write full filtered data ---
records = filtered_df.to_dict(orient="records")
with open(FILTERED_JSON, "w", encoding="utf-8") as f:
    json.dump(records, f, indent=2, ensure_ascii=False, default=str)
print(f"✅ Wrote filtered data ({len(records):,} rows) from {DATE_START.date()}–{DATE_END.date()} to {FILTERED_JSON}")

# --- Write Cornell summary ---
if summary_chunks:
    summary_df = pd.concat(summary_chunks, ignore_index=True)
    summary_df = (
        summary_df.groupby(["date", "parameter"], as_index=False)["count"]
        .sum()
        .sort_values(["date", "parameter"])
    )
    summary_records = summary_df.to_dict(orient="records")
    with open(SUMMARY_JSON, "w", encoding="utf-8") as f:
        json.dump(summary_records, f, indent=2, ensure_ascii=False, default=str)
    print(f"✅ Wrote Cornell summary ({len(summary_records):,} rows) to {SUMMARY_JSON}")
else:
    print("⚠️ No Cornell Card summary rows were found in this date range.")
