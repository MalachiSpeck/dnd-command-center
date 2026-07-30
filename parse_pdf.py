#!/usr/bin/env python3
"""
D&D PDF Parser & Rules Extractor CLI
Uses pdfplumber and pymupdf to extract spells, monsters, and magic items into drafts/ for DM review.
"""

import os
import re
import json
import argparse
import yaml
import pdfplumber
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


def parse_spells(pdf_path, pages=None):
    """
    Parses spells from PDF.
    D&D Spells follow a reliable pattern:
    [Spell Name] (Bold header)
    [Level]-level [School] (Subtitle)
    Casting Time: ...
    Range: ...
    Components: ...
    Duration: ...
    [Description text]
    """
    print(f"[*] Parsing spells from: {pdf_path} (Pages: {pages or 'All'})")
    doc = fitz.open(pdf_path)
    
    page_indices = range(len(doc))
    if pages:
        # Support ranges like '12-45' or lists '12,13,14'
        if '-' in pages:
            start, end = map(int, pages.split('-'))
            page_indices = range(start - 1, end)
        else:
            page_indices = [int(p) - 1 for p in pages.split(',')]

    extracted_spells_count = 0

    for p_idx in page_indices:
        if p_idx < 0 or p_idx >= len(doc):
            continue
        
        page = doc[p_idx]
        text = page.get_text("text")
        cleaned = clean_text(text)

        # Let's find Spell headers. Spells typically begin with a subtitle line:
        # e.g., "1st-level abjuration", "evocation cantrip", "9th-level necromancy"
        pattern = r"([A-Za-z\s'\-]+)\n(?:(\d+)[a-z]{2}-level\s+([a-zA-Z]+)|([a-zA-Z]+)\s+cantrip)\nCasting Time:\s*(.+?)\nRange:\s*(.+?)\nComponents:\s*(.+?)\nDuration:\s*(.+?)\n"
        
        matches = list(re.finditer(pattern, cleaned, re.IGNORECASE))
        for idx, match in enumerate(matches):
            try:
                spell_name = match.group(1).strip()
                # Exclude common false positives like "SPELLCASTING"
                if len(spell_name) < 3 or len(spell_name) > 40 or spell_name.isupper() or "CHAPTER" in spell_name.upper():
                    continue

                level_str = match.group(2)
                if level_str:
                    level = int(level_str)
                    school = match.group(3).strip().lower()
                else:
                    level = 0
                    school = match.group(4).strip().lower()

                casting_time = match.group(5).strip()
                spell_range = match.group(6).strip()
                components = match.group(7).strip()
                duration = match.group(8).strip()

                # Extract description body (starts after the duration, ends at the next spell match or end of page)
                start_body_pos = match.end()
                end_body_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
                raw_body = cleaned[start_body_pos:end_body_pos].strip()

                # Clean up footers and headers that might be trapped inside body
                body_lines = []
                for line in raw_body.split('\n'):
                    line_strip = line.strip()
                    # Skip common page footers/headers
                    if re.match(r'^\d+$', line_strip) or "PLAYER’S HANDBOOK" in line_strip.upper() or "©" in line_strip:
                        continue
                    body_lines.append(line)
                
                body = "\n".join(body_lines).strip()

                # Split out 'At Higher Levels'
                at_higher_levels = ""
                higher_match = re.search(r"(At Higher Levels\..+)", body, re.IGNORECASE | re.DOTALL)
                if higher_match:
                    at_higher_levels = higher_match.group(1).strip()
                    body = body[:higher_match.start()].strip()

                # Build Spell markdown output
                slug = re.sub(r'[^a-z0-9]+', '_', spell_name.lower()).strip('_')
                file_name = f"data/drafts/spells/{slug}.md"

                frontmatter = {
                    "name": spell_name,
                    "level": level,
                    "school": school,
                    "classes": "wizard, sorcerer"  # Plausible default to review
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
                
                extracted_spells_count += 1
                print(f" [+] Extracted Spell: {spell_name} -> {file_name}")

            except Exception as e:
                print(f" [!] Error parsing spell match: {e}")

    print(f"[*] Completed! Extracted {extracted_spells_count} spells to data/drafts/spells/")


def parse_monsters(pdf_path, pages=None):
    """
    Parses monsters/stat blocks from PDF.
    Stat blocks follow a rigid flow:
    - Name
    - Size, Type, Alignment
    - Armor Class, Hit Points, Speed
    - Ability scores (STR, DEX, CON, INT, WIS, CHA)
    - Saves, Skills, Immunities, Senses, Languages, Challenge Rating (CR)
    - Traits
    - Actions
    """
    print(f"[*] Parsing monsters from: {pdf_path} (Pages: {pages or 'All'})")
    doc = fitz.open(pdf_path)
    
    page_indices = range(len(doc))
    if pages:
        if '-' in pages:
            start, end = map(int, pages.split('-'))
            page_indices = range(start - 1, end)
        else:
            page_indices = [int(p) - 1 for p in pages.split(',')]

    extracted_monsters_count = 0

    for p_idx in page_indices:
        if p_idx < 0 or p_idx >= len(doc):
            continue
        
        page = doc[p_idx]
        text = page.get_text("text")
        cleaned = clean_text(text)

        # Detect Monster blocks by matching AC & HP lines
        # e.g., "Armor Class 15 (natural armor)" or "Hit Points 136 (16d10 + 48)"
        # Support optional subtitle line containing size/type before Armor Class
        ac_hp_pattern = r"([A-Z\s'\-]+)\n(?:[A-Za-z\s'\-,]+(?:\(titan\))?,\s+[a-z\s'\-]+\n)?Armor Class\s*(\d+.*?)\nHit Points\s*(\d+.*?)\nSpeed\s*(.*?)\n"
        
        matches = list(re.finditer(ac_hp_pattern, cleaned, re.IGNORECASE))
        for idx, match in enumerate(matches):
            try:
                name = match.group(1).strip()
                
                # Filter out alignments/factions matched as false positive names (like 'chaotic evil' or 'lawful evil')
                rejected_names = ['chaotic evil', 'lawful evil', 'neutral evil', 'chaotic neutral', 'lawful neutral', 'neutral', 'chaotic good', 'lawful good', 'neutral good', 'any alignment', 'unaligned']
                if name.lower() in rejected_names or len(name) < 3 or len(name) > 60 or "CHAPTER" in name.upper():
                    continue

                # Clean header junk/crumbs from names (e.g., page footers/sidebars 'I BESTIARY \nDEATHLOCK' or tickmarks)
                name = re.sub(r'^[IJK\s’\']+\s*BEST[A-Z]+Y\s*\n', '', name, flags=re.IGNORECASE)
                name = re.sub(r'^[\s’\'\.\n\-]+', '', name)
                name = name.strip()
                if not name or name.upper() in ['I BESTIARY', 'J BESTI ARY', 'I BESTJARY']:
                    continue

                ac_str = match.group(2).strip()
                hp_str = match.group(3).strip()
                speed = match.group(4).strip()

                # Try parsing out numeric AC & HP
                ac_num = int(re.search(r'\d+', ac_str).group(0)) if re.search(r'\d+', ac_str) else 10
                hp_num = int(re.search(r'\d+', hp_str).group(0)) if re.search(r'\d+', hp_str) else 30

                # Read remaining text block for stats and actions
                start_body_pos = match.end()
                end_body_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
                body = cleaned[start_body_pos:end_body_pos].strip()

                # Look for STR, DEX, CON, INT, WIS, CHA matrix
                # Often formatted like: "18 (+4) 14 (+2) 16 (+3) 10 (+0) 12 (+1) 8 (-1)"
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

                # Parse Senses, Languages, Challenge
                cr = "1"
                cr_match = re.search(r"Challenge\s*(\d+(?:/\d+)?)", body, re.IGNORECASE)
                if cr_match:
                    cr = cr_match.group(1)

                # Collect Actions
                actions = []
                actions_section = re.search(r"ACTIONS\n(.+)", body, re.IGNORECASE | re.DOTALL)
                if actions_section:
                    action_text = actions_section.group(1).strip()
                    # Match action blocks (Name followed by description)
                    action_matches = re.findall(r"([A-Z][A-Za-z\s]+)\.\s*(.+?)(?=\n[A-Z][A-Za-z\s]+\.|$)", action_text, re.DOTALL)
                    for act_name, act_desc in action_matches:
                        actions.append({
                            "name": act_name.strip(),
                            "desc": re.sub(r'\s+', ' ', act_desc.strip())
                        })

                # Build draft JSON
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
                    "raw_extracted": body[:1000] # for review comparisons
                }

                slug = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
                file_name = f"data/drafts/monsters/{slug}.json"

                with open(file_name, "w", encoding="utf-8") as f:
                    json.dump(monster_data, f, indent=2)

                extracted_monsters_count += 1
                print(f" [+] Extracted Monster: {name} -> {file_name}")

            except Exception as e:
                print(f" [!] Error parsing monster match: {e}")

    print(f"[*] Completed! Extracted {extracted_monsters_count} monsters to data/drafts/monsters/")


