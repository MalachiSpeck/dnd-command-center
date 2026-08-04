#!/usr/bin/env python3
"""
D&D 5e PDF Rules Parser & Extractor Engine
Uses PyMuPDF (fitz) and layout-aware block extraction for spells, monsters, and magic items.
Outputs structured draft files into data/drafts/ for DM review.
"""

import os
import re
import sys
import json
import argparse
import yaml
import fitz  # PyMuPDF

# Ensure directories exist
os.makedirs("data/drafts/spells", exist_ok=True)
os.makedirs("data/drafts/monsters", exist_ok=True)
os.makedirs("data/drafts/magic_items", exist_ok=True)


def clean_text(text):
    if not text:
        return ""
    # Normalize unicode spaces and common typography issues
    text = text.replace('\xa0', ' ')
    text = text.replace('\u2014', '—')
    text = text.replace('\u201d', '"').replace('\u201c', '"')
    text = text.replace('\u2019', "'").replace('\u2018', "'")
    # Join hyphenated words split across lines
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    return text


def extract_page_text_layout_aware(page):
    """
    Extracts text from a PyMuPDF page in reading order (handling 2-column layouts).
    """
    blocks = page.get_text("blocks")
    if not blocks:
        return ""
    
    # Sort blocks primarily by x-column (left vs right) and then y-top
    mid_x = page.rect.width / 2
    
    col1 = []
    col2 = []
    full_width = []

    for b in blocks:
        if len(b) < 5 or b[6] != 0: # 0 means text block
            continue
        x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]
        if not text.strip():
            continue
        
        if x0 < mid_x - 30 and x1 > mid_x + 30:
            full_width.append((y0, text))
        elif x1 <= mid_x + 20:
            col1.append((y0, text))
        else:
            col2.append((y0, text))

    col1.sort(key=lambda item: item[0])
    col2.sort(key=lambda item: item[0])
    full_width.sort(key=lambda item: item[0])

    ordered_text = []
    for _, t in full_width:
        ordered_text.append(t)
    for _, t in col1:
        ordered_text.append(t)
    for _, t in col2:
        ordered_text.append(t)

    return clean_text("\n".join(ordered_text))


def get_pdf_info(pdf_path):
    """
    Returns PDF metadata, total pages, and file info in JSON.
    """
    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"File not found: {pdf_path}"}))
        return

    try:
        doc = fitz.open(pdf_path)
        toc = doc.get_toc()
        meta = doc.metadata or {}
        
        info = {
            "file_name": os.path.basename(pdf_path),
            "file_path": pdf_path,
            "page_count": len(doc),
            "title": meta.get("title") or os.path.basename(pdf_path),
            "author": meta.get("author") or "",
            "file_size_bytes": os.path.getsize(pdf_path),
            "toc_count": len(toc)
        }
        print(json.dumps(info))
    except Exception as e:
        print(json.dumps({"error": str(e)}))


def parse_spells_from_text(cleaned, source_file="PDF", level_filter=None):
    extracted = []
    pattern = r"([A-Za-z\s'\-]+)\n(?:(\d+)[a-z]{2}-level\s+([a-zA-Z]+)|([a-zA-Z]+)\s+cantrip)\nCasting Time:\s*(.+?)\nRange:\s*(.+?)\nComponents:\s*(.+?)\nDuration:\s*(.+?)\n"
    
    matches = list(re.finditer(pattern, cleaned, re.IGNORECASE))
    for idx, match in enumerate(matches):
        try:
            spell_name = match.group(1).strip()
            if len(spell_name) < 3 or len(spell_name) > 40 or spell_name.isupper() or "CHAPTER" in spell_name.upper():
                continue

            level_str = match.group(2)
            if level_str:
                level = int(level_str)
                school = match.group(3).strip().lower()
            else:
                level = 0
                school = match.group(4).strip().lower()

            if level_filter is not None and level != level_filter:
                continue

            casting_time = match.group(5).strip()
            spell_range = match.group(6).strip()
            components = match.group(7).strip()
            duration = match.group(8).strip()

            start_body_pos = match.end()
            end_body_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
            raw_body = cleaned[start_body_pos:end_body_pos].strip()

            body_lines = []
            for line in raw_body.split('\n'):
                line_strip = line.strip()
                if re.match(r'^\d+$', line_strip) or "PLAYER’S HANDBOOK" in line_strip.upper() or "©" in line_strip:
                    continue
                body_lines.append(line)
            
            body = "\n".join(body_lines).strip()

            at_higher_levels = ""
            higher_match = re.search(r"(At Higher Levels\..+)", body, re.IGNORECASE | re.DOTALL)
            if higher_match:
                at_higher_levels = higher_match.group(1).strip()
                body = body[:higher_match.start()].strip()

            slug = re.sub(r'[^a-z0-9]+', '_', spell_name.lower()).strip('_')
            file_name = f"data/drafts/spells/{slug}.md"

            frontmatter = {
                "name": spell_name,
                "level": level,
                "school": school,
                "classes": "wizard, sorcerer",
                "source": os.path.basename(source_file)
            }

            yaml_str = yaml.dump(frontmatter, default_flow_style=False, sort_keys=False)
            
            markdown_content = f"""---
{yaml_str}---

# {spell_name}
_{"Cantrip" if level == 0 else f"{level_str}-level {school}"}_

**Casting Time:** {casting_time}  
**Range:** {spell_range}  
**Components:** {components}  
**Duration:** {duration}  

{body}
"""
            if at_higher_levels:
                markdown_content += f"\n\n**At Higher Levels.** {at_higher_levels.replace('At Higher Levels.', '').strip()}"

            with open(file_name, "w", encoding="utf-8") as f:
                f.write(markdown_content)
            
            extracted.append({"name": spell_name, "type": "spell", "level": level, "file": file_name})
            print(f"[SAVED] Spell: {spell_name} (Level {level}) -> {file_name}", flush=True)

        except Exception as e:
            pass

    return extracted


