"""Builds demo/semilla-glance-demo.mp4: intro card + captioned simulator recording + outro card."""
import json, subprocess, textwrap
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 800
GREEN, DIM, BG = (47, 209, 107), (150, 200, 160), (8, 12, 9)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def card(path, title, lines, size=30):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((80, 90), title, font=ImageFont.truetype(BOLD, 56), fill=GREEN)
    y = 200
    for ln in lines:
        style = BOLD if ln.startswith('#') else FONT
        ln = ln.lstrip('# ')
        for part in textwrap.wrap(ln, 62) or ['']:
            d.text((80, y), part, font=ImageFont.truetype(style, size), fill=GREEN if style == BOLD else DIM)
            y += size + 12
        y += 6
    d.text((80, H - 70), 'Semilla1 Lab · Heads Up: Even Realities Hackathon 2026', font=ImageFont.truetype(FONT, 22), fill=(90, 130, 100))
    im.save(path)

card('demo/raw/intro.png', 'Semilla Glance', [
    '# Telegram on Even Realities G2',
    'Read new messages from the chats you choose at a glance.',
    'Reply with one tap on an AI draft, or by voice.',
    'Every send needs one confirming tap.',
    '',
    'Track: Messaging & News (Telegram) + Best Telegram integration',
])
card('demo/raw/outro.png', 'How it works', [
    '# G2 WebView (Even Hub SDK 0.0.16) -> Semilla Glance backend',
    'Backend talks to the Telegram Bot API, any OpenAI-compatible LLM (OpenRouter / Claude / local) and Whisper-compatible STT. Keys never ship in the app.',
    '# Safety',
    'Allow-listed chats only · pairing code · one-tap confirm with single-use send tokens · threaded replies.',
    '# This recording',
    'Official Even Hub simulator v0.9.5. Telegram = local mock of the Bot API (same JSON). Drafts = offline fallback; voice = demo transcript (no STT key on the recording box).',
], size=26)

marks = json.load(open('demo/raw/marks.json'))['marks']
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'demo/raw/screen.mp4']).decode())
def ts(t):
    t = max(t, 0); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f'{h}:{m:02d}:{s:05.2f}'
ass = ['[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {W}', f'PlayResY: {H}', '',
       '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV',
       'Style: Cap,DejaVu Sans,30,&H006BD12F,&H00000000,&HC0000000,1,0,3,10,0,1,560,40,120', '',
       '[Events]', 'Format: Layer, Start, End, Style, Text']
for i, mk in enumerate(marks):
    end = marks[i + 1]['t'] if i + 1 < len(marks) else dur
    text = '\\N'.join(textwrap.wrap(mk['text'], 36))
    ass.append(f'Dialogue: 0,{ts(mk["t"])},{ts(end)},Cap,{text}')
open('demo/raw/captions.ass', 'w').write('\n'.join(ass) + '\n')

run = lambda *a: subprocess.run(list(a), check=True)
run('ffmpeg', '-loglevel', 'error', '-y', '-loop', '1', '-t', '5', '-i', 'demo/raw/intro.png', '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'demo/raw/intro.mp4')
run('ffmpeg', '-loglevel', 'error', '-y', '-loop', '1', '-t', '9', '-i', 'demo/raw/outro.png', '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'demo/raw/outro.mp4')
run('ffmpeg', '-loglevel', 'error', '-y', '-i', 'demo/raw/screen.mp4', '-vf', 'ass=demo/raw/captions.ass', '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'demo/raw/body.mp4')
open('demo/raw/list.txt', 'w').write("file 'intro.mp4'\nfile 'body.mp4'\nfile 'outro.mp4'\n")
run('ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'demo/raw/list.txt', '-c', 'copy', '-movflags', '+faststart', 'demo/semilla-glance-demo.mp4')
print('ok', dur + 14)
