import os
from PIL import Image, ImageDraw, ImageFont

font_bold = 'C:/Windows/Fonts/msjhbd.ttc'
font_reg = 'C:/Windows/Fonts/msjh.ttc'

def get_font(size, bold=True):
    return ImageFont.truetype(font_bold if bold else font_reg, size)

def draw_centered_text(draw, box, text, font, fill):
    x1, y1, x2, y2 = box
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = x1 + (x2 - x1 - tw) // 2
    ty = y1 + (y2 - y1 - th) // 2
    draw.text((tx, ty), text, font=font, fill=fill)

# ==============================================================================
# 1. GAS LEAK SOP
# ==============================================================================
def process_gas_leak():
    img_path = 'c:/Gass/website/images/gas-leak-sop.jpg'
    backup = 'c:/Gass/website/images/gas-leak-sop.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top title: covers x=[240, 1136], y=[50, 140]
    draw.rounded_rectangle([240, 50, 1136, 140], radius=20, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=3)
    draw.rounded_rectangle([248, 58, 1128, 132], radius=16, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [248, 58, 1128, 132], "盛隆瓦斯・瓦斯漏氣緊急應變 4 步驟 SOP", get_font(34), (255, 255, 255, 255))

    # Step 1
    draw.rounded_rectangle([75, 528, 365, 614], radius=16, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [75, 528, 365, 614], "順時針關閉桶閥開關", get_font(22), (255, 255, 255, 255))
    draw.rectangle([65, 624, 375, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [65, 624, 375, 685], "① 順時針緊閉鋼瓶角閥", get_font(18), (30, 41, 59, 255))

    # Step 2
    draw.rounded_rectangle([390, 528, 680, 614], radius=16, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [390, 528, 680, 614], "輕輕推開窗戶自然通風", get_font(22), (255, 255, 255, 255))
    draw.rectangle([380, 624, 690, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [380, 624, 690, 685], "② 輕推開窗，瓦斯比空氣重", get_font(18), (30, 41, 59, 255))

    # Step 3
    draw.rounded_rectangle([705, 528, 995, 614], radius=16, fill=(220, 38, 38, 255))
    draw_centered_text(draw, [705, 528, 995, 614], "嚴禁開關任何電器", get_font(22), (255, 255, 255, 255))
    draw.rectangle([695, 624, 1005, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [695, 624, 1005, 685], "③ 禁開電燈電扇防電弧引爆", get_font(18), (30, 41, 59, 255))

    # Step 4: cover 911 on phone screen
    draw.rectangle([1202, 408, 1275, 458], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [1202, 408, 1275, 458], "盛隆", get_font(20), (220, 38, 38, 255))

    draw.rounded_rectangle([1020, 528, 1310, 614], radius=16, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [1020, 528, 1310, 614], "疏散室外撥打電話求助", get_font(22), (255, 255, 255, 255))
    draw.rectangle([1010, 624, 1320, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [1010, 624, 1320, 685], "④ 致電盛隆 02-2972-5559", get_font(18), (30, 41, 59, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("1. Gas leak SOP OK")

# ==============================================================================
# 2. CYLINDER SIZES COMPARISON
# ==============================================================================
def process_cylinder_sizes():
    img_path = 'c:/Gass/website/images/cylinder-sizes-comparison.jpg'
    backup = 'c:/Gass/website/images/cylinder-sizes-comparison.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Title: covers "STANDARD TAIWANESE LPG GAS CYLINDER COMPARISON" x=[25, 660], y=[30, 150]
    draw.rounded_rectangle([25, 30, 660, 145], radius=16, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=3)
    draw.rounded_rectangle([33, 38, 652, 137], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [33, 38, 652, 85], "台灣標準瓦斯鋼瓶各規格尺寸", get_font(26), (255, 255, 255, 255))
    draw_centered_text(draw, [33, 85, 652, 132], "全台家用與商用規格全覽對照圖", get_font(20), (255, 255, 255, 255))

    # 1) 4kg card:
    # Header: x=[105, 295], y=[200, 260]
    draw.rounded_rectangle([105, 200, 295, 260], radius=10, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [105, 200, 295, 260], "1) 4 公斤", get_font(20), (255, 255, 255, 255))
    # Body: x=[80, 280], y=[260, 420]
    draw.rectangle([80, 260, 280, 420], fill=(249, 249, 249, 255))
    draw_centered_text(draw, [80, 265, 280, 295], "4 公斤 輕便裝", get_font(16, True), (37, 99, 235, 255))
    draw_centered_text(draw, [80, 300, 280, 330], "露營休閒 / 泡茶小爐", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [80, 335, 280, 365], "體積小巧好收納", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [80, 370, 280, 400], "單身極低用量推薦", get_font(11, False), (100, 116, 139, 255))

    # 2) 10kg card:
    # Header: x=[350, 530], y=[168, 228]
    draw.rounded_rectangle([350, 168, 530, 228], radius=10, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [350, 168, 530, 228], "2) 10 公斤", get_font(20), (255, 255, 255, 255))
    # Body: x=[330, 530], y=[230, 390]
    draw.rectangle([330, 230, 530, 390], fill=(249, 249, 249, 255))
    draw_centered_text(draw, [330, 235, 530, 265], "10 公斤 小家庭", get_font(16, True), (37, 99, 235, 255))
    draw_centered_text(draw, [330, 270, 530, 300], "1~2 人租屋小家庭", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [330, 305, 530, 335], "窄小流理台矮櫃首選", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [330, 340, 530, 370], "公寓陽台矮空間推薦", get_font(11, False), (100, 116, 139, 255))

    # 3) 16kg card:
    # Header: x=[595, 765], y=[40, 195]
    draw.rounded_rectangle([595, 40, 765, 195], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [595, 45, 765, 85], "★ 最熱門首選", get_font(14, True), (254, 240, 138, 255))
    draw_centered_text(draw, [595, 85, 765, 140], "3) 16 公斤", get_font(22), (255, 255, 255, 255))
    draw_centered_text(draw, [595, 140, 765, 190], "標準家用主力規格", get_font(14, False), (224, 242, 254, 255))
    # Body: x=[570, 770], y=[200, 360]
    draw.rectangle([570, 200, 770, 360], fill=(249, 249, 249, 255))
    draw_centered_text(draw, [570, 205, 770, 235], "16 公斤 標準家庭", get_font(16, True), (37, 99, 235, 255))
    draw_centered_text(draw, [570, 240, 770, 270], "1~3人標準家庭常備", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [570, 275, 770, 305], "熱水器與廚房雙核心", get_font(12, False), (37, 99, 235, 255))
    draw_centered_text(draw, [570, 310, 770, 340], "多數公寓陽台首選尺寸", get_font(11, False), (71, 85, 105, 255))

    # 4) 20kg card:
    # Header: x=[845, 1030], y=[118, 178]
    draw.rounded_rectangle([845, 118, 1030, 178], radius=10, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [845, 118, 1030, 178], "4) 20 公斤", get_font(20), (255, 255, 255, 255))
    # Body: x=[830, 1030], y=[180, 340]
    draw.rectangle([830, 180, 1030, 340], fill=(249, 249, 249, 255))
    draw_centered_text(draw, [830, 185, 1030, 215], "20 公斤 大家庭/商用", get_font(16, True), (37, 99, 235, 255))
    draw_centered_text(draw, [830, 220, 1030, 250], "大家庭 / 小吃店必備", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [830, 255, 1030, 285], "快速爐大火快炒大容量", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [830, 290, 1030, 320], "營業熱炒長效供氣首選", get_font(11, False), (100, 116, 139, 255))

    # 5) 50kg card:
    # Header: x=[1090, 1325], y=[20, 95]
    draw.rounded_rectangle([1090, 20, 1325, 95], radius=10, fill=(15, 23, 42, 255))
    draw_centered_text(draw, [1090, 20, 1325, 95], "5) 50 公斤 工業/大戶", get_font(18), (255, 255, 255, 255))
    # Body: x=[1080, 1330], y=[98, 260]
    draw.rectangle([1080, 98, 1330, 260], fill=(249, 249, 249, 255))
    draw_centered_text(draw, [1080, 105, 1330, 135], "50 公斤 工業營業級", get_font(16, True), (5, 150, 105, 255))
    draw_centered_text(draw, [1080, 140, 1330, 170], "大型中央廚房 / 餐廳", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [1080, 175, 1330, 205], "集合式管線並聯系統", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [1080, 210, 1330, 240], "大量供氣需場勘安裝", get_font(11, False), (220, 38, 38, 255))

    # Bottom Comparison Table (Cover completely from y: 520 to 768)
    draw.rectangle([0, 520, 1376, 768], fill=(248, 250, 252, 255))
    draw.line([(0, 520), (1376, 520)], fill=(226, 232, 240, 255), width=2)

    # Headers column (x: 10 to 110)
    draw.rounded_rectangle([10, 535, 105, 570], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [10, 535, 105, 570], "規格容量", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([10, 580, 105, 615], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [10, 580, 105, 615], "鋼瓶高度", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([10, 625, 105, 660], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [10, 625, 105, 660], "鋼瓶直徑", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([10, 670, 105, 705], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [10, 670, 105, 705], "適用情境", get_font(14), (51, 65, 85, 255))

    cols = [
        (200, "4 公斤", "高約 42 cm", "直徑約 25 cm", "露營休閒 / 泡茶小爐 / 單身獨居"),
        (445, "10 公斤", "高約 55 cm", "直徑約 30 cm", "1~2人小家庭 / 流理台矮櫃空間"),
        (690, "16 公斤★首選", "高約 68 cm", "直徑約 31 cm", "1~3人標準家庭 / 熱水器日常主力"),
        (935, "20 公斤", "高約 75 cm", "直徑約 31 cm", "高用量家庭 / 餐廳小吃 / 快速爐"),
        (1180, "50 公斤", "高約 125 cm", "直徑約 37 cm", "連鎖餐飲大戶 / 中央廚房 / 工廠供氣")
    ]
    for cx, c_cap, c_h, c_w, c_desc in cols:
        is_star = "★" in c_cap
        card_fill = (239, 246, 255, 255) if is_star else (255, 255, 255, 255)
        border_col = (37, 99, 235, 255) if is_star else (226, 232, 240, 255)
        draw.rounded_rectangle([cx - 105, 530, cx + 105, 715], radius=10, fill=card_fill, outline=border_col, width=2 if is_star else 1)

        draw_centered_text(draw, [cx - 100, 535, cx + 100, 570], c_cap, get_font(17, True), (37, 99, 235, 255) if is_star else (15, 23, 42, 255))
        draw_centered_text(draw, [cx - 100, 580, cx + 100, 615], c_h, get_font(15, True), (5, 150, 105, 255))
        draw_centered_text(draw, [cx - 100, 625, cx + 100, 660], c_w, get_font(13, False), (71, 85, 105, 255))
        draw_centered_text(draw, [cx - 102, 670, cx + 102, 705], c_desc, get_font(10, False), (51, 65, 85, 255))

    # Bottom notice banner
    draw.rectangle([0, 725, 1376, 768], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [0, 725, 1376, 768], "盛隆瓦斯全規格鋼瓶均合格檢驗附鋁牌 ｜ 尺寸不確定？拍照傳 LINE: @350MZOGG 專人協助 ｜ 門市電話 02-2972-5559", get_font(13), (71, 85, 105, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("2. Cylinder sizes OK")

# ==============================================================================
# 3. HEATER TROUBLESHOOTING
# ==============================================================================
def process_heater():
    img_path = 'c:/Gass/website/images/heater-troubleshoot.jpg'
    backup = 'c:/Gass/website/images/heater-troubleshoot.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Banner: covers x=[0, 1376], y=[0, 80]
    draw.rectangle([0, 0, 1376, 80], fill=(255, 255, 255, 255))
    draw.rounded_rectangle([25, 10, 880, 72], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [25, 10, 880, 72], "瓦斯熱水器點不著・洗澡沒熱水 5 步排查圖解", get_font(26), (255, 255, 255, 255))

    draw.rounded_rectangle([900, 10, 1346, 72], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw_centered_text(draw, [900, 10, 1346, 72], "盛隆居家安全自我排查 5 步驟", get_font(20), (30, 41, 59, 255))

    # Step 1: covers x=[115, 410], y=[115, 250]
    draw.rectangle([115, 115, 410, 250], fill=(239, 246, 255, 255))
    draw.text((120, 122), "步驟 1：確認是否有瓦斯", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((120, 155), "檢查瓦斯桶氣量與角閥開關", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((120, 185), "若無瓦斯請立即預約換桶", font=get_font(13, False), fill=(37, 99, 235, 255))
    draw.text((120, 215), "盛隆專線 02-2972-5559", font=get_font(13, False), fill=(5, 150, 105, 255))

    # Cover "pressure gauge (e.g.)" text: x=[100, 310], y=[245, 315]
    draw.rectangle([100, 245, 310, 315], fill=(220, 233, 241, 255))
    draw.text((105, 255), "殘量壓力錶", font=get_font(15), fill=(51, 65, 85, 255))
    draw.text((105, 285), "指針落於紅區表示氣盡", font=get_font(12, False), fill=(220, 38, 38, 255))

    # Cover "LPG" [95, 395, 155, 435] & Gauge "Low" [230, 355, 275, 380]
    draw.rectangle([95, 395, 155, 435], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [95, 395, 155, 435], "瓦斯", get_font(14), (51, 65, 85, 255))
    draw.rectangle([230, 355, 275, 380], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [230, 355, 275, 380], "殘量", get_font(10), (220, 38, 38, 255))

    # Step 2: covers x=[115, 420], y=[430, 565]
    draw.rectangle([115, 430, 420, 565], fill=(239, 246, 255, 255))
    draw.text((120, 440), "步驟 2：更換全新 1 號電池", font=get_font(19), fill=(15, 23, 42, 255))
    draw.text((120, 475), "取出熱水器底座電池盒更換", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((120, 505), "推薦使用全新大電量鹼性電池", font=get_font(13, False), fill=(37, 99, 235, 255))
    draw.text((120, 532), "注意正負極方向安裝正確", font=get_font(12, False), fill=(5, 150, 105, 255))

    # Cover "Replace D-cell battery & new D-cell (box." text: x=[80, 320], y=[650, 685]
    draw.rectangle([80, 650, 320, 685], fill=(227, 241, 242, 255))

    # Step 3: covers x=[1020, 1340], y=[110, 230]
    draw.rectangle([1020, 110, 1340, 230], fill=(239, 246, 255, 255))
    draw.text((1030, 120), "步驟 3：確認瓦斯開關開啟", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((1030, 155), "確認管路凡而把手平行暢通", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((1030, 185), "角閥旋鈕逆時針完全開啟", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Step 4: covers x=[1020, 1340], y=[395, 550]
    draw.rectangle([1020, 395, 1340, 550], fill=(239, 246, 255, 255))
    draw.text((1030, 405), "步驟 4：確認水壓水量足夠", font=get_font(19), fill=(15, 23, 42, 255))
    draw.text((1030, 442), "水流過小微動開關無法啟動點火", font=get_font(13, False), fill=(71, 85, 105, 255))
    draw.text((1030, 475), "調大進水量或清除龍頭出水孔水垢", font=get_font(12, False), fill=(37, 99, 235, 255))
    draw.text((1030, 508), "確保熱水蓮蓬頭出水順暢飽滿", font=get_font(12, False), fill=(5, 150, 105, 255))

    # Step 5: covers x=[1020, 1340], y=[660, 765]
    draw.rectangle([1020, 660, 1340, 765], fill=(239, 246, 255, 255))
    draw.text((1030, 668), "步驟 5：檢查清洗進水濾網", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((1030, 702), "旋開熱水器冷水進水口濾網", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((1030, 732), "清除沉積之泥沙鐵鏽與雜質", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Cover "Unscrew" & "Rinse water" text: x=[760, 880], y=[660, 735]
    draw.rectangle([760, 660, 880, 735], fill=(227, 241, 242, 255))
    draw.text((765, 675), "旋開濾網", font=get_font(13), fill=(15, 23, 42, 255))
    draw.text((765, 705), "清水沖洗", font=get_font(13), fill=(5, 150, 105, 255))

    # Bottom Phone Box: x=[380, 850], y=[700, 760]
    draw.rounded_rectangle([380, 700, 850, 760], radius=12, fill=(254, 242, 242, 255), outline=(244, 63, 94, 255), width=2)
    draw_centered_text(draw, [380, 700, 850, 760], "💡 測試後若仍無法點著，請致電盛隆協助：02-2972-5559", get_font(15), (225, 29, 72, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("3. Heater troubleshooter OK")

# ==============================================================================
# 4. STOVE FLAME & AIR DAMPER
# ==============================================================================
def process_stove():
    img_path = 'c:/Gass/website/images/stove-flame-damper.jpg'
    backup = 'c:/Gass/website/images/stove-flame-damper.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Title: covers x=[150, 1220], y=[15, 65]
    draw.rectangle([150, 15, 1220, 65], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [150, 15, 1220, 65], "瓦斯爐火焰判讀與爐底風門調節教學", get_font(30), (15, 23, 42, 255))

    # Left Section: covers x=[130, 480], y=[85, 180]
    draw.rectangle([130, 85, 480, 180], fill=(254, 242, 242, 255))
    draw.text((135, 95), "❌ 燃燒不完全（紅黃火）", font=get_font(22), fill=(220, 38, 38, 255))
    draw.text((135, 135), "熱效率差・耗瓦斯・鍋底嚴重積碳燻黑", font=get_font(15, False), fill=(153, 27, 27, 255))

    # Left Pot labels: covers x=[85, 260], y=[210, 345]
    draw.rectangle([85, 210, 260, 345], fill=(254, 242, 242, 255))
    draw.text((90, 220), "鍋底積碳焦黑", font=get_font(17), fill=(185, 28, 28, 255))
    draw.text((90, 255), "阻礙熱傳導效率", font=get_font(13, False), fill=(127, 29, 29, 255))
    draw.text((90, 285), "浪費燃氣瓦斯費", font=get_font(14), fill=(185, 28, 28, 255))
    draw.text((90, 315), "鍋底厚垢難刷洗", font=get_font(12, False), fill=(127, 29, 29, 255))

    # Left Flame labels: covers x=[85, 260], y=[410, 520]
    draw.rectangle([85, 410, 260, 520], fill=(254, 242, 242, 255))
    draw.text((90, 420), "紅火 / 黃火", font=get_font(20), fill=(220, 38, 38, 255))
    draw.text((90, 455), "空氣不足或快沒氣", font=get_font(13, False), fill=(127, 29, 29, 255))
    draw.text((90, 485), "燃燒不全冒黑煙", font=get_font(13, False), fill=(153, 27, 27, 255))

    # Right Section: covers x=[580, 910], y=[85, 180]
    draw.rectangle([580, 85, 910, 180], fill=(239, 246, 255, 255))
    draw.text((585, 95), "✅ 完全燃燒（清澈藍火）", font=get_font(22), fill=(37, 99, 235, 255))
    draw.text((585, 135), "火力最強・導熱佳・鍋底乾淨無碳垢", font=get_font(15, False), fill=(29, 78, 216, 255))

    # Right Pot labels: covers x=[780, 950], y=[210, 345]
    draw.rectangle([780, 210, 950, 345], fill=(239, 246, 255, 255))
    draw.text((785, 220), "鍋底乾淨不燒黑", font=get_font(17), fill=(29, 78, 216, 255))
    draw.text((785, 255), "受熱均勻熱效最高", font=get_font(13, False), fill=(30, 58, 138, 255))
    draw.text((785, 285), "大幅節省瓦斯費用", font=get_font(14), fill=(29, 78, 216, 255))
    draw.text((785, 315), "鍋具光亮好沖洗", font=get_font(12, False), fill=(30, 58, 138, 255))

    # Right Flame labels: covers x=[780, 950], y=[410, 520]
    draw.rectangle([780, 410, 950, 520], fill=(239, 246, 255, 255))
    draw.text((785, 420), "清澈健康藍火", font=get_font(20), fill=(37, 99, 235, 255))
    draw.text((785, 455), "火力充沛無黑煙", font=get_font(13, False), fill=(30, 58, 138, 255))
    draw.text((785, 485), "熱量完全釋放極高溫", font=get_font(13, False), fill=(30, 58, 138, 255))

    # Bottom Damper Teaching Box: covers x=[30, 440], y=[595, 740]
    draw.rounded_rectangle([30, 595, 440, 740], radius=16, fill=(37, 99, 235, 255))
    draw.text((40, 610), "🔧 爐底風門調節教學", font=get_font(22), fill=(255, 255, 255, 255))
    draw.text((40, 650), "撥動調節片，紅火變藍火！", font=get_font(15, False), fill=(224, 242, 254, 255))
    draw.text((40, 685), "盛隆專線 02-2972-5559 ｜ LINE: @350MZOGG", font=get_font(13), fill=(254, 240, 138, 255))

    # Diagram labels:
    # "BURNER HEAD" Left covers x=[350, 480], y=[485, 545]
    draw.rectangle([350, 485, 480, 545], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [350, 485, 480, 545], "爐心燃燒頭", get_font(14), (51, 65, 85, 255))

    # "BURNER HEAD" Right covers x=[640, 770], y=[480, 545]
    draw.rectangle([640, 480, 770, 545], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [640, 480, 770, 545], "爐頭分火蓋", get_font(14), (51, 65, 85, 255))

    # Right Instructions: covers x=[710, 950], y=[560, 735]
    draw.rectangle([710, 560, 950, 735], fill=(241, 245, 249, 255))
    draw.text((720, 570), "進氣孔 (已撥開)", font=get_font(18), fill=(15, 23, 42, 255))
    draw.text((720, 605), "瓦斯與空氣完全均勻混合", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((720, 640), "👉 撥開風門片開大進氣量即可消除紅火！", font=get_font(13), fill=(37, 99, 235, 255))
    draw.text((720, 680), "若調整後仍紅火燻黑，請致電盛隆 02-2972-5559 派員檢修", font=get_font(11, False), fill=(5, 150, 105, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("4. Stove flame OK")

# ==============================================================================
# 5. NATURAL GAS VS LPG
# ==============================================================================
def process_natural_gas():
    img_path = 'c:/Gass/website/images/natural-vs-lpg-gas.jpg'
    backup = 'c:/Gass/website/images/natural-vs-lpg-gas.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Title: covers x=[180, 1320], y=[60, 185]
    draw.rectangle([180, 60, 1320, 185], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [180, 65, 1320, 125], "天然瓦斯 (NG) 與 桶裝瓦斯 (LPG) 規格與設備差異圖解", get_font(30), (15, 23, 42, 255))
    draw_centered_text(draw, [180, 128, 1320, 175], "盛隆瓦斯專業安全指南 ｜ 門市電話 02-2972-5559 ｜ LINE: @350MZOGG", get_font(16, False), (71, 85, 105, 255))

    # Left (NG) text:
    # "LOW PRESSURE: 150-200mmH2O" covers x=[330, 530], y=[205, 325]
    draw.rectangle([330, 205, 530, 325], fill=(255, 255, 255, 255))
    draw.text((335, 215), "天然瓦斯 (NG)", font=get_font(18), fill=(37, 99, 235, 255))
    draw.text((335, 250), "供氣低壓：", font=get_font(15), fill=(51, 65, 85, 255))
    draw.text((335, 280), "150~200 mmH2O", font=get_font(16), fill=(37, 99, 235, 255))

    # "CITY UTILITY PIPELINE" covers x=[170, 410], y=[375, 425]
    draw.rectangle([170, 375, 410, 425], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [170, 375, 410, 425], "市區自來管線埋設供氣", get_font(15), (71, 85, 105, 255))

    # "LARGER BURNER NOZZLE ORIFICE" covers x=[335, 550], y=[610, 675]
    draw.rectangle([335, 610, 550, 675], fill=(255, 255, 255, 255))
    draw.text((340, 618), "噴嘴孔徑較大", font=get_font(18), fill=(37, 99, 235, 255))
    draw.text((340, 648), "天然氣專用設備規格", font=get_font(13, False), fill=(100, 116, 139, 255))

    # Center Warning Box:
    # STOP octagon: covers "STOP" text inside hexagon [615, 310, 760, 395]
    draw.rectangle([615, 310, 760, 395], fill=(220, 38, 38, 255))
    draw_centered_text(draw, [615, 310, 760, 395], "停！", get_font(46), (255, 255, 255, 255))

    # "NEVER CONNECT DIRECTLY WITHOUT CERTIFIED TECHNICIAN NOZZLE CONVERSION!" covers [550, 560, 825, 735]
    draw.rectangle([550, 560, 825, 735], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [550, 570, 825, 600], "⚠️ 供壓與熱值完全不同！", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [550, 605, 825, 635], "天然氣爐具直接接桶裝瓦斯", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [550, 640, 825, 670], "將產生巨大爆燃火焰極危險！", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [550, 675, 825, 702], "必須由合格專業技師", get_font(13), (5, 150, 105, 255))
    draw_centered_text(draw, [550, 702, 825, 730], "更換專用噴嘴改機後使用", get_font(13), (5, 150, 105, 255))

    # Right (LPG) text:
    # "HIGH PRESSURE" covers [850, 195, 1060, 310]
    draw.rectangle([850, 195, 1060, 310], fill=(255, 255, 255, 255))
    draw.text((855, 205), "桶裝瓦斯 (LPG)", font=get_font(18), fill=(5, 150, 105, 255))
    draw.text((855, 245), "安全控壓：", font=get_font(15), fill=(51, 65, 85, 255))
    draw.text((855, 275), "R280 調整器", font=get_font(15), fill=(5, 150, 105, 255))

    # "HIGH ENERGY DENSITY" covers [840, 320, 1010, 400]
    draw.rectangle([840, 320, 1010, 400], fill=(255, 255, 255, 255))
    draw.text((845, 330), "單位熱值極高", font=get_font(16), fill=(5, 150, 105, 255))
    draw.text((845, 362), "大火快炒鑊氣足", font=get_font(14, False), fill=(71, 85, 105, 255))

    # Cover "LPG" on cylinder [1170, 400, 1250, 460]
    draw.rectangle([1170, 400, 1250, 460], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [1170, 400, 1250, 460], "盛隆\n瓦斯", get_font(18), (37, 99, 235, 255))

    # "SMALLER NOZZLE ORIFICE" covers [855, 660, 1030, 725]
    draw.rectangle([855, 660, 1030, 725], fill=(255, 255, 255, 255))
    draw.text((860, 668), "噴嘴孔徑較小", font=get_font(18), fill=(5, 150, 105, 255))
    draw.text((860, 698), "桶裝瓦斯專用規格", font=get_font(13, False), fill=(100, 116, 139, 255))

    # "STANDARD REVERSE-THREAD LEFT-HAND SCREW VALVE" covers [1050, 665, 1345, 735]
    draw.rectangle([1050, 665, 1345, 735], fill=(255, 255, 255, 255))
    draw.text((1055, 672), "台灣標準反牙左旋角閥", font=get_font(17), fill=(15, 23, 42, 255))
    draw.text((1055, 706), "盛隆專線 02-2972-5559 ｜ LINE: @350MZOGG", font=get_font(12), fill=(37, 99, 235, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("5. Natural gas OK")

if __name__ == '__main__':
    process_gas_leak()
    process_cylinder_sizes()
    process_heater()
    process_stove()
    process_natural_gas()
    print("ALL 5 INFOGRAPHICS 100% PERFECTLY RENDERED!")
