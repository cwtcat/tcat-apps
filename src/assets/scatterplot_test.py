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


# === Load & filter data ===
df = pd.read_json(Path("cornell_summary.json"))
df = df[df["parameter"].isin(["FACULTY/STAFF", "TEMP STAFF"])].copy()

# Normalize time to service day
df["datetime_time"] = pd.to_datetime(df["half_hour_label"], format="%H:%M")
df["minutes_since_4am"] = (
    df["datetime_time"].dt.hour * 60 + df["datetime_time"].dt.minute - 240
)
df.loc[df["minutes_since_4am"] < 0, "minutes_since_4am"] += 24 * 60
df["hours_since_4am"] = df["minutes_since_4am"] / 60

# === PowerPoint-ready scatterplot ===
fig, ax = plt.subplots(figsize=(10, 5.625), dpi=300)

for cat, sub in df.groupby("parameter"):
    ax.scatter(sub["hours_since_4am"], sub["count"], label=cat, alpha=0.7, s=25)

# --- Unified title block ---
fig.suptitle(
    "All Routes Stacked Ridership Counts by 30-Minute Interval\n"
    "All Faculty/Staff and Temp Staff — 07/01/24 – 07/01/25",
    fontsize=13,
    fontweight="semibold",
    color="dimgray",
    y=0.98,
)

ax.set_xlabel("Time of Day (Service Day 04:00 → 03:00)")
ax.set_ylabel("Boarding Count")
ax.legend(title="Category")
ax.set_xticks(range(4, 28))
ax.set_xticklabels([f"{h%24:02d}:00" for h in range(4, 28)], rotation=45)
ax.grid(alpha=0.3)

plt.tight_layout(rect=[0, 0, 1, 0.94])
save_for_powerpoint(fig, "scatter_faculty_tempstaff.png")


# === Stacked bar chart (PowerPoint-ready) ===
agg = (
    df.groupby(["half_hour_label", "parameter"], as_index=False)["count"]
    .sum()
    .sort_values("half_hour_label")
)
pivot = agg.pivot(index="half_hour_label", columns="parameter", values="count").fillna(0)

# ensure consistent service-day timeline (04:00 → 03:00)
hours = pd.date_range("2025-01-01 04:00", "2025-01-02 03:00", freq="30min")
pivot = pivot.reindex([t.strftime("%H:%M") for t in hours], fill_value=0)

fig, ax = plt.subplots(figsize=(10, 5.625), dpi=300)

pivot.plot(
    kind="bar",
    stacked=True,
    ax=ax,
    color={"FACULTY/STAFF": "#1f77b4", "TEMP STAFF": "#ff7f0e"},
    alpha=0.85
)

plt.tight_layout()
plt.subplots_adjust(top=0.88)  # compact spacing between suptitle & title

# --- Titles ---
fig.suptitle(
    "Stacked Ridership Counts by 30-Minute Interval",
    fontsize=14,
    fontweight="bold",
    y=0.98,
)
ax.set_title(
    "All Faculty/Staff and Temp Staff Cornell Cards — 07/01/2024 – 07/01/2025",
    fontsize=11,
    color="gray",
    pad=2,   # tighten spacing between the two title lines
)

# --- Axes labels and ticks ---
ax.set_xlabel("Time of Day (Service Day 04:00 → 03:00)")
ax.set_ylabel("Total Count")
ax.set_xticks(range(0, len(pivot.index), 2))
ax.set_xticklabels(pivot.index[::2], rotation=45)

# === Add total riders label (top-right) ===
total_riders = int(df["count"].sum())
ax.text(
    0.98, 0.94,
    f"Total Riders: {total_riders:,}",
    transform=ax.transAxes,
    fontsize=10,
    color="dimgray",
    ha="right",
    va="top",
    fontweight="semibold",
    bbox=dict(facecolor="white", alpha=0.7, edgecolor="none", pad=3),
)

# === Legend positioned under “Total Riders” label ===
legend = ax.legend(
    title="Category",
    loc="upper right",
    bbox_to_anchor=(0.98, 0.80),   # just under the text box
    frameon=True,
)
legend.get_frame().set_alpha(0.7)

save_for_powerpoint(fig, "stacked_faculty_tempstaff.png")
