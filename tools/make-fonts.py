# Zen Maru Gothic（SIL Open Font License）から、アプリで使う文字だけを残した woff2 を fonts/ に作る（metabo-burst の make-fonts.py と同じやり方）
# 使い方：python3 tools/make-fonts.py <元の TTF があるフォルダ>   （fonttools と brotli が必要：pip install fonttools brotli）
#         python3 tools/make-fonts.py --check   同梱のフォントに、画面で使う字が全部入っているかだけを見る（CI。足りなければ終了コード1）
# 元のフォント：https://github.com/google/fonts/tree/main/ofl/zenmarugothic（ZenMaruGothic-Regular.ttf・ZenMaruGothic-Bold.ttf）
# 本文（Regular）は、2人が書く文にも使うので、画面の文字に加えて JIS 第1・第2水準の漢字まで入れる。太字は画面の見出し・ボタンにだけ使うので、画面の文字だけ
import sys, os, glob
from fontTools import subset
src = sys.argv[1]
ui = set()
for pat in ['index.html', 'style.css', 'js/*.js']:
    for f in glob.glob(pat):
        ui |= set(open(f, encoding='utf-8').read())
ui |= {chr(c) for c in range(0x20, 0x7F)}       # 英数字・記号
ui |= {chr(c) for c in range(0x3000, 0x3100)}   # 句読点・ひらがな・カタカナ
ui |= {chr(c) for c in range(0xFF01, 0xFF5F)}   # 全角英数字・記号
body = set(ui)
for hi in range(0x81, 0xF0):                    # Shift_JIS で表せる字（JIS X 0208：第1・第2水準の漢字と記号）
    for lo in range(0x40, 0xFD):
        try: body |= set(bytes([hi, lo]).decode('shift_jis'))
        except UnicodeDecodeError: pass
fonts = {'ZenMaruGothic-Regular.ttf': ('zen-maru-gothic-400.woff2', body), 'ZenMaruGothic-Bold.ttf': ('zen-maru-gothic-700.woff2', ui)}
if src == '--check':
    from fontTools.ttLib import TTFont
    bad = 0
    for out, chars in fonts.values():
        cmap = TTFont(os.path.join('fonts', out)).getBestCmap()
        miss = sorted(c for c in chars if c >= ' ' and ord(c) not in cmap and ord(c) < 0xE000 and not c.isspace())
        skip = set(open('fonts/not-in-font.txt', encoding='utf-8').read()) if os.path.exists('fonts/not-in-font.txt') else set()
        miss = [c for c in miss if c not in skip]  # 元のフォントにもともと無い字（作ったときに not-in-font.txt に書いたもの）は数えない
        if miss: bad = 1; print(f'{out} に無い字：{"".join(miss)}')
    print('フォントの字：足りない字があります。npm run fonts で作り直してください' if bad else 'フォントの字：問題なし')
    sys.exit(bad)
os.makedirs('fonts', exist_ok=True)
absent = set()
for ttf, (out, chars) in fonts.items():
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']
    f = subset.load_font(os.path.join(src, ttf), opts)
    absent |= {c for c in chars if c >= ' ' and ord(c) not in f.getBestCmap()}
    s = subset.Subsetter(opts); s.populate(text=''.join(sorted(c for c in chars if c >= ' '))); s.subset(f)
    subset.save_font(f, os.path.join('fonts', out), opts)
    print(out, os.path.getsize(os.path.join('fonts', out)) // 1024, 'KB', len(chars), 'chars')
open('fonts/not-in-font.txt', 'w', encoding='utf-8').write(''.join(sorted(absent)))
print(len(absent), 'chars not in the source font (fonts/not-in-font.txt)')
