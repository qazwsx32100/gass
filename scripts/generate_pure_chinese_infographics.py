import os
from PIL import Image, ImageDraw, ImageFont

font_bold = 'C:/Windows/Fonts/msjhbd.ttc'
font_reg = 'C:/Windows/Fonts/msjh.ttc'

def get_font(size, bold=True):
    try:
        return ImageFont.truetype(font_bold if bold else font_reg, size)
    except:
        return ImageFont.load_default()

def draw_centered_text(draw, box, text, font, fill):
    x1, y1, x2, y2 = box
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = x1 + (x2 - x1 - tw) // 2
    ty = y1 + (y2 - y1 - th) // 2
    draw.text((tx, ty), text, font=font, fill=fill)

def draw_left_text(draw, x, y, text, font, fill):
    draw.text((x, y), text, font=font, fill=fill)

# ==============================================================================
# 1. GAS LEAK SOP
# ==============================================================================
def process_gas_leak():
    print("Processing Gas Leak SOP...")
    backup = 'c:/Gass/website/images/gas-leak-sop.orig.jpg'
    out_path = 'c:/Gass/website/images/gas-leak-sop.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top title: covers x=[240, 1136], y=[50, 140]
    draw.rounded_rectangle([240, 50, 1136, 140], radius=20, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=3)
    draw.rounded_rectangle([248, 58, 1128, 132], radius=16, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [248, 58, 1128, 132], "盛隆瓦斯・瓦斯漏氣緊急應變 4 步驟 SOP", get_font(34), (255, 255, 255, 255))

    # Step 1
    draw.rounded_rectangle([75, 528, 365, 614], radius=16, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [75, 528, 365, 614], "順時針關閉桶閥開關", get_font(23), (255, 255, 255, 255))
    draw.rectangle([65, 624, 375, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [65, 624, 375, 685], "① 順時針緊閉鋼瓶角閥", get_font(20), (30, 41, 59, 255))

    # Step 2
    draw.rounded_rectangle([390, 528, 680, 614], radius=16, fill=(5, 150, 105, 255))
    draw_centered_text(draw, [390, 528, 680, 614], "輕輕推開窗戶自然通風", get_font(23), (255, 255, 255, 255))
    draw.rectangle([380, 624, 690, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [380, 624, 690, 685], "② 輕推開窗，瓦斯比空氣重", get_font(20), (30, 41, 59, 255))

    # Step 3
    draw.rounded_rectangle([705, 528, 995, 614], radius=16, fill=(220, 38, 38, 255))
    draw_centered_text(draw, [705, 528, 995, 614], "嚴禁開關任何電器", get_font(23), (255, 255, 255, 255))
    draw.rectangle([695, 624, 1005, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [695, 624, 1005, 685], "③ 禁開電燈電扇防電弧引爆", get_font(20), (30, 41, 59, 255))

    # Step 4: cover 911 on phone screen precisely [1215, 318, 1272, 348]
    draw.rectangle([1215, 318, 1272, 348], fill=(244, 246, 248, 255))
    draw_centered_text(draw, [1215, 318, 1272, 348], "119", get_font(20), (220, 38, 38, 255))

    draw.rounded_rectangle([1020, 528, 1310, 614], radius=16, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [1020, 528, 1310, 614], "疏散室外撥打電話求助", get_font(23), (255, 255, 255, 255))
    draw.rectangle([1010, 624, 1320, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [1010, 624, 1320, 685], "④ 致電盛隆 02-2972-5559", get_font(20), (30, 41, 59, 255))

    final_img = Image.alpha_composite(img, overlay).convert('RGB')
    final_img.save(out_path, quality=95)
    print("Gas Leak SOP saved.")

# ==============================================================================
# 2. CYLINDER SIZES COMPARISON
# ==============================================================================
def process_cylinder_sizes():
    print("Processing Cylinder Sizes Comparison...")
    backup = 'c:/Gass/website/images/cylinder-sizes-comparison.orig.jpg'
    out_path = 'c:/Gass/website/images/cylinder-sizes-comparison.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # 1. Top Title
    draw.rounded_rectangle([20, 30, 650, 160], radius=16, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=2)
    draw.rounded_rectangle([28, 38, 642, 152], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [28, 45, 642, 100], "台灣標準瓦斯鋼瓶各規格尺寸", get_font(32), (255, 255, 255, 255))
    draw_centered_text(draw, [28, 102, 642, 145], "全台家用與商用規格全覽對照圖", get_font(19), (224, 242, 254, 255))

    # 2. Card 1: 4kg (header [105, 200, 291, 258], body [105, 258, 291, 335])
    draw.rounded_rectangle([105, 200, 291, 258], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [105, 200, 291, 258], "4 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([105, 258, 291, 335], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [105, 262, 291, 298], "露營休閒 / 泡茶", get_font(16), (30, 41, 59, 255))
    draw_centered_text(draw, [105, 298, 291, 332], "極致輕巧好收納", get_font(15), (100, 116, 139, 255))

    # 3. Card 2: 10kg (header [354, 168, 537, 226], body [354, 226, 537, 303])
    draw.rounded_rectangle([354, 168, 537, 226], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [354, 168, 537, 226], "10 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([354, 226, 537, 303], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [354, 230, 537, 266], "1~2人租屋套房", get_font(16), (30, 41, 59, 255))
    draw_centered_text(draw, [354, 266, 537, 300], "窄流理台專用矮瓶", get_font(15), (100, 116, 139, 255))

    # 4. Card 3: 16kg (header [598, 138, 771, 195], body [598, 195, 771, 272])
    draw.rounded_rectangle([598, 138, 771, 195], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [598, 138, 771, 195], "16 公斤", get_font(22), (255, 255, 255, 255))
    # Green Star Badge [745, 108, 825, 187]
    draw.ellipse([745, 108, 825, 187], fill=(5, 150, 105, 255), outline=(255, 255, 255, 255), width=2)
    draw_centered_text(draw, [745, 116, 825, 150], "最熱門", get_font(16), (255, 255, 255, 255))
    draw_centered_text(draw, [745, 148, 825, 180], "★首選", get_font(15), (255, 255, 255, 255))
    # Body
    draw.rounded_rectangle([598, 195, 771, 272], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [598, 199, 771, 235], "標準家庭・主力", get_font(16), (30, 41, 59, 255))
    draw_centered_text(draw, [598, 235, 771, 269], "熱水器與廚房首選", get_font(15), (100, 116, 139, 255))

    # 5. Card 4: 20kg (header [847, 118, 1030, 175], body [847, 175, 1030, 252])
    draw.rounded_rectangle([847, 118, 1030, 175], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [847, 118, 1030, 175], "20 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([847, 175, 1030, 252], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [847, 179, 1030, 215], "大家庭 / 小吃店", get_font(16), (30, 41, 59, 255))
    draw_centered_text(draw, [847, 215, 1030, 249], "快速爐熱炒大火力", get_font(15), (100, 116, 139, 255))

    # 6. Card 5: 50kg (header [1094, 40, 1278, 96], body [1094, 96, 1278, 180])
    draw.rounded_rectangle([1094, 40, 1278, 96], radius=8, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [1094, 40, 1278, 96], "50 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([1094, 96, 1278, 180], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [1094, 102, 1278, 138], "中央廚房 / 餐廳", get_font(16), (30, 41, 59, 255))
    draw_centered_text(draw, [1094, 138, 1278, 174], "多管並聯營業大戶", get_font(15), (100, 116, 139, 255))

    # 7. Bottom Table Clean Overlay (Cover y=[520, 740])
    draw.rectangle([0, 520, 1376, 740], fill=(248, 250, 252, 255))
    
    # Left header column [10, 525, 100, 735]
    draw.rounded_rectangle([10, 525, 100, 735], radius=8, fill=(241, 245, 249, 255), outline=(226, 232, 240, 255))
    draw_centered_text(draw, [10, 530, 100, 565], "規格容量", get_font(16), (71, 85, 105, 255))
    draw_centered_text(draw, [10, 570, 100, 605], "鋼瓶高度", get_font(16), (71, 85, 105, 255))
    draw_centered_text(draw, [10, 610, 100, 645], "鋼瓶直徑", get_font(16), (71, 85, 105, 255))
    draw_centered_text(draw, [10, 655, 100, 725], "適用情境", get_font(16), (71, 85, 105, 255))

    # Columns definitions
    cols = [
        (105, 340, "4 公斤", "高約 42 cm", "直徑約 25 cm", "露營休閒 / 泡茶小爐", "單身獨立極低用量", False),
        (350, 580, "10 公斤", "高約 55 cm", "直徑約 30 cm", "1~2人小家庭・租屋", "矮流理台櫥櫃專用空間", False),
        (590, 825, "16 公斤 ★首選", "高約 68 cm", "直徑約 31 cm", "1~3人標準家庭・首選", "熱水器與廚房日常主力", True),
        (835, 1070, "20 公斤", "高約 75 cm", "直徑約 31 cm", "高用量家庭 / 餐廳小吃", "營業熱炒・快速爐必備", False),
        (1080, 1365, "50 公斤", "高約 125 cm", "直徑約 37 cm", "連鎖餐飲大戶 / 中央廚房", "工廠供氣・需場勘安裝", False)
    ]

    for (x1, x2, cap, h, d, s1, s2, is_top) in cols:
        bg = (239, 246, 255, 255) if is_top else (255, 255, 255, 255)
        border = (37, 99, 235, 255) if is_top else (226, 232, 240, 255)
        draw.rounded_rectangle([x1, 525, x2, 735], radius=10, fill=bg, outline=border, width=2 if is_top else 1)
        
        # Row 1: Cap
        draw_centered_text(draw, [x1, 530, x2, 565], cap, get_font(20), (37, 99, 235, 255) if is_top else (15, 23, 42, 255))
        draw.line([x1+10, 568, x2-10, 568], fill=(226, 232, 240, 255))
        # Row 2: Height
        draw_centered_text(draw, [x1, 570, x2, 605], h, get_font(16), (5, 150, 105, 255) if is_top else (51, 65, 85, 255))
        draw.line([x1+10, 608, x2-10, 608], fill=(226, 232, 240, 255))
        # Row 3: Dia
        draw_centered_text(draw, [x1, 610, x2, 645], d, get_font(15), (71, 85, 105, 255))
        draw.line([x1+10, 648, x2-10, 648], fill=(226, 232, 240, 255))
        # Row 4: Usage
        draw_centered_text(draw, [x1, 655, x2, 690], s1, get_font(15), (30, 41, 59, 255))
        draw_centered_text(draw, [x1, 690, x2, 725], s2, get_font(14), (100, 116, 139, 255))

    # 8. Bottom Footer overlay [0, 740, 1376, 768]
    draw.rectangle([0, 740, 1376, 768], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [0, 740, 1376, 768], "盛隆瓦斯全規格鋼瓶均合格檢驗附鋁牌 ｜ 尺寸不確定？拍照傳 LINE: @350MZOGG 專人協助 ｜ 門市電話 02-2972-5559", get_font(15), (71, 85, 105, 255))

    final_img = Image.alpha_composite(img, overlay).convert('RGB')
    final_img.save(out_path, quality=95)
    print("Cylinder Sizes Comparison saved.")

# ==============================================================================
# 3. HEATER TROUBLESHOOT
# ==============================================================================
def process_heater_troubleshoot():
    print("Processing Heater Troubleshoot Guide...")
    backup = 'c:/Gass/website/images/heater-troubleshoot.orig.jpg'
    out_path = 'c:/Gass/website/images/heater-troubleshoot.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # Top banner left [0, 0, 950, 108]
    draw.rectangle([0, 0, 950, 108], fill=(37, 99, 235, 255))
    draw_centered_text(draw, [0, 0, 950, 108], "瓦斯熱水器點不著・洗澡沒熱水 5 步排查圖解", get_font(34), (255, 255, 255, 255))
    
    # Top banner right [950, 0, 1376, 108]
    draw.rectangle([950, 0, 1376, 108], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [950, 0, 1376, 108], "盛隆居家安全自我排查 5 步驟", get_font(24), (30, 41, 59, 255))

    # Step 1: Left Top [115, 110, 420, 245]
    draw.rectangle([115, 110, 420, 245], fill=(240, 248, 252, 255))
    draw_left_text(draw, 120, 112, "步驟 1：確認是否有瓦斯", get_font(22), (15, 23, 42, 255))
    draw_left_text(draw, 120, 146, "檢查桶裝瓦斯存量與角閥開關", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 120, 178, "若無瓦斯請立即預約換桶", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 120, 210, "盛隆專線 02-2972-5559", get_font(16), (37, 99, 235, 255))

    # Cylinder "LPG" label [125, 305, 195, 355]
    draw.rectangle([125, 305, 195, 355], fill=(210, 218, 224, 255))
    draw_centered_text(draw, [125, 305, 195, 355], "瓦斯", get_font(18), (71, 85, 105, 255))

    # Gauge "Low" label [310, 268, 370, 295]
    draw.rectangle([310, 268, 370, 295], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [310, 268, 370, 295], "殘量", get_font(14), (220, 38, 38, 255))

    # Step 2: Left Bottom [115, 420, 420, 555]
    draw.rectangle([115, 420, 420, 555], fill=(240, 248, 252, 255))
    draw_left_text(draw, 120, 424, "步驟 2：更換全新 1 號電池", get_font(22), (15, 23, 42, 255))
    draw_left_text(draw, 120, 458, "取出熱水器底座電池盒更換", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 120, 488, "推薦使用全新大電量鹼性電池", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 120, 518, "注意正負極方向安裝正確", get_font(16), (37, 99, 235, 255))

    # Step 3: Right Top [1015, 110, 1345, 195]
    draw.rectangle([1015, 110, 1345, 195], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 112, "步驟 3：確認瓦斯開關開啟", get_font(22), (15, 23, 42, 255))
    draw_left_text(draw, 1020, 144, "確認管路凡而把手平行暢通", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 1020, 170, "角閥旋鈕逆時針完全開啟", get_font(15), (71, 85, 105, 255))

    # Step 4: Right Middle - strictly x <= 1210 to avoid showerhead curve
    draw.rectangle([1015, 305, 1210, 405], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 308, "步驟 4：確認水壓水量足夠", get_font(22), (15, 23, 42, 255))
    draw_left_text(draw, 1020, 340, "水流過小微動開關無法點火", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 1020, 368, "調大進水量或清除龍頭水垢", get_font(15), (71, 85, 105, 255))

    # Step 4: Subtitle below gauge [1015, 435, 1240, 480]
    draw.rectangle([1015, 435, 1240, 480], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 445, "檢查家中蓮蓬頭出水水壓", get_font(16), (71, 85, 105, 255))

    # Step 5: Right Bottom - strictly y <= 588 to stay above curved green arrow
    draw.rectangle([1015, 510, 1260, 588], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 512, "步驟 5：清洗冷熱水濾網", get_font(22), (15, 23, 42, 255))
    draw_left_text(draw, 1020, 542, "旋開進水濾網清除泥沙雜質", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 1020, 567, "避免泥沙堵塞阻礙水流啟動", get_font(15), (71, 85, 105, 255))

    # Step 5: Below filter [1020, 660, 1260, 725]
    draw.rectangle([1020, 660, 1260, 725], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1025, 665, "旋開濾網", get_font(16), (15, 23, 42, 255))
    draw_left_text(draw, 1125, 665, "清水沖洗", get_font(16), (15, 23, 42, 255))
    draw_left_text(draw, 1025, 695, "清除水垢泥沙與鐵屑", get_font(15), (100, 116, 139, 255))

    # Bottom valve arrow "OPEN" [540, 660, 625, 705]
    draw.rectangle([540, 660, 625, 705], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [540, 660, 625, 705], "開啟", get_font(18), (15, 23, 42, 255))

    # Bottom Contact Bar [340, 712, 980, 760]
    draw.rounded_rectangle([340, 712, 980, 760], radius=8, fill=(255, 255, 255, 255), outline=(220, 38, 38, 255), width=2)
    draw_centered_text(draw, [340, 712, 980, 760], "【安全提醒】測試後若仍無法點著，請致電盛隆協助：02-2972-5559", get_font(17), (220, 38, 38, 255))

    final_img = Image.alpha_composite(img, overlay).convert('RGB')
    final_img.save(out_path, quality=95)
    print("Heater Troubleshoot Guide saved.")

# ==============================================================================
# 4. STOVE FLAME DAMPER
# ==============================================================================
def process_stove_flame_damper():
    print("Processing Stove Flame Damper...")
    backup = 'c:/Gass/website/images/stove-flame-damper.orig.jpg'
    out_path = 'c:/Gass/website/images/stove-flame-damper.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    PEACH_BG = (252, 223, 209, 255)
    LIGHT_BLUE_BG = (235, 243, 245, 255)
    PANEL_BG = (225, 240, 250, 255)

    # 1. Top Title (pure white area [0, 0, 1376, 85])
    draw.rectangle([50, 0, 1326, 85], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [50, 12, 1326, 75], "瓦斯爐火焰判讀與爐底風門調節教學", get_font(36), (30, 41, 59, 255))

    # 2. Left Header [115, 80, 660, 160] (peach background)
    draw.rectangle([115, 80, 660, 160], fill=PEACH_BG)
    draw_left_text(draw, 130, 86, "燃燒不完全（紅黃火）", get_font(24), (220, 38, 38, 255))
    draw_left_text(draw, 130, 124, "熱效率差・耗瓦斯・鍋底積碳燻黑", get_font(16), (100, 116, 139, 255))

    # Wipe all old English text on left: strictly x in [25, 330], y in [160, 440]
    draw.rectangle([25, 160, 330, 440], fill=PEACH_BG)

    # Left Body (Pure solid peach area, completely clear of pot and stove):
    # Upper: Soot
    draw_left_text(draw, 35, 175, "鍋底積碳焦黑", get_font(22), (15, 23, 42, 255))
    draw_left_text(draw, 35, 212, "• 阻礙熱傳導 ｜ 浪費瓦斯", get_font(16), (220, 38, 38, 255))
    draw_left_text(draw, 35, 242, "• 鍋底厚黑垢極難刷洗", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 35, 272, "• 空氣不足燃燒不完全", get_font(15), (100, 116, 139, 255))

    # Indicator arrow towards pot bottom
    draw.line([250, 253, 315, 253], fill=(185, 28, 28, 255), width=2)
    draw.polygon([(315, 249), (323, 253), (315, 257)], fill=(185, 28, 28, 255))

    # Lower: Red Flame
    draw_left_text(draw, 35, 320, "紅火 / 黃火", get_font(24), (220, 38, 38, 255))
    draw_left_text(draw, 35, 356, "• 空氣不足 或 瓦斯快用盡", get_font(16), (15, 23, 42, 255))
    draw_left_text(draw, 35, 384, "• 燃燒不全游離碳冒黑煙", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 35, 412, "• 需調大爐底進氣風門片", get_font(16), (220, 38, 38, 255))

    # Indicator arrow towards flame
    draw.line([235, 395, 305, 395], fill=(220, 38, 38, 255), width=2)
    draw.polygon([(305, 391), (313, 395), (305, 399)], fill=(220, 38, 38, 255))

    # 3. Right Header [780, 80, 1320, 160] (light blue background)
    draw.rectangle([780, 80, 1320, 160], fill=LIGHT_BLUE_BG)
    draw_left_text(draw, 795, 86, "完全燃燒（清澈藍火）", get_font(24), (37, 99, 235, 255))
    draw_left_text(draw, 795, 124, "火力最強・導熱佳・鍋底乾淨無碳垢", get_font(16), (100, 116, 139, 255))

    # Wipe all old English text on right: x in [1050, 1348], y in [160, 440]
    draw.rectangle([1050, 160, 1348, 440], fill=LIGHT_BLUE_BG)
    draw.rectangle([1010, 245, 1060, 265], fill=LIGHT_BLUE_BG)
    draw.rectangle([1010, 370, 1060, 395], fill=LIGHT_BLUE_BG)

    # Right Body (Pure solid light blue area, completely clear of pot and stove):
    # Upper: Clean Pot
    draw_left_text(draw, 1065, 175, "鍋底乾淨不燒黑", get_font(22), (15, 23, 42, 255))
    draw_left_text(draw, 1065, 212, "• 受熱均勻 ｜ 熱效率最高", get_font(16), (5, 150, 105, 255))
    draw_left_text(draw, 1065, 242, "• 大幅節省燃氣瓦斯費用", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 1065, 272, "• 鍋具光亮潔淨好沖洗", get_font(15), (100, 116, 139, 255))

    # Indicator arrow from pot bottom towards text
    draw.line([1015, 253, 1055, 253], fill=(5, 150, 105, 255), width=2)
    draw.polygon([(1015, 249), (1007, 253), (1015, 257)], fill=(5, 150, 105, 255))

    # Lower: Blue Flame
    draw_left_text(draw, 1065, 320, "清澈健康藍火", get_font(24), (37, 99, 235, 255))
    draw_left_text(draw, 1065, 356, "• 火力充沛 ｜ 無黑煙無異味", get_font(16), (15, 23, 42, 255))
    draw_left_text(draw, 1065, 384, "• 熱量完全釋放達極高溫", get_font(16), (71, 85, 105, 255))
    draw_left_text(draw, 1065, 412, "• 最佳空氣配比完全燃燒", get_font(16), (5, 150, 105, 255))

    # Indicator arrow towards blue flame
    draw.line([1020, 395, 1055, 395], fill=(37, 99, 235, 255), width=2)
    draw.polygon([(1020, 391), (1012, 395), (1020, 399)], fill=(37, 99, 235, 255))

    # 4. Bottom Section
    # Left Blue Box [25, 450, 440, 570] (solid dark blue card)
    draw.rounded_rectangle([25, 450, 440, 570], radius=12, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [25, 456, 440, 492], "爐底風門調節教學", get_font(24), (255, 255, 255, 255))
    draw_centered_text(draw, [25, 495, 440, 522], "撥動調節片，紅火立刻變藍火！", get_font(16), (224, 242, 254, 255))
    draw_centered_text(draw, [25, 526, 440, 548], "若調整後仍為紅火，盛隆派員專業檢修", get_font(14), (253, 224, 71, 255))
    draw_centered_text(draw, [25, 548, 440, 566], "服務專線 02-2972-5559 ｜ LINE: @350MZOGG", get_font(13), (253, 224, 71, 255))

    # Component Labels - Clean exact original English positions with clean pill styling:
    # 1. Left burner: [470, 480, 640, 516]
    draw.rounded_rectangle([470, 480, 640, 516], radius=6, fill=PANEL_BG, outline=(191, 219, 254, 255))
    draw_centered_text(draw, [470, 480, 640, 516], "爐心燃燒頭", get_font(15), (15, 23, 42, 255))

    # 2. Right burner: [850, 470, 1020, 506]
    draw.rounded_rectangle([850, 470, 1020, 506], radius=6, fill=PANEL_BG, outline=(191, 219, 254, 255))
    draw_centered_text(draw, [850, 470, 1020, 506], "爐頭分火蓋", get_font(15), (15, 23, 42, 255))

    # 3. Gas flow (top pipe): [250, 595, 380, 632]
    draw.rounded_rectangle([250, 595, 380, 632], radius=6, fill=PANEL_BG, outline=(191, 219, 254, 255))
    draw_centered_text(draw, [250, 595, 380, 632], "瓦斯氣流", get_font(15), (15, 23, 42, 255))

    # 4. Bottom row:
    # Gas pipe: [150, 708, 290, 746]
    draw.rounded_rectangle([150, 708, 290, 746], radius=6, fill=PANEL_BG, outline=(191, 219, 254, 255))
    draw_centered_text(draw, [150, 708, 290, 746], "瓦斯進氣管", get_font(15), (15, 23, 42, 255))

    # Gas flow: [340, 708, 480, 746]
    draw.rounded_rectangle([340, 708, 480, 746], radius=6, fill=PANEL_BG, outline=(191, 219, 254, 255))
    draw_centered_text(draw, [340, 708, 480, 746], "瓦斯流向", get_font(15), (15, 23, 42, 255))

    # Venturi tube: [510, 712, 680, 750]
    draw.rounded_rectangle([510, 712, 680, 750], radius=6, fill=PANEL_BG, outline=(191, 219, 254, 255))
    draw_centered_text(draw, [510, 712, 680, 750], "文氏混合管", get_font(15), (15, 23, 42, 255))

    # Damper plate: [710, 705, 930, 750]
    draw.rounded_rectangle([710, 705, 930, 750], radius=6, fill=PANEL_BG, outline=(191, 219, 254, 255))
    draw_centered_text(draw, [710, 705, 930, 750], "空氣調節風門片", get_font(15), (15, 23, 42, 255))

    # Bottom Right Mechanism Area - ZERO OBSTRUCTION:
    # 1. Clean old English text beside openings [1080, 560, 1348, 665]
    draw.rectangle([1080, 560, 1348, 665], fill=PANEL_BG)

    # 2. Clean old English text along bottom [950, 675, 1348, 750]
    draw.rectangle([950, 675, 1348, 750], fill=PANEL_BG)

    # Chinese explanations in solid light blue area:
    draw_left_text(draw, 1100, 570, "進氣調節孔（已開啟）", get_font(18), (15, 23, 42, 255))
    draw_left_text(draw, 1100, 602, "瓦斯與空氣均勻預混", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 1100, 630, "達到最佳空燃比完全燃燒", get_font(15), (37, 99, 235, 255))

    # Pointer arrow pointing left to damper holes
    draw.line([1060, 582, 1090, 582], fill=(37, 99, 235, 255), width=2)
    draw.polygon([(1060, 578), (1052, 582), (1060, 586)], fill=(37, 99, 235, 255))

    # Bottom instruction below arrow
    draw_left_text(draw, 960, 685, "撥動風門調節片：增加進氣量即可消除紅火", get_font(18), (37, 99, 235, 255))
    draw_left_text(draw, 960, 715, "（若火苗跳動或離焰，微調關小風門即可恢復穩定）", get_font(14), (100, 116, 139, 255))

    final_img = Image.alpha_composite(img, overlay).convert('RGB')
    final_img.save(out_path, quality=95)
    print("Stove Flame Damper saved.")

# ==============================================================================
# 5. NATURAL VS LPG GAS
# ==============================================================================
def process_natural_vs_lpg():
    print("Processing Natural Gas vs LPG...")
    backup = 'c:/Gass/website/images/natural-vs-lpg-gas.orig.jpg'
    out_path = 'c:/Gass/website/images/natural-vs-lpg-gas.jpg'
    
    img = Image.open(backup).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    # 1. Top Title [100, 50, 1300, 180]
    draw.rectangle([100, 50, 1300, 180], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [100, 60, 1300, 125], "天然瓦斯 (NG) 與 桶裝瓦斯 (LPG) 規格與設備差異圖解", get_font(34), (30, 41, 59, 255))
    draw_centered_text(draw, [100, 130, 1300, 175], "盛隆瓦斯專業安全指南 ｜ 門市電話 02-2972-5559 ｜ LINE: @350MZOGG", get_font(18), (100, 116, 139, 255))

    # 2. Left Side (Natural Gas)
    # Low pressure [300, 200, 555, 285]
    draw.rectangle([300, 200, 555, 285], fill=(255, 255, 255, 255))
    draw_left_text(draw, 305, 208, "天然瓦斯 (NG)", get_font(22), (37, 99, 235, 255))
    draw_left_text(draw, 305, 244, "市區供氣低壓: 150~200 mmH2O", get_font(16), (71, 85, 105, 255))

    # Pipeline [120, 390, 440, 440]
    draw.rectangle([120, 390, 440, 440], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [120, 390, 440, 440], "市區自來管線集中供氣", get_font(20), (15, 23, 42, 255))

    # Large orifice [330, 605, 555, 675]
    draw.rectangle([330, 605, 555, 675], fill=(255, 255, 255, 255))
    draw_left_text(draw, 335, 610, "噴嘴孔徑較大", get_font(20), (37, 99, 235, 255))
    draw_left_text(draw, 335, 642, "天然氣專用燃氣規格", get_font(15), (100, 116, 139, 255))

    # 3. Center STOP Sign & Warning Card
    # Patch exact STOP letters inside octagon [618, 263, 756, 331] with exact octagon red (217, 13, 22)
    # This preserves both the original octagon border and the red warning triangle below it!
    draw.rectangle([618, 263, 756, 331], fill=(217, 13, 22, 255))
    draw_centered_text(draw, [618, 260, 756, 330], "停！", get_font(42), (255, 255, 255, 255))

    # Center card warning body: covers [568, 422, 807, 578] strictly inside card below the triangle (y=419)
    draw.rectangle([568, 422, 807, 578], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [568, 424, 807, 454], "嚴禁私自混接！", get_font(22), (220, 38, 38, 255))
    draw_centered_text(draw, [568, 456, 807, 482], "供壓與熱值完全不同", get_font(16), (220, 38, 38, 255))
    draw_centered_text(draw, [568, 484, 807, 510], "天然氣爐具直接接桶裝", get_font(16), (15, 23, 42, 255))
    draw_centered_text(draw, [568, 512, 807, 538], "將產生巨大爆燃極危險！", get_font(16), (220, 38, 38, 255))
    draw.line([585, 543, 790, 543], fill=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [568, 548, 807, 576], "須由合格技術士改機換噴嘴", get_font(15), (5, 150, 105, 255))

    # 4. Right Side (LPG)
    # High pressure [830, 200, 1060, 285]
    draw.rectangle([830, 200, 1060, 285], fill=(255, 255, 255, 255))
    draw_left_text(draw, 835, 208, "桶裝瓦斯 (LPG)", get_font(22), (5, 150, 105, 255))
    draw_left_text(draw, 835, 244, "安全標準控壓: R280 調整器", get_font(16), (71, 85, 105, 255))

    # High energy density [830, 320, 1050, 395]
    draw.rectangle([830, 320, 1050, 395], fill=(255, 255, 255, 255))
    draw_left_text(draw, 835, 326, "單位熱值極高", get_font(20), (5, 150, 105, 255))
    draw_left_text(draw, 835, 360, "大火快炒鑊氣足・加熱迅捷", get_font(16), (71, 85, 105, 255))

    # Cylinder label "LPG" [1155, 300, 1255, 355]
    draw.rectangle([1155, 300, 1255, 355], fill=(205, 230, 242, 255))
    draw_centered_text(draw, [1155, 300, 1255, 355], "瓦斯", get_font(22), (71, 85, 105, 255))

    # Smaller orifice [830, 660, 1040, 730]
    draw.rectangle([830, 660, 1040, 730], fill=(255, 255, 255, 255))
    draw_left_text(draw, 835, 665, "噴嘴孔徑較小", get_font(20), (5, 150, 105, 255))
    draw_left_text(draw, 835, 698, "桶裝高壓專用設備", get_font(15), (100, 116, 139, 255))

    # Reverse thread left-hand screw valve [1040, 665, 1360, 730]
    draw.rectangle([1040, 665, 1360, 730], fill=(255, 255, 255, 255))
    draw_left_text(draw, 1045, 668, "台灣標準反牙左旋角閥", get_font(19), (15, 23, 42, 255))
    draw_left_text(draw, 1045, 700, "盛隆專線 02-2972-5559 ｜ LINE: @350MZOGG", get_font(14), (37, 99, 235, 255))

    final_img = Image.alpha_composite(img, overlay).convert('RGB')
    final_img.save(out_path, quality=95)
    print("Natural Gas vs LPG saved.")

if __name__ == '__main__':
    process_gas_leak()
    process_cylinder_sizes()
    process_heater_troubleshoot()
    process_stove_flame_damper()
    process_natural_vs_lpg()
    print("All 5 infographics rendered successfully!")
