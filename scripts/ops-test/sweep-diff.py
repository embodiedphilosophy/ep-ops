# Compare two sets of screenshots from sweep-shots.cjs: prints the share of changed pixels per page. Usage: python3 sweep-diff.py <dir> before after
import sys, glob, os
from PIL import Image, ImageChops
d, a, b = sys.argv[1:4]
bad = 0
for fa in sorted(glob.glob(f"{d}/{a}-*.png")):
    fb = fa.replace(f"/{a}-", f"/{b}-")
    name = os.path.basename(fa)[len(a) + 1:-4]
    if not os.path.exists(fb): print("MISSING", name); bad += 1; continue
    A, B = Image.open(fa).convert("RGB"), Image.open(fb).convert("RGB")
    if A.size != B.size: print("SIZE", name, A.size, B.size); bad += 1; continue
    diff = ImageChops.difference(A, B).getbbox()
    if diff is None: print("same", name); continue
    n = sum(1 for p in ImageChops.difference(A, B).convert("L").tobytes() if p > 8)
    print("DIFF", name, f"{100 * n / (A.size[0] * A.size[1]):.3f}% of pixels", diff); bad += 1
sys.exit(1 if bad else 0)
