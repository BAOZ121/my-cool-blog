import os
import re
import glob
import markdown
import weasyprint
import yaml

# 1. 目录配置
CONTENT_DIR = "content"
OUTPUT_DIR = os.path.join("static", "pdf")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 2. 精美 PDF HTML 样式模板
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
    @page {{
        size: A4;
        margin: 18mm 15mm;
        background-color: #f8fafc;
        @bottom-right {{ content: "Page " counter(page) " of " counter(pages); font-size: 8.5pt; color: #64748b; }}
        @bottom-left {{ content: "DEX Business Research | thedexs.com"; font-size: 8.5pt; color: #64748b; }}
    }}
    body {{
        font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
        color: #1e293b;
        line-height: 1.6;
        font-size: 10pt;
    }}
    .header {{
        background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
        color: #ffffff;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
    }}
    .header h1 {{ margin: 0 0 8px 0; font-size: 18pt; line-height: 1.3; }}
    .header .meta {{ font-size: 9pt; color: #93c5fd; }}
    .content {{ background: #ffffff; padding: 22px; border-radius: 6px; border: 1px solid #e2e8f0; }}
    h1, h2, h3 {{ color: #0f172a; page-break-after: avoid; }}
    h2 {{ border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px; }}
    blockquote {{ border-left: 4px solid #2563eb; margin: 0; padding-left: 12px; color: #475569; }}
    table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
    th, td {{ border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 9pt; text-align: left; }}
    th {{ background: #0f172a; color: white; }}
</style>
</head>
<body>
<div class="header">
    <h1>{title}</h1>
    <div class="meta">作者：DEX | 日期：{date} | 网站：thedexs.com</div>
</div>
<div class="content">
    {body}
</div>
</body>
</html>
"""

def parse_markdown_file(filepath):
    """解析 Hugo Markdown 文件（提取 Front Matter 与正文）"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    yaml_pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
    match = re.search(yaml_pattern, content, re.DOTALL)
    
    if match:
        meta_text, body_md = match.group(1), match.group(2)
        try:
            meta = yaml.safe_load(meta_text) or {}
        except Exception:
            meta = {}
    else:
        meta = {}
        body_md = content

    title = meta.get('title', '商业研报')
    date = str(meta.get('date', '2026'))[:10]
    slug = meta.get('slug', os.path.splitext(os.path.basename(filepath))[0])
    
    body_html = markdown.markdown(body_md, extensions=['tables', 'fenced_code', 'toc'])
    return title, date, slug, body_html

def main():
    md_files = glob.glob(os.path.join(CONTENT_DIR, "**", "*.md"), recursive=True)
    
    for filepath in md_files:
        if os.path.basename(filepath).startswith("_index"):
            continue
            
        title, date, slug, body_html = parse_markdown_file(filepath)
        full_html = HTML_TEMPLATE.format(title=title, date=date, body=body_html)
        
        output_pdf_name = f"{slug}.pdf"
        output_pdf_path = os.path.join(OUTPUT_DIR, output_pdf_name)
        
        print(f"📄 正在生成 PDF: {output_pdf_name} ...")
        try:
            weasyprint.HTML(string=full_html).write_pdf(output_pdf_path)
            print(f"  └─ SUCCESS: {output_pdf_path}")
        except Exception as e:
            print(f"  └─ ERROR: {e}")

if __name__ == "__main__":
    main()