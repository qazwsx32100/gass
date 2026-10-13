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
    draw.rounded_rectangle([50, 35, 830, 135], radius=16, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=3)
    draw.rounded_rectangle([58, 43, 822, 127], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [58, 43, 822, 127], "台灣標準瓦斯鋼瓶各規格尺寸全覽對照圖", get_font(28), (255, 255, 255, 255))

    # 1) 4kg box (x: 75 to 215, y: 260 to 415)
    draw.rounded_rectangle([75, 258, 215, 415], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([80, 263, 210, 308], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [80, 263, 210, 308], "4 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [75, 315, 215, 345], "露營 / 泡茶小爐", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [75, 350, 215, 380], "體積小巧好收納", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [75, 380, 215, 408], "單身極低用量推薦", get_font(11, False), (100, 116, 139, 255))

    # 2) 10kg box (x: 255 to 392, y: 220 to 380)
    draw.rounded_rectangle([255, 218, 392, 380], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([260, 223, 387, 268], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [260, 223, 387, 268], "10 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [255, 275, 392, 305], "小家庭標準裝", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [255, 310, 392, 340], "1~2 人租屋小家庭", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [255, 345, 392, 373], "窄小流理台專用", get_font(11, False), (100, 116, 139, 255))

    # 3) 16kg box (x: 430 to 600, y: 140 to 330)
    draw.rounded_rectangle([430, 140, 600, 335], radius=14, fill=(239, 246, 255, 255), outline=(37, 99, 235, 255), width=2)
    draw.rounded_rectangle([438, 146, 592, 184], radius=8, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [438, 146, 592, 184], "★ 最熱門首選", get_font(14), (255, 255, 255, 255))

    draw.rounded_rectangle([438, 192, 592, 238], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [438, 192, 592, 238], "16 公斤", get_font(20), (255, 255, 255, 255))
    draw_centered_text(draw, [430, 245, 600, 275], "家庭主力推薦", get_font(14), (15, 23, 42, 255))
    draw_centered_text(draw, [430, 275, 600, 305], "1~3人標準家庭", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [430, 305, 600, 330], "熱水器主流配置", get_font(12, False), (37, 99, 235, 255))

    # 4) 20kg box (x: 615 to 750, y: 150 to 310)
    draw.rounded_rectangle([615, 148, 750, 310], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([620, 153, 745, 198], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [620, 153, 745, 198], "20 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [615, 205, 750, 235], "大容量 / 商用", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [615, 240, 750, 270], "高用量家庭/小吃店", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [615, 275, 750, 305], "快速爐火力大續航高", get_font(11, False), (100, 116, 139, 255))

    # 5) 50kg box (x: 785 to 930, y: 50 to 225)
    draw.rounded_rectangle([785, 48, 930, 225], radius=12, fill=(15, 23, 42, 255), outline=(51, 65, 85, 255), width=2)
    draw.rounded_rectangle([790, 53, 925, 98], radius=8, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [790, 53, 925, 98], "50 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [785, 105, 930, 135], "工業 / 中央廚房", get_font(13), (255, 255, 255, 255))
    draw_centered_text(draw, [785, 140, 930, 170], "連鎖餐飲工廠大戶", get_font(12, False), (203, 213, 225, 255))
    draw_centered_text(draw, [785, 170, 930, 195], "集合管線並聯系統", get_font(11, False), (148, 163, 184, 255))
    draw_centered_text(draw, [785, 195, 930, 220], "需現場確認環境", get_font(11, False), (251, 191, 36, 255))

    # Bottom Comparison Table (Cover completely from y: 520 to 768)
    draw.rectangle([0, 520, 1376, 768], fill=(248, 250, 252, 255))
    draw.line([(0, 520), (1376, 520)], fill=(226, 232, 240, 255), width=2)

    # Headers column (x: 20 to 120)
    draw.rounded_rectangle([15, 535, 115, 570], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 535, 115, 570], "規格容量", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([15, 580, 115, 615], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 580, 115, 615], "鋼瓶高度", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([15, 625, 115, 660], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 625, 115, 660], "鋼瓶直徑", get_font(14), (51, 65, 85, 255))

    draw.rounded_rectangle([15, 670, 115, 705], radius=6, fill=(241, 245, 249, 255))
    draw_centered_text(draw, [15, 670, 115, 705], "適用情境", get_font(14), (51, 65, 85, 255))

    cols = [
        (200, "4 公斤", "高約 42 cm", "直徑約 25 cm", "露營外出 / 泡茶小爐 / 單身獨居"),
        (440, "10 公斤", "高約 55 cm", "直徑約 30 cm", "1~2人小家庭 / 流理台矮櫃空間"),
        (700, "16 公斤★首選", "高約 68 cm", "直徑約 31 cm", "1~3人標準家庭 / 熱水器日常主力"),
        (940, "20 公斤", "高約 75 cm", "直徑約 31 cm", "高用量家庭 / 餐廳小吃 / 快速爐"),
        (1200, "50 公斤", "高約 125 cm", "直徑約 37 cm", "連鎖餐飲大戶 / 中央廚房 / 工廠供氣")
    ]
    for cx, c_cap, c_h, c_w, c_desc in cols:
        is_star = "★" in c_cap
        card_fill = (239, 246, 255, 255) if is_star else (255, 255, 255, 255)
        border_col = (37, 99, 235, 255) if is_star else (226, 232, 240, 255)
        draw.rounded_rectangle([cx - 105, 530, cx + 105, 715], radius=10, fill=card_fill, outline=border_col, width=2 if is_star else 1)

        draw_centered_text(draw, [cx - 100, 535, cx + 100, 570], c_cap, get_font(17, True), (37, 99, 235, 255) if is_star else (15, 23, 42, 255))
        draw_centered_text(draw, [cx - 100, 580, cx + 100, 615], c_h, get_font(15, True), (5, 150, 105, 255))
        draw_centered_text(draw, [cx - 100, 625, cx + 100, 660], c_w, get_font(14, False), (71, 85, 105, 255))
        draw_centered_text(draw, [cx - 102, 670, cx + 102, 705], c_desc, get_font(11, False), (51, 65, 85, 255))

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
    draw.rectangle([0, 20, 1376, 115], fill=(255, 255, 255, 255))
    draw.rounded_rectangle([30, 25, 960, 105], radius=14, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [30, 25, 960, 105], "瓦斯熱水器點不著・洗澡沒熱水 5 步排查圖解", get_font(30), (255, 255, 255, 255))

    draw.rounded_rectangle([980, 25, 1346, 105], radius=14, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw_centered_text(draw, [980, 25, 1346, 105], "盛隆居家安全自我排查", get_font(22), (30, 41, 59, 255))

    # Step 1: cover [110, 140, 435, 285]
    draw.rectangle([110, 140, 435, 285], fill=(239, 246, 255, 255))
    draw.text((115, 150), "步驟 1：確認是否有瓦斯", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((115, 185), "檢查瓦斯桶氣量與角閥開關", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((115, 215), "若瓦斯用盡請立即預約換桶", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Cover "LPG" and "Low"
    draw.rectangle([100, 395, 135, 425], fill=(226, 232, 240, 255))
    draw.text((102, 400), "瓦斯", font=get_font(12), fill=(51, 65, 85, 255))
    draw.rectangle([230, 345, 265, 365], fill=(255, 255, 255, 255))
    draw.text((232, 347), "殘量", font=get_font(11), fill=(220, 38, 38, 255))

    # Step 2: cover [110, 550, 435, 685]
    draw.rectangle([110, 550, 435, 685], fill=(239, 246, 255, 255))
    draw.text((115, 558), "步驟 2：更換全新 1 號電池", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((115, 595), "取出熱水器底座電池盒", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((115, 625), "換入全新 1 號鹼性或碳鋅電池", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Step 3: cover [1010, 135, 1330, 275]
    draw.rectangle([1010, 135, 1330, 275], fill=(239, 246, 255, 255))
    draw.text((1015, 150), "步驟 3：確認瓦斯開關已開啟", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((1015, 185), "確認管路凡而把手轉向平行暢通", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((1015, 215), "角閥旋鈕逆時針完全轉開", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Cover "OPEN"
    draw.rectangle([415, 860, 460, 885], fill=(255, 255, 255, 255))
    draw.text((418, 863), "開啟", font=get_font(13), fill=(5, 150, 105, 255))

    # Step 4: cover [1010, 395, 1330, 530]
    draw.rectangle([1010, 395, 1330, 530], fill=(239, 246, 255, 255))
    draw.text((1015, 405), "步驟 4：確認水壓推動微動開關", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((1015, 440), "水流過小微動開關無法啟動點火", font=get_font(14, False), fill=(71, 85, 105, 255))
    draw.text((1015, 470), "調大水量或清除水龍頭水垢", font=get_font(13, False), fill=(37, 99, 235, 255))

    # Step 5: cover [1010, 665, 1330, 760]
    draw.rectangle([1010, 665, 1330, 760], fill=(239, 246, 255, 255))
    draw.text((1015, 675), "步驟 5：檢查清洗進水濾網", font=get_font(20), fill=(15, 23, 42, 255))
    draw.text((1015, 710), "旋開進出水濾網排除泥沙雜質", font=get_font(14, False), fill=(71, 85, 105, 255))

    draw.rectangle([1060, 870, 1220, 930], fill=(241, 245, 249, 255))
    draw.text((1065, 880), "旋開清洗泥沙", font=get_font(14), fill=(5, 150, 105, 255))

    # Center bottom phone box
    draw.rounded_rectangle([380, 705, 860, 755], radius=12, fill=(254, 242, 242, 255), outline=(244, 63, 94, 255), width=2)
    draw_centered_text(draw, [380, 705, 860, 755], "💡 測試後若仍無法點著，請致電盛隆協助：02-2972-5559", get_font(14), (225, 29, 72, 255))

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

    # Top Title
    draw.rectangle([100, 15, 1276, 75], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [100, 15, 1276, 75], "瓦斯爐火焰判讀與爐底風門調節教學", get_font(32), (15, 23, 42, 255))

    # Left Section: Incomplete Combustion (Red flame)
    draw.rectangle([115, 95, 650, 185], fill=(254, 242, 242, 255))
    draw.text((120, 105), "❌ 燃燒不完全（紅黃火）", font=get_font(22), fill=(220, 38, 38, 255))
    draw.text((120, 145), "熱效率差・耗瓦斯・鍋底嚴重積碳燻黑", font=get_font(15, False), fill=(153, 27, 27, 255))

    # Left Labels
    draw.rectangle([110, 210, 335, 345], fill=(254, 242, 242, 255))
    draw.text((115, 220), "鍋底嚴重積碳焦黑", font=get_font(16), fill=(185, 28, 28, 255))
    draw.text((115, 255), "阻礙熱傳導", font=get_font(13, False), fill=(127, 29, 29, 255))
    draw.text((115, 285), "浪費燃氣瓦斯費", font=get_font(13, False), fill=(127, 29, 29, 255))

    draw.rectangle([110, 405, 340, 520], fill=(254, 242, 242, 255))
    draw.text((115, 415), "紅火 / 黃火", font=get_font(19), fill=(220, 38, 38, 255))
    draw.text((115, 450), "空氣不足或瓦斯快沒", font=get_font(13, False), fill=(127, 29, 29, 255))
    draw.text((115, 480), "燃燒不全產生游離碳", font=get_font(12, False), fill=(153, 27, 27, 255))

    # Right Section: Complete Combustion (Blue flame)
    draw.rectangle([770, 95, 1315, 185], fill=(239, 246, 255, 255))
    draw.text((775, 105), "✅ 完全燃燒（清澈藍火）", font=get_font(22), fill=(37, 99, 235, 255))
    draw.text((775, 145), "火力最強・導熱佳・鍋底乾淨無碳垢", font=get_font(15, False), fill=(29, 78, 216, 255))

    # Right Labels
    draw.rectangle([1035, 210, 1275, 345], fill=(239, 246, 255, 255))
    draw.text((1040, 220), "鍋底乾淨不燒黑", font=get_font(16), fill=(29, 78, 216, 255))
    draw.text((1040, 255), "受熱均勻熱效最高", font=get_font(13, False), fill=(30, 58, 138, 255))
    draw.text((1040, 285), "最省瓦斯費用", font=get_font(13, False), fill=(30, 58, 138, 255))

    draw.rectangle([1035, 405, 1275, 520], fill=(239, 246, 255, 255))
    draw.text((1040, 415), "清澈健康藍火", font=get_font(19), fill=(37, 99, 235, 255))
    draw.text((1040, 450), "火力充沛無黑煙", font=get_font(13, False), fill=(30, 58, 138, 255))
    draw.text((1040, 480), "熱量完全釋放", font=get_font(12, False), fill=(30, 58, 138, 255))

    # Bottom Damper Teaching
    draw.rounded_rectangle([110, 595, 435, 735], radius=16, fill=(37, 99, 235, 255))
    draw.text((120, 610), "🔧 爐底風門調節教學", font=get_font(22), fill=(255, 255, 255, 255))
    draw.text((120, 650), "撥動調節片，紅火變藍火！", font=get_font(15, False), fill=(224, 242, 254, 255))
    draw.text((120, 685), "盛隆專線 02-2972-5559", font=get_font(14), fill=(254, 240, 138, 255))

    # Diagram labels
    draw.rectangle([475, 620, 615, 655], fill=(241, 245, 249, 255))
    draw.text((480, 625), "爐心燃燒頭", font=get_font(15), fill=(51, 65, 85, 255))

    draw.rectangle([865, 610, 1010, 645], fill=(241, 245, 249, 255))
    draw.text((870, 615), "爐頭分火蓋", font=get_font(15), fill=(51, 65, 85, 255))

    draw.rectangle([260, 775, 370, 805], fill=(255, 255, 255, 255))
    draw.text((265, 780), "瓦斯氣流", font=get_font(13), fill=(234, 88, 12, 255))

    draw.rectangle([165, 920, 265, 955], fill=(255, 255, 255, 255))
    draw.text((170, 925), "瓦斯導管", font=get_font(13), fill=(51, 65, 85, 255))

    draw.rectangle([515, 920, 655, 955], fill=(255, 255, 255, 255))
    draw.text((520, 925), "空氣文氏管", font=get_font(13), fill=(51, 65, 85, 255))

    draw.rectangle([720, 910, 890, 955], fill=(255, 255, 255, 255))
    draw.text((725, 915), "風門調節片 (鐵片)", font=get_font(13), fill=(37, 99, 235, 255))

    draw.rectangle([1080, 775, 1250, 845], fill=(241, 245, 249, 255))
    draw.text((1085, 785), "進氣孔 (已撥開)", font=get_font(15), fill=(15, 23, 42, 255))
    draw.text((1085, 815), "空氣與瓦斯充分混合", font=get_font(12, False), fill=(71, 85, 105, 255))

    draw.rectangle([960, 870, 1340, 940], fill=(255, 255, 255, 255))
    draw.text((965, 880), "👉 撥開風門片：開大進氣量即可消除紅火！", font=get_font(16), fill=(37, 99, 235, 255))
    draw.text((965, 912), "若調整後仍紅火燻黑，請致電盛隆 02-2972-5559 派員檢修", font=get_font(13, False), fill=(5, 150, 105, 255))

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

    # Top Title
    draw.rectangle([150, 60, 1320, 200], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [150, 65, 1320, 135], "天然瓦斯 (NG) 與 桶裝瓦斯 (LPG) 規格與設備差異圖解", get_font(30), (15, 23, 42, 255))
    draw_centered_text(draw, [150, 140, 1320, 190], "盛隆瓦斯專業安全指南 ｜ 諮詢專線 02-2972-5559 ｜ LINE: @350MZOGG", get_font(16, False), (71, 85, 105, 255))

    # Left (NG)
    draw.rectangle([100, 210, 480, 280], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [100, 210, 480, 280], "天然瓦斯（自來天然氣 NG）", get_font(22), (37, 99, 235, 255))

    draw.rectangle([350, 260, 520, 345], fill=(255, 255, 255, 255))
    draw.text((355, 270), "供氣低壓：", font=get_font(15), fill=(51, 65, 85, 255))
    draw.text((355, 300), "150~200 mmH2O", font=get_font(16), fill=(37, 99, 235, 255))

    draw.rectangle([140, 505, 420, 555], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [140, 505, 420, 555], "市區公共自來管線埋設供氣", get_font(15), (71, 85, 105, 255))

    draw.rectangle([360, 785, 550, 865], fill=(255, 255, 255, 255))
    draw.text((365, 795), "爐具噴嘴孔徑較大", font=get_font(16), fill=(37, 99, 235, 255))
    draw.text((365, 825), "天然氣專用設備", font=get_font(13, False), fill=(100, 116, 139, 255))

    # Center Warning Box
    draw.rectangle([585, 360, 745, 425], fill=(220, 38, 38, 255))
    draw_centered_text(draw, [585, 360, 745, 425], "嚴禁直插", get_font(28), (255, 255, 255, 255))

    draw.rectangle([545, 550, 790, 745], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [545, 555, 790, 590], "⚠️ 供氣壓力與熱值完全不同！", get_font(14), (220, 38, 38, 255))
    draw_centered_text(draw, [545, 595, 790, 630], "天然氣爐具直接接桶裝瓦斯", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [545, 635, 790, 670], "將產生巨大爆燃火焰，極危險！", get_font(13), (220, 38, 38, 255))
    draw_centered_text(draw, [545, 675, 790, 710], "必須由原廠或專業技師", get_font(13), (5, 150, 105, 255))
    draw_centered_text(draw, [545, 710, 790, 740], "更換專用噴嘴改機後方可使用", get_font(13), (5, 150, 105, 255))

    # Right (LPG)
    draw.rectangle([750, 210, 1300, 280], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [750, 210, 1300, 280], "桶裝瓦斯（液化石油氣 LPG）", get_font(22), (5, 150, 105, 255))

    draw.rectangle([840, 260, 970, 335], fill=(255, 255, 255, 255))
    draw.text((845, 270), "安全控壓：", font=get_font(15), fill=(51, 65, 85, 255))
    draw.text((845, 300), "R280 調整器", font=get_font(15), fill=(5, 150, 105, 255))

    draw.rectangle([830, 415, 980, 490], fill=(255, 255, 255, 255))
    draw.text((835, 420), "單位熱值極高", font=get_font(15), fill=(5, 150, 105, 255))
    draw.text((835, 450), "大火快炒鑊氣十足", font=get_font(13, False), fill=(71, 85, 105, 255))

    # Cover "LPG" on cylinder
    draw.rectangle([1130, 400, 1250, 460], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [1130, 400, 1250, 460], "盛隆", get_font(22), (37, 99, 235, 255))

    draw.rectangle([850, 855, 1020, 935], fill=(255, 255, 255, 255))
    draw.text((855, 865), "噴嘴孔徑較小", font=get_font(16), fill=(5, 150, 105, 255))
    draw.text((855, 895), "桶裝專用設備", font=get_font(13, False), fill=(100, 116, 139, 255))

    draw.rectangle([1040, 865, 1340, 940], fill=(255, 255, 255, 255))
    draw.text((1045, 875), "台灣標準反牙左旋開關", font=get_font(15), fill=(15, 23, 42, 255))
    draw.text((1045, 905), "盛隆專線 02-2972-5559", font=get_font(13), fill=(37, 99, 235, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("5. Natural gas vs LPG localized OK")

if __name__ == '__main__':
    process_gas_leak()
    process_cylinder_sizes()
    process_heater()
    process_stove()
    process_natural_gas()
    print("ALL 5 INFOGRAPHICS LOCALIZED WITH EXACT COORDINATES!")
