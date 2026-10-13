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

    # Step 4: cover "911" on phone exactly at [1210, 412, 1272, 458]
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

    # Top Title (x: 45 to 600, y: 35 to 140)
    draw.rounded_rectangle([45, 35, 600, 140], radius=16, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=3)
    draw.rounded_rectangle([52, 42, 593, 133], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [52, 42, 593, 133], "台灣標準瓦斯鋼瓶各規格尺寸全覽", get_font(26), (255, 255, 255, 255))

    # 1) 4kg box [78, 258, 215, 415]
    draw.rounded_rectangle([78, 258, 215, 415], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([84, 264, 209, 312], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [84, 264, 209, 312], "4 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [78, 320, 215, 348], "露營 / 泡茶小爐", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [78, 350, 215, 378], "體積小巧好收納", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [78, 380, 215, 408], "單身極低用量推薦", get_font(11, False), (100, 116, 139, 255))

    # 2) 10kg box [255, 218, 392, 375]
    draw.rounded_rectangle([255, 218, 392, 375], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([261, 224, 386, 272], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [261, 224, 386, 272], "10 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [255, 280, 392, 308], "小家庭標準裝", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [255, 312, 392, 340], "1~2 人租屋小家庭", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [255, 342, 392, 370], "窄小流理台專用", get_font(11, False), (100, 116, 139, 255))

    # 3) 16kg box [435, 135, 600, 315]
    draw.rounded_rectangle([435, 135, 600, 315], radius=14, fill=(239, 246, 255, 255), outline=(37, 99, 235, 255), width=2)
    draw.rounded_rectangle([442, 142, 593, 178], radius=8, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [442, 142, 593, 178], "★ 最熱門首選", get_font(14), (255, 255, 255, 255))
    draw.rounded_rectangle([442, 184, 593, 228], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [442, 184, 593, 228], "16 公斤", get_font(20), (255, 255, 255, 255))
    draw_centered_text(draw, [435, 235, 600, 262], "家庭主力推薦", get_font(14), (15, 23, 42, 255))
    draw_centered_text(draw, [435, 264, 600, 290], "1~3人標準家庭", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [435, 290, 600, 312], "熱水器主流配置", get_font(12, False), (37, 99, 235, 255))

    # 4) 20kg box [615, 148, 755, 310]
    draw.rounded_rectangle([615, 148, 755, 310], radius=12, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw.rounded_rectangle([621, 154, 749, 202], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [621, 154, 749, 202], "20 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [615, 210, 755, 238], "大容量 / 商用", get_font(13), (15, 23, 42, 255))
    draw_centered_text(draw, [615, 242, 755, 270], "高用量家庭/小吃店", get_font(12, False), (71, 85, 105, 255))
    draw_centered_text(draw, [615, 274, 755, 302], "快速爐火力大續航高", get_font(11, False), (100, 116, 139, 255))

    # 5) 50kg box [785, 50, 935, 225]
    draw.rounded_rectangle([785, 50, 935, 225], radius=12, fill=(15, 23, 42, 255), outline=(51, 65, 85, 255), width=2)
    draw.rounded_rectangle([791, 56, 929, 102], radius=8, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [791, 56, 929, 102], "50 公斤", get_font(18), (255, 255, 255, 255))
    draw_centered_text(draw, [785, 108, 935, 136], "工業 / 中央廚房", get_font(13), (255, 255, 255, 255))
    draw_centered_text(draw, [785, 140, 935, 168], "連鎖餐飲工廠大戶", get_font(12, False), (203, 213, 225, 255))
    draw_centered_text(draw, [785, 170, 935, 195], "集合管線並聯系統", get_font(11, False), (148, 163, 184, 255))
    draw_centered_text(draw, [785, 195, 935, 220], "需現場確認環境", get_font(11, False), (251, 191, 36, 255))

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
        (148, "4 公斤", "高約 42 cm", "直徑約 25 cm", "露營外出 / 泡茶小爐 / 單身獨居"),
        (325, "10 公斤", "高約 55 cm", "直徑約 30 cm", "1~2人小家庭 / 流理台矮櫃空間"),
        (505, "16 公斤★首選", "高約 68 cm", "直徑約 31 cm", "1~3人標準家庭 / 熱水器日常主力"),
        (685, "20 公斤", "高約 75 cm", "直徑約 31 cm", "高用量家庭 / 餐廳小吃 / 快速爐"),
        (865, "50 公斤", "高約 125 cm", "直徑約 37 cm", "連鎖餐飲大戶 / 中央廚房 / 工廠供氣")
    ]
    for cx, c_cap, c_h, c_w, c_desc in cols:
        is_star = "★" in c_cap
        card_fill = (239, 246, 255, 255) if is_star else (255, 255, 255, 255)
        border_col = (37, 99, 235, 255) if is_star else (226, 232, 240, 255)
        draw.rounded_rectangle([cx - 85, 530, cx + 85, 715], radius=10, fill=card_fill, outline=border_col, width=2 if is_star else 1)

        draw_centered_text(draw, [cx - 80, 535, cx + 80, 570], c_cap, get_font(16, True), (37, 99, 235, 255) if is_star else (15, 23, 42, 255))
        draw_centered_text(draw, [cx - 80, 580, cx + 80, 615], c_h, get_font(15, True), (5, 150, 105, 255))
        draw_centered_text(draw, [cx - 80, 625, cx + 80, 660], c_w, get_font(13, False), (71, 85, 105, 255))
        draw_centered_text(draw, [cx - 82, 670, cx + 82, 705], c_desc, get_font(10, False), (51, 65, 85, 255))

    # Right branding card [960, 530, 1365, 715]
    draw.rounded_rectangle([965, 530, 1365, 715], radius=10, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=1)
    draw_centered_text(draw, [965, 545, 1365, 580], "盛隆瓦斯 ｜ 三重蘆洲直達專車", get_font(16), (30, 41, 59, 255))
    draw_centered_text(draw, [965, 590, 1365, 625], "🛡️ 全規格鋼瓶依法檢驗附合格鋁牌", get_font(14, False), (5, 150, 105, 255))
    draw_centered_text(draw, [965, 630, 1365, 665], "📞 門市專線：02-2972-5559", get_font(15), (37, 99, 235, 255))
    draw_centered_text(draw, [965, 670, 1365, 705], "📱 LINE 線上快速叫瓦斯：@350MZOGG", get_font(14, False), (71, 85, 105, 255))

    # Bottom notice banner
    draw.rectangle([0, 725, 1376, 768], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [0, 725, 1376, 768], "尺寸不確定？拍照傳 LINE: @350MZOGG 專人為您判斷推薦 ｜ 假日夜間不加價", get_font(13), (71, 85, 105, 255))

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

    # Top Banner [0, 25, 735, 115] & [735, 25, 990, 115]
    draw.rectangle([0, 20, 1376, 120], fill=(255, 255, 255, 255))
    draw.rounded_rectangle([25, 25, 680, 110], radius=14, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [25, 25, 680, 110], "瓦斯熱水器點不著・洗澡沒熱水 5 步排查圖解", get_font(26), (255, 255, 255, 255))

    draw.rounded_rectangle([700, 25, 970, 110], radius=14, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255), width=2)
    draw_centered_text(draw, [700, 25, 970, 110], "盛隆居家安全自我排查", get_font(20), (30, 41, 59, 255))

    # Step 1: cover [85, 145, 305, 290]
    draw.rectangle([85, 145, 305, 290], fill=(239, 246, 255, 255))
    draw.text((90, 150), "步驟 1：確認是否有瓦斯", font=get_font(17), fill=(15, 23, 42, 255))
    draw.text((90, 185), "檢查瓦斯桶氣量與角閥開關", font=get_font(13, False), fill=(71, 85, 105, 255))
    draw.text((90, 215), "若無瓦斯請立即預約換桶", font=get_font(12, False), fill=(37, 99, 235, 255))

    # Cover "LPG" and "Low"
    draw.rectangle([95, 395, 145, 435], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [95, 395, 145, 435], "瓦斯", get_font(12), (51, 65, 85, 255))
    draw.rectangle([235, 355, 265, 380], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [235, 355, 265, 380], "殘量", get_font(10), (220, 38, 38, 255))

    # Step 2: cover [85, 555, 315, 690]
    draw.rectangle([85, 555, 315, 690], fill=(239, 246, 255, 255))
    draw.text((90, 560), "步驟 2：更換全新 1 號電池", font=get_font(17), fill=(15, 23, 42, 255))
    draw.text((90, 595), "取出熱水器底座電池盒", font=get_font(13, False), fill=(71, 85, 105, 255))
    draw.text((90, 625), "更換全新鹼性或碳鋅電池", font=get_font(12, False), fill=(37, 99, 235, 255))

    # Step 3: cover [740, 145, 915, 235]
    draw.rectangle([740, 145, 915, 235], fill=(239, 246, 255, 255))
    draw.text((745, 150), "步驟 3：確認瓦斯開關已開", font=get_font(17), fill=(15, 23, 42, 255))
    draw.text((745, 185), "確認管路凡而把手平行暢通", font=get_font(12, False), fill=(71, 85, 105, 255))

    # Step 4: cover [740, 405, 885, 615]
    draw.rectangle([740, 405, 885, 615], fill=(239, 246, 255, 255))
    draw.text((745, 410), "步驟 4：確認水壓推動微動開關", font=get_font(15), fill=(15, 23, 42, 255))
    draw.text((745, 445), "水流過小微動開關無法點火", font=get_font(12, False), fill=(71, 85, 105, 255))
    draw.text((745, 475), "調大水量或清除水龍頭水垢", font=get_font(11, False), fill=(37, 99, 235, 255))
    draw.text((745, 575), "蓮蓬頭水流暢通", font=get_font(11, False), fill=(5, 150, 105, 255))

    # Step 5: cover [740, 675, 915, 755]
    draw.rectangle([740, 675, 915, 755], fill=(239, 246, 255, 255))
    draw.text((745, 680), "步驟 5：檢查清洗進水濾網", font=get_font(17), fill=(15, 23, 42, 255))
    draw.text((745, 715), "旋開進水濾網排除泥沙雜質", font=get_font(12, False), fill=(71, 85, 105, 255))

    draw.rectangle([765, 865, 885, 925], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [765, 865, 885, 925], "旋開清洗泥沙", get_font(13), (5, 150, 105, 255))

    # Center bottom phone box [370, 665, 630, 750]
    draw.rounded_rectangle([370, 670, 630, 745], radius=12, fill=(254, 242, 242, 255), outline=(244, 63, 94, 255), width=2)
    draw_centered_text(draw, [370, 675, 630, 710], "💡 若測試後仍無法點著", get_font(14), (225, 29, 72, 255))
    draw_centered_text(draw, [370, 710, 630, 740], "請洽盛隆 02-2972-5559", get_font(14), (225, 29, 72, 255))

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

    # Top Title [140, 20, 860, 80]
    draw.rectangle([130, 15, 870, 80], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [130, 15, 870, 80], "瓦斯爐火焰判讀與爐底風門調節教學", get_font(28), (15, 23, 42, 255))

    # Left Section: Incomplete Combustion [90, 90, 450, 185]
    draw.rectangle([90, 90, 450, 185], fill=(254, 242, 242, 255))
    draw.text((95, 100), "❌ 燃燒不完全（紅黃火）", font=get_font(20), fill=(220, 38, 38, 255))
    draw.text((95, 140), "熱效率差・耗瓦斯・鍋底嚴重積碳燻黑", font=get_font(13, False), fill=(153, 27, 27, 255))

    # Left Pot & Flame Labels [80, 200, 240, 330] & [80, 400, 240, 520]
    draw.rectangle([80, 200, 240, 330], fill=(254, 242, 242, 255))
    draw.text((85, 210), "鍋底嚴重積碳", font=get_font(15), fill=(185, 28, 28, 255))
    draw.text((85, 245), "焦黑阻礙導熱", font=get_font(12, False), fill=(127, 29, 29, 255))
    draw.text((85, 275), "浪費燃氣費", font=get_font(12, False), fill=(127, 29, 29, 255))

    draw.rectangle([80, 400, 240, 520], fill=(254, 242, 242, 255))
    draw.text((85, 410), "紅火 / 黃火", font=get_font(18), fill=(220, 38, 38, 255))
    draw.text((85, 445), "空氣不足或快沒氣", font=get_font(12, False), fill=(127, 29, 29, 255))
    draw.text((85, 475), "燃燒不全游離碳", font=get_font(11, False), fill=(153, 27, 27, 255))

    # Right Section: Complete Combustion [580, 90, 940, 185]
    draw.rectangle([580, 90, 940, 185], fill=(239, 246, 255, 255))
    draw.text((585, 100), "✅ 完全燃燒（清澈藍火）", font=get_font(20), fill=(37, 99, 235, 255))
    draw.text((585, 140), "火力最強・導熱佳・鍋底乾淨無碳垢", font=get_font(13, False), fill=(29, 78, 216, 255))

    # Right Pot & Flame Labels [770, 200, 930, 330] & [770, 400, 930, 520]
    draw.rectangle([770, 200, 930, 330], fill=(239, 246, 255, 255))
    draw.text((775, 210), "鍋底乾淨不燒黑", font=get_font(15), fill=(29, 78, 216, 255))
    draw.text((775, 245), "受熱均勻熱效最高", font=get_font(12, False), fill=(30, 58, 138, 255))
    draw.text((775, 275), "最省瓦斯費用", font=get_font(12, False), fill=(30, 58, 138, 255))

    draw.rectangle([770, 400, 930, 520], fill=(239, 246, 255, 255))
    draw.text((775, 410), "清澈健康藍火", font=get_font(18), fill=(37, 99, 235, 255))
    draw.text((775, 445), "火力充沛無黑煙", font=get_font(12, False), fill=(30, 58, 138, 255))
    draw.text((775, 475), "熱量完全釋放", font=get_font(11, False), fill=(30, 58, 138, 255))

    # Bottom Damper Teaching [20, 580, 320, 740]
    draw.rounded_rectangle([20, 580, 320, 740], radius=16, fill=(37, 99, 235, 255))
    draw.text((30, 595), "🔧 爐底風門調節教學", font=get_font(20), fill=(255, 255, 255, 255))
    draw.text((30, 635), "撥動調節片，紅火變藍火！", font=get_font(14, False), fill=(224, 242, 254, 255))
    draw.text((30, 670), "盛隆專線 02-2972-5559", font=get_font(14), fill=(254, 240, 138, 255))
    draw.text((30, 705), "LINE 官方帳號: @350MZOGG", font=get_font(11, False), fill=(255, 255, 255, 255))

    # Diagram labels
    draw.rectangle([350, 620, 465, 655], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [350, 620, 465, 655], "爐心燃燒頭", get_font(13), (51, 65, 85, 255))

    draw.rectangle([625, 610, 740, 645], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [625, 610, 740, 645], "爐頭分火蓋", get_font(13), (51, 65, 85, 255))

    draw.rectangle([195, 775, 275, 805], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [195, 775, 275, 805], "瓦斯氣流", get_font(12), (234, 88, 12, 255))

    draw.rectangle([125, 920, 205, 955], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [125, 920, 205, 955], "瓦斯導管", get_font(12), (51, 65, 85, 255))

    draw.rectangle([385, 920, 485, 955], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [385, 920, 485, 955], "空氣文氏管", get_font(12), (51, 65, 85, 255))

    draw.rectangle([535, 910, 655, 955], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [535, 910, 655, 955], "風門調節片 (鐵片)", get_font(12), (37, 99, 235, 255))

    draw.rectangle([800, 785, 950, 855], fill=(241, 245, 249, 255))
    draw.text((805, 790), "進氣孔 (已撥開)", font=get_font(14), fill=(15, 23, 42, 255))
    draw.text((805, 820), "空氣與瓦斯均勻混合", font=get_font(12, False), fill=(71, 85, 105, 255))

    draw.rectangle([710, 875, 950, 940], fill=(255, 255, 255, 255))
    draw.text((715, 880), "👉 撥開風門片開大進氣量即可消除紅火！", font=get_font(14), fill=(37, 99, 235, 255))
    draw.text((715, 910), "若調整後仍紅火燻黑，請致電盛隆派員檢修", font=get_font(12, False), fill=(5, 150, 105, 255))

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

    # Top Title [140, 70, 950, 200]
    draw.rectangle([140, 70, 950, 200], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [140, 75, 950, 140], "天然氣 (NG) 與 桶裝瓦斯 (LPG) 規格與設備差異圖解", get_font(26), (15, 23, 42, 255))
    draw_centered_text(draw, [140, 145, 950, 195], "盛隆瓦斯專業安全指南 ｜ 門市電話 02-2972-5559 ｜ LINE: @350MZOGG", get_font(15, False), (71, 85, 105, 255))

    # Left (NG)
    draw.rectangle([260, 260, 385, 345], fill=(255, 255, 255, 255))
    draw.text((265, 270), "供氣低壓：", font=get_font(14), fill=(51, 65, 85, 255))
    draw.text((265, 300), "150~200 mmH2O", font=get_font(14), fill=(37, 99, 235, 255))

    draw.rectangle([120, 510, 295, 550], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [120, 510, 295, 550], "市區公共自來管線供氣", get_font(13), (71, 85, 105, 255))

    draw.rectangle([265, 795, 395, 870], fill=(255, 255, 255, 255))
    draw.text((270, 805), "噴嘴孔徑較大", font=get_font(15), fill=(37, 99, 235, 255))
    draw.text((270, 835), "天然氣專用設備", font=get_font(12, False), fill=(100, 116, 139, 255))

    # Center Warning Box
    draw.rectangle([455, 365, 545, 430], fill=(220, 38, 38, 255))
    draw_centered_text(draw, [455, 365, 545, 430], "嚴禁直插", get_font(20), (255, 255, 255, 255))

    draw.rectangle([415, 570, 585, 730], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [415, 575, 585, 605], "⚠️ 供壓與熱值完全不同！", get_font(12), (220, 38, 38, 255))
    draw_centered_text(draw, [415, 610, 585, 640], "天然氣爐具直接接桶裝", get_font(12), (220, 38, 38, 255))
    draw_centered_text(draw, [415, 645, 585, 675], "將產生巨大爆燃火焰！", get_font(12), (220, 38, 38, 255))
    draw_centered_text(draw, [415, 680, 585, 705], "必須由專業技師", get_font(12), (5, 150, 105, 255))
    draw_centered_text(draw, [415, 705, 585, 730], "更換專用噴嘴改機", get_font(12), (5, 150, 105, 255))

    # Right (LPG)
    draw.rectangle([620, 260, 710, 340], fill=(255, 255, 255, 255))
    draw.text((625, 270), "安全控壓：", font=get_font(14), fill=(51, 65, 85, 255))
    draw.text((625, 300), "R280 調整器", font=get_font(14), fill=(5, 150, 105, 255))

    draw.rectangle([615, 415, 710, 490], fill=(255, 255, 255, 255))
    draw.text((620, 420), "單位熱值極高", font=get_font(14), fill=(5, 150, 105, 255))
    draw.text((620, 450), "大火快炒鑊氣足", font=get_font(12, False), fill=(71, 85, 105, 255))

    # Cover "LPG" on cylinder [845, 405, 905, 455]
    draw.rectangle([845, 405, 905, 455], fill=(226, 232, 240, 255))
    draw_centered_text(draw, [845, 405, 905, 455], "盛隆", get_font(18), (37, 99, 235, 255))

    draw.rectangle([625, 860, 745, 930], fill=(255, 255, 255, 255))
    draw.text((630, 865), "噴嘴孔徑較小", font=get_font(15), fill=(5, 150, 105, 255))
    draw.text((630, 895), "桶裝專用設備", font=get_font(12, False), fill=(100, 116, 139, 255))

    draw.rectangle([765, 865, 970, 940], fill=(255, 255, 255, 255))
    draw.text((770, 875), "台灣標準反牙左旋開關閥", font=get_font(14), fill=(15, 23, 42, 255))
    draw.text((770, 905), "盛隆專線 02-2972-5559", font=get_font(13), fill=(37, 99, 235, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("5. Natural gas vs LPG localized OK")

if __name__ == '__main__':
    process_gas_leak()
    process_cylinder_sizes()
    process_heater()
    process_stove()
    process_natural_gas()
    print("ALL 5 INFOGRAPHICS RENDERED PERFECTLY!")