def parse_magic_items(pdf_path, pages=None):
    """
    Parses Magic Items from PDF.
    Format:
    [Item Name]
    [Wondrous item / Weapon / Armor], [rarity] (requires attunement)
    [Description]
    """
    print(f"[*] Parsing magic items from: {pdf_path} (Pages: {pages or 'All'})")
    doc = fitz.open(pdf_path)
    
    page_indices = range(len(doc))
    if pages:
        if '-' in pages:
            start, end = map(int, pages.split('-'))
            page_indices = range(start - 1, end)
        else:
            page_indices = [int(p) - 1 for p in pages.split(',')]

    extracted_items_count = 0

    for p_idx in page_indices:
        if p_idx < 0 or p_idx >= len(doc):
            continue
        
        page = doc[p_idx]
        text = page.get_text("text")
        cleaned = clean_text(text)

        # Match patterns like: "Wondrous item, rare (requires attunement)"
        pattern = r"([A-Za-z\s'\-]+)\n([A-Za-z\s]+,\s+(?:common|uncommon|rare|very rare|legendary).*?)\n"
        
        matches = list(re.finditer(pattern, cleaned, re.IGNORECASE))
        for idx, match in enumerate(matches):
            try:
                name = match.group(1).strip()
                if len(name) < 3 or len(name) > 40 or name.isupper() or "CHAPTER" in name.upper():
                    continue

                type_rarity = match.group(2).strip()

                # Get description text
                start_body_pos = match.end()
                end_body_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
                body = cleaned[start_body_pos:end_body_pos].strip()

                item_data = {
                    "name": name,
                    "type_rarity": type_rarity,
                    "description": body,
                    "price_gp": 500  # Default to review/edit
                }

                slug = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
                file_name = f"data/drafts/magic_items/{slug}.json"

                with open(file_name, "w", encoding="utf-8") as f:
                    json.dump(item_data, f, indent=2)

                extracted_items_count += 1
                print(f" [+] Extracted Magic Item: {name} -> {file_name}")

            except Exception as e:
                print(f" [!] Error parsing magic item match: {e}")

    print(f"[*] Completed! Extracted {extracted_items_count} magic items to data/drafts/magic_items/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="D&D 5e PDF Scraper CLI")
    parser.add_argument("--file", required=True, help="Path to PDF book file")
    parser.add_argument("--type", required=True, choices=["spells", "monsters", "magic_items", "all"], help="Extracted category type")
    parser.add_argument("--pages", help="Target pages range (e.g., '12-45' or list '12,14,16')")

    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"[!] File not found: {args.file}")
        exit(1)

    if args.type == "spells" or args.type == "all":
        parse_spells(args.file, args.pages)
    if args.type == "monsters" or args.type == "all":
        parse_monsters(args.file, args.pages)
    if args.type == "magic_items" or args.type == "all":
        parse_magic_items(args.file, args.pages)
