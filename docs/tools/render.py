import sys, pathlib
from playwright.sync_api import sync_playwright
src, out, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
code = pathlib.Path(src).read_text(encoding="utf8")
html = f"""<!doctype html><html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>body{{margin:0;background:#fff;font-family:Arial}} #d{{padding:24px;display:inline-block}}</style></head>
<body><div id="d"><pre class="mermaid">{code}</pre></div>
<script>mermaid.initialize({{startOnLoad:false, theme:'default', themeVariables:{{fontSize:'18px'}}, er:{{layoutDirection:'TB', useMaxWidth:false, fontSize:16}}, flowchart:{{htmlLabels:true, useMaxWidth:false}}}});
mermaid.run().then(()=>document.body.setAttribute('data-done','1'));</script></body></html>"""
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="msedge"); p = b.new_page(viewport={"width": width, "height": 800}, device_scale_factor=2)
    p.set_content(html); p.wait_for_selector("body[data-done='1']", timeout=60000)
    p.locator("#d svg").screenshot(path=out); b.close(); print("rendered", out)
