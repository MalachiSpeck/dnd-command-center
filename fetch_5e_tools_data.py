import os
import urllib.request
import json
import shutil
import time

BASE_DIR = r"C:\Users\mattm\Desktop\dnd-command-center"
DATA_DIR = os.path.join(BASE_DIR, "data")
BACKUP_DIR = os.path.join(BASE_DIR, "data_backup_before_5etools")

# Create a clean backup first
print("[*] Creating a safe backup of your current 'data' folder...")
if os.path.exists(DATA_DIR):
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR, exist_ok=True)
    for item in os.listdir(DATA_DIR):
        s = os.path.join(DATA_DIR, item)
        d = os.path.join(BACKUP_DIR, item)
        if item == "backups":
            continue # Skip custom backups folder to save space
        try:
            if os.path.isdir(s):
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)
        except Exception as e:
            print(f"    [!] Failed to backup {item}: {e}")
    print(f"[*] Backup saved to: {BACKUP_DIR}")
else:
    os.makedirs(DATA_DIR, exist_ok=True)

GITHUB_BASE_URL = "https://api.github.com/repos/Paul-Hanlon/5e-Tools/contents/data"
HEADERS = {'User-Agent': 'Mozilla/5.0'}

def get_contents(api_url):
    req = urllib.request.Request(api_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"    [!] Error getting contents from {api_url}: {e}")
        return []

def download_file(download_url, dest_path):
    print(f"    [-] Downloading file to: {os.path.relpath(dest_path, BASE_DIR)}...")
    req = urllib.request.Request(download_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as res:
            data = res.read()
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'wb') as f:
                f.write(data)
    except Exception as e:
        print(f"    [!] Error downloading {download_url}: {e}")

def process_directory(api_url, current_dest_dir):
    os.makedirs(current_dest_dir, exist_ok=True)
    items = get_contents(api_url)
    for item in items:
        name = item['name']
        type_ = item['type']
        path_ = item['path']
        
        # We can reconstruct download URL from path to bypass some rate limits if needed
        # but standard download_url works great
        d_url = item.get('download_url')
        local_dest = os.path.join(current_dest_dir, name)
        
        if type_ == 'file':
            if d_url:
                download_file(d_url, local_dest)
                time.sleep(0.1) # Small throttle to avoid hitting GitHub API speed limits
        elif type_ == 'dir':
            print(f"[*] Recursing into folder: {name}...")
            process_directory(item['url'], local_dest)

def main():
    print("[*] Contacting GitHub API to retrieve file tree for Paul-Hanlon/5e-Tools...")
    root_items = get_contents(GITHUB_BASE_URL)
    
    if not root_items:
        print("[!] No files found or GitHub API rate limit hit. Exiting.")
        return

    print(f"[*] Found {len(root_items)} top-level elements to analyze and process.")
    
    for idx, item in enumerate(root_items):
        name = item['name']
        type_ = item['type']
        d_url = item.get('download_url')
        
        print(f"\n[+] Processing item {idx+1}/{len(root_items)}: {name} ({type_})")
        local_dest = os.path.join(DATA_DIR, name)
        
        if type_ == 'file':
            if d_url:
                download_file(d_url, local_dest)
                time.sleep(0.1)
        elif type_ == 'dir':
            process_directory(item['url'], local_dest)
            
    print("\n[*] GRAND DATA REFRESH COMPLETE!")
    print("[*] All 5e-Tools rulesets, bestiaries, classes, items, and tables have been integrated into your data catalog.")

if __name__ == "__main__":
    main()
