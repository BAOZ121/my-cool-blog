import os
from PIL import Image

# 压缩设置
QUALITY = 80       # 80% 画质（肉眼无损，体积大减）
MAX_WIDTH = 1200   # 封面最大宽度
TARGET_DIR = "content"

print("开始扫描并压缩 content 目录下的封面图...")

for root, _, files in os.walk(TARGET_DIR):
    for file in files:
        # 扫描各种常见格式的封面图片
        if file.lower().startswith("cover.") and file.lower().endswith(('.jpg', '.jpeg', '.png')):
            filepath = os.path.join(root, file)
            orig_size = os.path.getsize(filepath) / 1024
            
            with Image.open(filepath) as img:
                # 转换 Alpha 通道以保存为 JPEG
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                
                # 超出 1200px 宽度等比缩放
                if img.width > MAX_WIDTH:
                    height = int((MAX_WIDTH / float(img.width)) * img.height)
                    img = img.resize((MAX_WIDTH, height), Image.Resampling.LANCZOS)
                
                # 按 80% 质量压缩保存
                img.save(filepath, 'JPEG', quality=QUALITY, optimize=True)
                
            new_size = os.path.getsize(filepath) / 1024
            saved = orig_size - new_size
            print(f"✓ 已压缩: {filepath} | {orig_size:.1f}KB -> {new_size:.1f}KB (节省 {saved:.1f}KB)")

print("压缩完成！")