def parse_monsters_from_text(cleaned, source_file="PDF", cr_min=0.0, cr_max=30.0):
    extracted = []
    ac_hp_pattern = r"([A-Z\s'\-]+)\n(?:[A-Za-z\s'\-,]+(?:\(titan\))?,\s+[a-z\s'\-]+\n)?Armor Class\s*(\d+.*?)\nHit Points\s*(\d+.*?)\nSpeed\s*(.*?)\n"
    
    matches = list(re.finditer(ac_hp_pattern, cleaned, re.IGNORECASE))
    for idx, match in enumerate(matches):
        try:
            name = match.group(1).strip()
            rejected_names = ['chaotic evil', 'lawful evil', 'neutral evil', 'chaotic neutral', 'lawful neutral', 'neutral', 'chaotic good', 'lawful good', 'neutral good', 'any alignment', 'unaligned']
            if name.lower() in rejected_names or len(name) < 3 or len(name) > 60 or "CHAPTER" in name.upper():
                continue

            name = re.sub(r'^[IJK\s’\']+\s*BEST[A-Z]+Y\s*\n', '', name, flags=re.IGNORECASE)
            name = re.sub(r'^[\s’\'\.\n\-]+', '', name).strip()
            if not name or name.upper() in ['I BESTIARY', 'J BESTI ARY', 'I BESTJARY']:
                continue

            ac_str = match.group(2).strip()
            hp_str = match.group(3).strip()
            speed = match.group(4).strip()

            ac_num = int(re.search(r'\d+', ac_str).group(0)) if re.search(r'\d+', ac_str) else 10
            hp_num = int(re.search(r'\d+', hp_str).group(0)) if re.search(r'\d+', hp_str) else 30

            start_body_pos = match.end()
            end_body_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
            body = cleaned[start_body_pos:end_body_pos].strip()

            scores_pattern = r"(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)\s*(\d+)\s*\([+-]\d+\)"
            scores_match = re.search(scores_pattern, body)
            
            stats = {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10}
            if scores_match:
                stats = {
                    "str": int(scores_match.group(1)),
                    "dex": int(scores_match.group(2)),
                    "con": int(scores_match.group(3)),
                    "int": int(scores_match.group(4)),
                    "wis": int(scores_match.group(5)),
                    "cha": int(scores_match.group(6))
                }

            cr = "1"
            cr_match = re.search(r"Challenge\s*(\d+(?:/\d+)?)", body, re.IGNORECASE)
            if cr_match:
                cr = cr_match.group(1)

            numeric_cr = 1.0
            if '/' in cr:
                n, d = cr.split('/')
                numeric_cr = float(n) / float(d)
            else:
                try: numeric_cr = float(cr)
                except: numeric_cr = 1.0

            if numeric_cr < cr_min or numeric_cr > cr_max:
                continue

            actions = []
            actions_section = re.search(r"ACTIONS\n(.+)", body, re.IGNORECASE | re.DOTALL)
            if actions_section:
                action_text = actions_section.group(1).strip()
                action_matches = re.findall(r"([A-Z][A-Za-z\s]+)\.\s*(.+?)(?=\n[A-Z][A-Za-z\s]+\.|$)", action_text, re.DOTALL)
                for act_name, act_desc in action_matches:
                    actions.append({
                        "name": act_name.strip(),
                        "desc": re.sub(r'\s+', ' ', act_desc.strip())
                    })

            monster_data = {
                "name": name,
                "size": "Medium",
                "type": "creature",
                "alignment": "unaligned",
                "ac": ac_num,
                "hp": hp_num,
                "speed": speed,
                "stats": stats,
                "cr": cr,
                "actions": actions,
                "source": os.path.basename(source_file),
                "raw_extracted": body[:1000]
            }

            slug = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
            file_name = f"data/drafts/monsters/{slug}.json"

            with open(file_name, "w", encoding="utf-8") as f:
                json.dump(monster_data, f, indent=2)

            extracted.append({"name": name, "type": "monster", "cr": cr, "file": file_name})
            print(f"[SAVED] Monster: {name} (CR {cr}) -> {file_name}", flush=True)

        except Exception as e:
            pass

    return extracted


