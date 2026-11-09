"""Print one JSON line per Claude Code conversation on this computer.

Reads ~/.claude/projects/*/*.jsonl line by line (some are tens of MB), keeping
only what the board's second-brain pane needs: title, dates, a few of the
person's own messages, and which tools were used. Nothing is written anywhere.
"""

import json
import os
import re
import sys
import glob

ROOT = os.path.expanduser("~/.claude/projects")
MAX_LINE = 6_000_000
SAMPLE_CHARS = 220
FIRST_CHARS = 600

TAG = re.compile(r"<(system-reminder|command-[a-z-]+|local-command-[a-z-]+)>.*?</\1>", re.S)
PASTE = re.compile(r"</?pasted_content[^>]*>")


def user_text(rec):
    if rec.get("isMeta") or rec.get("isSidechain"):
        return None
    content = (rec.get("message") or {}).get("content")
    parts = []
    if isinstance(content, str):
        parts.append(content)
    elif isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text") or "")
            elif isinstance(block, dict) and block.get("type") == "tool_result":
                return None
    text = PASTE.sub("", TAG.sub("", "\n".join(parts))).strip()
    if not text or text.startswith("<") or text.startswith("Caveat:"):
        return None
    return re.sub(r"\s+", " ", text)


def scan(path):
    title = agent_name = None
    texts = []
    tools = set()
    first_at = last_at = None
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if len(line) > MAX_LINE and '"custom-title"' not in line:
                continue
            head = line[:4000]
            if not any(k in head for k in ('"type":"user"', '"type":"assistant"', '"custom-title"', '"agent-name"', '"tools-used"')):
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            kind = rec.get("type")
            stamp = rec.get("timestamp")
            if stamp:
                first_at = first_at or stamp
                last_at = stamp
            if kind == "custom-title":
                title = rec.get("customTitle") or title
            elif kind == "agent-name":
                agent_name = rec.get("agentName") or agent_name
            elif kind == "tools-used":
                tools.update(rec.get("tools") or [])
            elif kind == "assistant":
                for block in (rec.get("message") or {}).get("content") or []:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        tools.add(block.get("name") or "")
            elif kind == "user":
                t = user_text(rec)
                if t:
                    texts.append(t)
    if not texts:
        return None
    step = max(1, len(texts) // 6)
    samples = [t[:SAMPLE_CHARS] for t in texts[1::step]][:6]
    stat = os.stat(path)
    return {
        "id": os.path.basename(path)[:-6],
        "title": title or agent_name or texts[0][:40],
        "first": texts[0][:FIRST_CHARS],
        "samples": samples,
        "userMsgs": len(texts),
        "tools": sorted(t for t in tools if t),
        "startedAt": first_at,
        "lastAt": last_at,
        "mtimeMs": int(stat.st_mtime * 1000),
        "size": stat.st_size,
    }


def main():
    paths = sorted(glob.glob(os.path.join(ROOT, "*", "*.jsonl")), key=os.path.getmtime, reverse=True)
    for path in paths:
        try:
            row = scan(path)
        except OSError:
            continue
        if row:
            sys.stdout.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
