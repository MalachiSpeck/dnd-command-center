import os
import json

target_dir = r"C:\Users\mattm\Desktop\DND Dashboard JSON Data extract"

print("Starting HIGH-SPEED optimized removal of 'Free Basic Rules (2024)'...")

deleted_individual_files = 0
filtered_batch_items = 0

# We can find batch files separately to avoid treating them as individual files
batch_files = []
individual_files = []

for root, dirs, files in os.walk(target_dir):
    for file in files:
        if file.endswith('.json'):
            file_path = os.path.join(root, file)
            if file.startswith('_all_'):
                batch_files.append(file_path)
            else:
                individual_files.append(file_path)

print(f"Found {len(batch_files)} consolidated batch files and {len(individual_files)} individual item files.")

# 1. Process Batch Files (Full JSON parsing is fine here since there are only 6 files)
for b_file in batch_files:
    try:
        print(f"Filtering consolidated batch file: {os.path.basename(b_file)}...")
        with open(b_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if isinstance(data, list):
            original_len = len(data)
            filtered_data = [
                item for item in data 
                if str(item.get("book", "")).strip() != "Free Basic Rules (2024)"
            ]
            diff = original_len - len(filtered_data)
            if diff > 0:
                filtered_batch_items += diff
                print(f" -> Removed {diff} items from {os.path.basename(b_file)}.")
                with open(b_file, 'w', encoding='utf-8') as f_out:
                    json.dump(filtered_data, f_out, indent=2)
    except Exception as e:
        print(f"Error processing batch file {b_file}: {e}")

# 2. Process Individual Files using Ultra-Fast raw text scans (avoiding JSON parser overhead)
print("Scanning individual files using optimized text scanner...")
chunk_size = 1000  # Only need to read first 1KB of each file to find "book" field
target_str_1 = '"book": "Free Basic Rules (2024)"'
target_str_2 = '"book" : "Free Basic Rules (2024)"'

for idx, f_path in enumerate(individual_files):
    try:
        with open(f_path, 'r', encoding='utf-8') as f:
            content = f.read(chunk_size)
            
        if target_str_1 in content or target_str_2 in content:
            os.remove(f_path)
            deleted_individual_files += 1
    except Exception as e:
        # Fallback to full parse if read error
        try:
            with open(f_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict) and str(data.get("book", "")).strip() == "Free Basic Rules (2024)":
                os.remove(f_path)
                deleted_individual_files += 1
        except:
            pass

print("\n--- COMPLETED REMOVAL ---")
print(f"Permanently deleted individual 2024 files: {deleted_individual_files}")
print(f"Filtered out of consolidated lists: {filtered_batch_items} entries")