def parse_magic_items_from_text(cleaned, source_file="PDF", rarity_filter=None):
    extracted = []
    pattern = r"([A-Za-z\s'\-]+)\n([A-Za-z\s]+,\s+(?:common|uncommon|rare|very rare|legendary).*?)\n"
    
    matches = list(re.finditer(pattern, cleaned, re.IGNORECASE))
    for idx, match in enumerate(matches):
        try:
            name = match.group(1).strip()
            if len(name) < 3 or len(name) > 40 or name.isupper() or "CHAPTER" in name.upper():
                continue

            type_rarity = match.group(2).strip()
            
            rarity = "Rare"
            for r in ["common", "uncommon", "very rare", "rare", "legendary", "artifact"]:
                if r in type_rarity.lower():
                    rarity = r.capitalize()
                    break

            if rarity_filter and rarity.lower() != rarity_filter.lower():
                continue

            start_body_pos = match.end()
            end_body_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
            body = cleaned[start_body_pos:end_body_pos].strip()

            req_attune = "requires attunement" in type_rarity.lower()

            item_data = {
                "name": name,
                "type": "W",
                "rarity": rarity,
                "type_rarity": type_rarity,
                "reqAttune": req_attune,
                "entries": [body],
                "price_gp": 500,
                "source": os.path.basename(source_file),
                "isHomebrew": True
            }

            slug = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
            file_name = f"data/drafts/magic_items/{slug}.json"

            with open(file_name, "w", encoding="utf-8") as f:
                json.dump(item_data, f, indent=2)

            extracted.append({"name": name, "type": "magic_item", "rarity": rarity, "file": file_name})
            print(f"[SAVED] Magic Item: {name} ({rarity}) -> {file_name}", flush=True)

        except Exception as e:
            pass

    return extracted


def main():
    parser = argparse.ArgumentParser(description="D&D 5e Optimized PDF Scraper Engine")
    parser.add_argument("--file", help="Path to PDF sourcebook")
    parser.add_argument("--type", choices=["spells", "monsters", "magic_items", "all"], default="all", help="Target rule category")
    parser.add_argument("--pages", help="Target pages (e.g. '12-45' or '12,14,16')")
    parser.add_argument("--info", action="store_true", help="Return PDF info JSON and exit")
    parser.add_argument("--cr-min", type=float, default=0.0, help="Min CR for monster filter")
    parser.add_argument("--cr-max", type=float, default=30.0, help="Max CR for monster filter")
    parser.add_argument("--spell-level", type=int, default=None, help="Specific spell level filter")
    parser.add_argument("--rarity", type=str, default=None, help="Item rarity filter")

    args = parser.parse_args()

    if args.info:
        if not args.file:
            print(json.dumps({"error": "--file is required for --info"}))
            sys.exit(1)
        get_pdf_info(args.file)
        sys.exit(0)

    if not args.file or not os.path.exists(args.file):
        print(f"[ERROR] File not found: {args.file}", flush=True)
        sys.exit(1)

    print(f"[STEP] Opening PDF document: {os.path.basename(args.file)}...", flush=True)
    doc = fitz.open(args.file)
    total_pages = len(doc)

    page_indices = list(range(total_pages))
    if args.pages:
        if '-' in args.pages:
            start, end = map(int, args.pages.split('-'))
            page_indices = list(range(max(0, start - 1), min(total_pages, end)))
        else:
            page_indices = [int(p) - 1 for p in args.pages.split(',') if 0 <= int(p) - 1 < total_pages]

    total_target_pages = len(page_indices)
    print(f"[STEP] Target Page Selection: {total_target_pages} of {total_pages} pages to scan.", flush=True)

    extracted_summary = []

    for i, p_idx in enumerate(page_indices):
        page = doc[p_idx]
        progress_pct = int(((i + 1) / total_target_pages) * 100)
        print(f"[PROGRESS:{progress_pct}] Scanning PDF Page {p_idx + 1} ({i + 1}/{total_target_pages})...", flush=True)

        text = extract_page_text_layout_aware(page)
        if not text:
            continue

        if args.type in ["spells", "all"]:
            spells = parse_spells_from_text(text, source_file=args.file, level_filter=args.spell_level)
            extracted_summary.extend(spells)

        if args.type in ["monsters", "all"]:
            monsters = parse_monsters_from_text(text, source_file=args.file, cr_min=args.cr_min, cr_max=args.cr_max)
            extracted_summary.extend(monsters)

        if args.type in ["magic_items", "all"]:
            items = parse_magic_items_from_text(text, source_file=args.file, rarity_filter=args.rarity)
            extracted_summary.extend(items)

    print(f"[COMPLETED] Extracted {len(extracted_summary)} total rules staged to data/drafts/", flush=True)


if __name__ == "__main__":
    main()
