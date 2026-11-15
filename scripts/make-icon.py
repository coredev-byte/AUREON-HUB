# Gera os ícones a partir do logo enviado (marca "A" branca e azul sobre preto).
# Uso: python3 scripts/make-icon.py caminho/do/logo.png
import sys
from PIL import Image, ImageDraw
src = Image.open(sys.argv[1]).convert("RGB")
mark = src.crop((180, 196, 580, 524))  # a marca "A" (sem o texto)
# preto vira transparente: alfa = canal mais claro, cor "despremultiplicada"
w, h = mark.size
out = Image.new("RGBA", (w, h))
px, po = mark.load(), out.load()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        a = max(r, g, b)
        if a < 8: po[x, y] = (0, 0, 0, 0); continue
        po[x, y] = (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a)
bbox = out.getbbox(); out = out.crop(bbox)
out.save("public/mark.png")
# ícone do app: quadrado arredondado grafite com a marca
S = 512
icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(icon)
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=112, fill=(14, 14, 16, 255))
m = out.copy(); m.thumbnail((int(S * 0.68), int(S * 0.68)), Image.LANCZOS)
icon.alpha_composite(m, ((S - m.width) // 2, (S - m.height) // 2 + 8))
icon.save("build/icon.png")
icon.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("ok", out.size)
