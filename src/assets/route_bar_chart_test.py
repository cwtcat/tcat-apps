import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

# === PowerPoint export defaults ===
SLIDE_WIDTH = 10      # inches
SLIDE_HEIGHT = 5.625  # inches  (16:9 aspect)
DPI = 300             # high enough for slides

def save_for_powerpoint(fig, filename: str):
    """Save a Matplotlib figure PowerPoint-ready (16:9 ratio, trimmed, high DPI)."""
    fig.set_size_inches(SLIDE_WIDTH, SLIDE_HEIGHT)
    fig.savefig(filename, dpi=DPI, bbox_inches="tight")
    print(f"💾 Saved PowerPoint-ready figure: {filename}")

# === Load data ===
summary_path = Path("cornell_summary.json")
df = pd.read_json(summary_path)

# === Filter to categories of interest ===
df = df[df["parameter"].isin(["FACULTY/STAFF", "TEMP STAFF"])].copy()

# === Normalize half-hour labels to continuous service-day order ===
df["datetime_time"] = pd.to_datetime(df["half_hour_label"], format="%H:%M")
df["minutes_since_4am"] = (
    df["datetime_time"].dt.hour * 60 + df["datetime_time"].dt.minute - 240
)
df.loc[df["minutes_since_4am"] < 0, "minutes_since_4am"] += 24 * 60
df["hours_since_4am"] = df["minutes_since_4am"] / 60

# === Build consistent 04:00→03:00 timeline ===
hours = pd.date_range("2025-01-01 04:00", "2025-01-02 03:00", freq="30min")
order = [t.strftime("%H:%M") for t in hours]

# === Iterate through routes ===
for route, subdf in df.groupby("Route"):
    # Aggregate by time + category within each route
    agg = (
        subdf.groupby(["half_hour_label", "parameter"], as_index=False)["count"]
        .sum()
        .sort_values("half_hour_label")
    )
    pivot = agg.pivot(index="half_hour_label", columns="parameter", values="count").fillna(0)

    # Ensure full time coverage for the service day
    pivot = pivot.reindex(order, fill_value=0)

    # Skip routes with no data after reindex
    if pivot.sum().sum() == 0:
        continue

    # === Plot stacked bar chart for this route ===
    fig, ax = plt.subplots(figsize=(14, 5), constrained_layout=True)

    pivot.plot(
        kind="bar",
        stacked=True,
        ax=ax,
        color={"FACULTY/STAFF": "#1f77b4", "TEMP STAFF": "#ff7f0e"},
        alpha=0.85
    )

    fig.suptitle(f"Route {route} – Stacked Ridership Counts by 30-Minute Interval", fontsize=14)
    ax.set_title("All Faculty/Staff and Temp Staff Cornell Cards 7/1/2024 – 7/1/2025", fontsize=11, color="gray")
    ax.set_xlabel("Time of Day (Service Day 04:00 → 03:00)")
    ax.set_ylabel("Total Count")
    ax.legend(title="Category")
    ax.set_xticks(range(0, len(pivot.index), 2))
    ax.set_xticklabels(pivot.index[::2], rotation=45)

    # Add total riders label
    total_riders = int(subdf["count"].sum())
    ax.text(
        0.98, 0.95,
        f"Total Riders: {total_riders:,}",
        transform=ax.transAxes,
        fontsize=10,
        color="dimgray",
        ha="right",
        va="top",
        fontweight="semibold",
        bbox=dict(facecolor="white", alpha=0.7, edgecolor="none", pad=3)
    )
    legend = ax.legend(
        title="Category",
        loc="upper right",
        bbox_to_anchor=(0.98, 0.82),  # just below total riders box
        frameon=True,
    )
    save_for_powerpoint(fig, f"route_{route}__staff_faculty_ridership_counts.png")
    plt.show()

