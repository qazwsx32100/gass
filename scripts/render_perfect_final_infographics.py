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

    # Top title
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

    # Step 4: cover "911" on phone
    draw.rectangle([1208, 412, 1272, 458], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [1208, 412, 1272, 458], "盛隆", get_font(20), (220, 38, 38, 255))

    draw.rounded_rectangle([1020, 528, 1310, 614], radius=16, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [1020, 528, 1310, 614], "疏散室外撥打電話求助", get_font(22), (255, 255, 255, 255))
    draw.rectangle([1010, 624, 1320, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [1010, 624, 1320, 685], "④ 致電盛隆 02-2972-5559", get_font(18), (30, 41, 59, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("1. Gas leak localized OK")

# ==============================================================================
# 2. CYLINDER SIZES COMPARISON
# ==============================================================================
def process_cylinder_sizes():
    img_path = 'c:/Gass/website/images/cylinder-sizes-comparison.jpg'
    backup = 'c:/Gass/website/images/cylinder-sizes-comparison.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Title
    draw.rounded_rectangle([45, 35, 780, 140], radius=16, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=3)
    draw.rounded_rectangle([52, 42, 772, 133], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [52, 42, 772, 133], "台灣標準瓦斯鋼瓶各規格尺寸全覽對照圖", get_font(28), (255, 255, 255, 255))

    # 1) 4kg box [105, 260, 295, 415]
    draw.rounded_rectangle([105, 260, 295, 415], radius=14, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([112, 266, 288, 314], radius=10, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [112, 266, 288, 314], "4 公斤 輕便裝", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [105, 322, 295, 350], "露營休閒 / 泡茶小爐", get_font(14), (15, 23, 42, 255))
    draw_centered_text(draw, [105, 352, 295, 380], "體積小巧好收納", get_font(13, False), (71, 85, 105, 255))
    draw_centered_text(draw, [105, 382, 295, 410], "單身極低用量推薦", get_font(12, False), (100, 116, 139, 255))

    # 2) 10kg box [350, 218, 540, 375]
    draw.rounded_rectangle([350, 218, 540, 375], radius=14, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([357, 224, 533, 272], radius=10, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [357, 224, 533, 272], "10 公斤 小家庭", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [350, 280, 540, 308], "1~2 人租屋小家庭", get_font(14), (15, 23, 42, 255))
    draw_centered_text(draw, [350, 312, 540, 340], "窄小流理台專用", get_font(13, False), (71, 85, 105, 255))
    draw_centered_text(draw, [350, 342, 540, 370], "矮空間推薦尺寸", get_font(12, False), (100, 116, 139, 255))

    # 3) 16kg box [590, 135, 825, 320]
    draw.rounded_rectangle([590, 135, 825, 320], radius=14, fill=(239, 246, 255, 255), outline=(37, 99, 235, 255), width=2)
    draw.rounded_rectangle([598, 142, 817, 180], radius=8, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [598, 142, 817, 180], "★ 最熱門家庭首選", get_font(15), (255, 255, 255, 255))
    draw.rounded_rectangle([598, 188, 817, 236], radius=10, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [598, 188, 817, 236], "16 公斤 標準家庭", get_font(19), (255, 255, 255, 255))
    draw_centered_text(draw, [590, 245, 825, 272], "1~3人標準家庭規格", get_font(14), (15, 23, 42, 255))
    draw_centered_text(draw, [590, 272, 825, 298], "熱水器與廚房主力", get_font(13, False), (37, 99, 235, 255))
    draw_centered_text(draw, [590, 298, 825, 318], "多數公寓陽台首選", get_font(11, False), (71, 85, 105, 255))

    # 4) 20kg box [840, 148, 1030, 310]
    draw.rounded_rectangle([840, 148, 1030, 310], radius=14, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([847, 154, 1023, 202], radius=10, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [847, 154, 1023, 202], "20 公斤 大家庭/商用", get_font(17), (255, 255, 255, 255))
    draw_centered_text(draw, [840, 210, 1030, 238], "高用量家庭 / 小吃店", get_font(14), (15, 23, 42, 255))
    draw_centered_text(draw, [840, 242, 1030, 270], "快速爐大火快炒大容量", get_font(13, False), (71, 85, 105, 255))
    draw_centered_text(draw, [840, 274, 1030, 302], "餐飲小吃必備神兵利器", get_font(12, False), (100, 116, 139, 255))

    # 5) 50kg box [1080, 50, 1275, 225]
    draw.rounded_rectangle([1080, 50, 1275, 225], radius=14, fill=(15, 23, 42, 255), outline=(51, 65, 85, 255), width=2)
    draw.rounded_rectangle([1087, 56, 1268, 104], radius=10, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [1087, 56, 1268, 104], "50 公斤 工業/大戶", get_font(17), (255, 255, 255, 255))
    draw_centered_text(draw, [1080, 112, 1275, 140], "大型中央廚房 / 工廠", get_font(14), (255, 255, 255, 255))
    draw_centered_text(draw, [1080, 142, 1275, 170], "集合式管線並聯系統", get_font(13, False), (203, 213, 225, 255))
    draw_centered_text(draw, [1080, 172, 1275, 198], "大量供氣專用規格", get_font(12, False), (148, 163, 184, 255))
    draw_centered_text(draw, [1080, 198, 1275, 220], "需現場確認安裝環境", get_font(11, False), (251, 191, 36, 255))

    # Bottom Comparison Table (Cover completely from y: 520 to 768)
    draw.rectangle([0, 520, 1376, 768], fill=(248, 250, 252, 255))
    draw.line([(0, 520), (1376, 520)], fill=(226, 232, 240, 255), width=2)

    # Headers column (x: 15 to 115)
    draw.rounded_rectangle([15, 535, 115, 570], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 535, 115, 570], "規格容量", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([15, 580, 115, 615], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 580, 115, 615], "鋼瓶高度", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([15, 625, 115, 660], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 625, 115, 660], "鋼瓶直徑", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([15, 670, 115, 705], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 670, 115, 705], "適用情境", get_font(14), (51, 65, 85, 255))

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
    draw.rectangle([0, 725, 1376, 768], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [0, 725, 1376, 768], "盛隆瓦斯全規格鋼瓶均合格檢驗附鋁牌 ｜ 尺寸不確定？拍照傳 LINE: @350MZOGG 專人協助 ｜ 門市電話 02-2972-5559", get_font(13), (71, 85, 105, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("2. Cylinder sizes localized OK")

# ==============================================================================
# 3. HEATER TROUBLESHOOTING
# ==============================================================================
def process_heater():
    img_path = 'c:/Gass/website/images/heater-troubleshoot.jpg'
    backup = 'c:/Gass/website/images/heater-troubleshoot.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Banner
    draw.rectangle([0, 20, 1376, 120], fill=(255, 255, 255, 255))
    draw.rounded_rectangle([25, 25, 880, 110], radius=14, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [25, 25, 880, 110], "瓦斯熱水器點不著・洗澡沒熱水 5 步排查圖解", get_font(28), (255, 255, 255, 255))

    draw.rounded_rectangle([900, 25, 1346, 110], radius=14, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw_centered_text(draw, [900, 25, 1346, 110], "盛隆居家安全自我排查", get_font(22), (30, 41, 59, 255))

    # Step 1: cover [115, 140, 440, 290]
    draw.rectangle([115, 140, 440, 290], fill=(239, 246, 255, 255))
    draw.text((120, 148), "步驟 1：確認是否有瓦斯", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((120, 185), "檢查瓦斯桶氣量與角閥開關", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((120, 215), "若無瓦斯請立即預約換桶", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Cover "LPG" and "Low"
    draw.rectangle([100, 395, 155, 435], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [100, 395, 155, 435], "瓦斯", get_font(14), (51, 65, 85, 255))
    draw.rectangle([230, 355, 275, 380], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [230, 355, 275, 380], "殘量", get_font(11), (220, 38, 38, 255))

    # Step 2: cover [115, 435, 440, 530]
    draw.rectangle([115, 435, 440, 530], fill=(239, 246, 255, 255))
    draw.text((120, 442), "步驟 2：更換全新 1 號電池", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((120, 475), "取出熱水器底座電池盒", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((120, 502), "換入全新鹼性或碳鋅電池", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Step 3: cover [1015, 140, 1340, 250]
    draw.rectangle([1015, 140, 1340, 250], fill=(239, 246, 255, 255))
    draw.text((1020, 148), "步驟 3：確認瓦斯開關開啟", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((1020, 185), "確認管路凡而把手平行暢通", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((1020, 215), "角閥旋鈕逆時針完全開啟", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Cover "OPEN"
    draw.rectangle([410, 860, 470, 890], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [410, 860, 470, 890], "開啟", get_font(14), (5, 150, 105, 255))

    # Step 4: cover [1015, 395, 1340, 540]
    draw.rectangle([1015, 395, 1340, 540], fill=(239, 246, 255, 255))
    draw.text((1020, 405), "步驟 4：確認水壓推動微動開關", font=get_font(19), fill=(15, 23, 42, 255))
    draw.text((1020, 442), "水流過小微動開關無法啟動點火", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((1020, 472), "調大水量或清除水龍頭水垢", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Step 5: cover [1015, 665, 1340, 760]
    draw.rectangle([1015, 665, 1340, 760], fill=(239, 246, 255, 255))
    draw.text((1020, 675), "步驟 5：檢查清洗進水濾網", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((1020, 712), "旋開進出水濾網排除泥沙雜質", font=get_font(14, False), fill=(71, 85, 105, 255))

    draw.rectangle([1040, 860, 1260, 930], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [1040, 860, 1260, 930], "旋開清洗泥沙", get_font(14), (5, 150, 105, 255))

    # Center bottom phone box [400, 700, 850, 755]
    draw.rounded_rectangle([400, 700, 850, 755], radius=12, fill=(254, 242, 242, 255), outline=(244, 63, 94, 255), width=2)
    draw_centered_text(draw, [400, 700, 850, 755], "💡 測試後若仍無法點著，請致電盛隆協助：02-2972-5559", get_font(15), (225, 29, 72, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("3. Heater troubleshooter localized OK")

# ==============================================================================
# 4. STOVE FLAME & AIR DAMPER
# ==============================================================================
def process_stove():
    img_path = 'c:/Gass/website/images/stove-flame-damper.jpg'
    backup = 'c:/Gass/website/images/stove-flame-damper.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Title [180, 15, 1200, 80]
    draw.rectangle([170, 15, 1210, 80], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [170, 15, 1210, 80], "瓦斯爐火焰判讀與爐底風門調節教學", get_font(32), (15, 23, 42, 255))

    # Left Section: Incomplete Combustion [115, 95, 650, 185]
    draw.rectangle([115, 95, 650, 185], fill=(254, 242, 242, 255))
    draw.text((120, 105), "❌ 燃燒不完全（紅黃火）", font=get_font(22), fill=(220, 38, 38, 255))
    draw.text((120, 145), "熱效率差・耗瓦斯・鍋底嚴重積碳燻黑", font=get_font(15, False), fill=(153, 27, 27, 255))

    # Left Pot & Flame Labels
    draw.rectangle([115, 210, 335, 345], fill=(254, 242, 242, 255))
    draw.text((120, 220), "鍋底嚴重積碳焦黑", font=get_font(16), fill=(185, 28, 28, 255))
    draw.text((120, 255), "阻礙熱傳導", font=get_font(13, False), fill=(127, 29, 29, 255))
    draw.text((120, 285), "浪費燃氣瓦斯費", font=get_font(13, False), fill=(127, 29, 29, 255))

    draw.rectangle([115, 405, 340, 520], fill=(254, 242, 242, 255))
    draw.text((120, 415), "紅火 / 黃火", font=get_font(19), fill=(220, 38, 38, 255))
    draw.text((120, 450), "空氣不足或瓦斯快沒", font=get_font(13, False), fill=(127, 29, 29, 255))
    draw.text((120, 480), "燃燒不全游離碳", font=get_font(12, False), fill=(153, 27, 27, 255))

    # Right Section: Complete Combustion [775, 95, 1320, 185]
    draw.rectangle([775, 95, 1320, 185], fill=(239, 246, 255, 255))
    draw.text((780, 105), "✅ 完全燃燒（清澈藍火）", font=get_font(22), fill=(37, 99, 235, 255))
    draw.text((780, 145), "火力最強・導熱佳・鍋底乾淨無碳垢", font=get_font(15, False), fill=(29, 78, 216, 255))

    # Right Pot & Flame Labels
    draw.rectangle([1040, 210, 1280, 345], fill=(239, 246, 255, 255))
    draw.text((1045, 220), "鍋底乾淨不燒黑", font=get_font(16), fill=(29, 78, 216, 255))
    draw.text((1045, 255), "受熱均勻熱效最高", font=get_font(13, False), fill=(30, 58, 138, 255))
    draw.text((1045, 285), "最省瓦斯費用", font=get_font(13, False), fill=(30, 58, 138, 255))

    draw.rectangle([1040, 405, 1280, 520], fill=(239, 246, 255, 255))
    draw.text((1045, 415), "清澈健康藍火", font=get_font(19), fill=(37, 99, 235, 255))
    draw.text((1045, 450), "火力充沛無黑煙", font=get_font(13, False), fill=(30, 58, 138, 255))
    draw.text((1045, 480), "熱量完全釋放", font=get_font(12, False), fill=(30, 58, 138, 255))

    # Bottom Damper Teaching [30, 595, 440, 735]
    draw.rounded_rectangle([30, 595, 440, 735], radius=16, fill=(37, 99, 235, 255))
    draw.text((40, 610), "🔧 爐底風門調節教學", font=get_font(22), fill=(255, 255, 255, 255))
    draw.text((40, 650), "撥動調節片，紅火變藍火！", font=get_font(15, False), fill=(224, 242, 254, 255))
    draw.text((40, 685), "盛隆專線 02-2972-5559 ｜ LINE: @350MZOGG", font=get_font(13), fill=(254, 240, 138, 255))

    # Diagram labels
    draw.rectangle([480, 625, 620, 660], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [480, 625, 620, 660], "爐心燃燒頭", get_font(13), (51, 65, 85, 255))

    draw.rectangle([880, 615, 1020, 650], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [880, 615, 1020, 650], "爐頭分火蓋", get_font(13), (51, 65, 85, 255))

    draw.rectangle([265, 780, 375, 810], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [265, 780, 375, 810], "瓦斯氣流", get_font(13), (234, 88, 12, 255))

    draw.rectangle([170, 920, 270, 955], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [170, 920, 270, 955], "瓦斯導管", get_font(13), (51, 65, 85, 255))

    draw.rectangle([525, 920, 665, 955], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [525, 920, 665, 955], "空氣文氏管", get_font(13), (51, 65, 85, 255))

    draw.rectangle([730, 910, 900, 955], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [730, 910, 900, 955], "風門調節片 (鐵片)", get_font(13), (37, 99, 235, 255))

    draw.rectangle([1090, 785, 1260, 865], fill=(241, 245, 249, 255))
    draw.text((1095, 790), "進氣孔 (已撥開)", font=get_font(15), fill=(15, 23, 42, 255))
    draw.text((1095, 822), "空氣與瓦斯均勻混合", font=get_font(12, False), fill=(71, 85, 105, 255))

    draw.rectangle([970, 875, 1350, 945], fill=(255, 255, 255, 255))
    draw.text((975, 882), "👉 撥開風門片開大進氣量即可消除紅火！", font=get_font(15), fill=(37, 99, 235, 255))
    draw.text((975, 912), "若調整後仍紅火燻黑，請致電盛隆 02-2972-5559 派員檢修", font=get_font(12, False), fill=(5, 150, 105, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("4. Stove flame localized OK")

# ==============================================================================
# 5. NATURAL GAS VS LPG
# ==============================================================================
def process_natural_gas():
    img_path = 'c:/Gass/website/images/natural-vs-lpg-gas.jpg'
    backup = 'c:/Gass/website/images/natural-vs-lpg-gas.orig.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top Title [150, 60, 1330, 200]
    draw.rectangle([150, 60, 1330, 200], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [150, 65, 1330, 135], "天然瓦斯 (NG) 與 桶裝瓦斯 (LPG) 規格與設備差異圖解", get_font(30), (15, 23, 42, 255))
    draw_centered_text(draw, [150, 140, 1330, 190], "盛隆瓦斯專業安全指南 ｜ 門市電話 02-2972-5559 ｜ LINE: @350MZOGG", get_font(16, False), (71, 85, 105, 255))

    # Left (NG)
    draw.rectangle([200, 210, 550, 280], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [200, 210, 550, 280], "天然瓦斯（自來天然氣 NG）", get_font(22), (37, 99, 235, 255))

    draw.rectangle([360, 260, 535, 350], fill=(255, 255, 255, 255))
    draw.text((365, 270), "供氣低壓：", font=get_font(15), fill=(51, 65, 85, 255))
    draw.text((365, 305), "150~200 mmH2O", font=get_font(16), fill=(37, 99, 235, 255))

    draw.rectangle([170, 510, 405, 555], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [170, 510, 405, 555], "市區自來管線埋設供氣", get_font(15), (71, 85, 105, 255))

    draw.rectangle([370, 795, 545, 875], fill=(255, 255, 255, 255))
    draw.text((375, 805), "噴嘴孔徑較大", font=get_font(16), fill=(37, 99, 235, 255))
    draw.text((375, 835), "天然氣專用設備", font=get_font(13, False), fill=(100, 116, 139, 255))

    # Center Warning Box
    draw.rectangle([615, 360, 765, 430], fill=(220, 38, 38, 255))
    draw_centered_text(draw, [615, 360, 765, 430], "嚴禁直插", get_font(24), (255, 255, 255, 255))

    draw.rectangle([560, 560, 820, 740], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [560, 565, 820, 595], "⚠️ 供壓與熱值完全不同！", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [560, 600, 820, 630], "天然氣爐具直接接桶裝", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [560, 635, 820, 665], "將產生巨大爆燃火焰！", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [560, 670, 820, 700], "必須由合格專業技師", get_font(13), (5, 150, 105, 255))
    draw_centered_text(draw, [560, 700, 820, 730], "更換專用噴嘴改機後使用", get_font(13), (5, 150, 105, 255))

    # Right (LPG)
    draw.rectangle([780, 210, 1320, 280], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [780, 210, 1320, 280], "桶裝瓦斯（液化石油氣 LPG）", get_font(22), (5, 150, 105, 255))

    draw.rectangle([860, 260, 980, 340], fill=(255, 255, 255, 255))
    draw.text((865, 270), "安全控壓：", font=get_font(15), fill=(51, 65, 85, 255))
    draw.text((865, 305), "R280 調整器", font=get_font(15), fill=(5, 150, 105, 255))

    draw.rectangle([850, 415, 990, 490], fill=(255, 255, 255, 255))
    draw.text((855, 420), "單位熱值極高", font=get_font(15), fill=(5, 150, 105, 255))
    draw.text((855, 450), "大火快炒鑊氣足", font=get_font(13, False), fill=(71, 85, 105, 255))

    # Cover "LPG" on cylinder [1175, 405, 1245, 455]
    draw.rectangle([1175, 405, 1245, 455], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [1175, 405, 1245, 455], "盛隆", get_font(20), (37, 99, 235, 255))

    draw.rectangle([860, 860, 1025, 935], fill=(255, 255, 255, 255))
    draw.text((865, 865), "噴嘴孔徑較小", font=get_font(16), fill=(5, 150, 105, 255))
    draw.text((865, 895), "桶裝專用設備", font=get_font(13, False), fill=(100, 116, 139, 255))

    draw.rectangle([1055, 870, 1340, 945], fill=(255, 255, 255, 255))
    draw.text((1060, 875), "台灣標準反牙左旋開關閥", font=get_font(15), fill=(15, 23, 42, 255))
    draw.text((1060, 905), "盛隆專線 02-2972-5559", font=get_font(14), fill=(37, 99, 235, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("5. Natural gas vs LPG localized OK")

if __name__ == '__main__':
    process_gas_leak()
    process_cylinder_sizes()
    process_heater()
    process_stove()
    process_natural_gas()
    print("ALL 5 INFOGRAPHICS RENDERED FLAWLESSLY IN TRADITIONAL CHINESE!")
