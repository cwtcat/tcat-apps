import pandas as pd
def convert_json_to_csv(input_path, output_path):
    """
    Reads a JSON file and writes a flattened CSV.
    Handles:
      - Arrays of objects
      - Nested JSON via pandas.json_normalize
    """
    print(f"📥 Reading JSON file: {input_path}")
    data = pd.read_json(input_path)

    # If the top-level object is a list of dicts, it's fine.
    # If it's a dict with nested data, flatten it.
    if isinstance(data.iloc[0], (dict, list)):
        print("📊 Detected nested structure — flattening...")
        data = pd.json_normalize(data)
    
    data.to_csv(output_path, index=False)
    print("✅ Conversion complete!")

if __name__ == "__main__":
    convert_json_to_csv("./src/assets/cornell_summary_03.json", "staff_riders_2407-2507_002.csv")