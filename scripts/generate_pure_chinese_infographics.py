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

    # Step 4: cover 911 on phone screen precisely [1215, 318, 1272, 348]
    draw.rectangle([1215, 318, 1272, 348], fill=(244, 246, 248, 255))
    draw_centered_text(draw, [1215, 318, 1272, 348], "119", get_font(18), (220, 38, 38, 255))

    draw.rounded_rectangle([1020, 528, 1310, 614], radius=16, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [1020, 528, 1310, 614], "疏散室外撥打電話求助", get_font(22), (255, 255, 255, 255))
    draw.rectangle([1010, 624, 1320, 685], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [1010, 624, 1320, 685], "④ 致電盛隆 02-2972-5559", get_font(18), (30, 41, 59, 255))

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

    # 1. Top Title (Replace "STANDARD TAIWANESE LPG GAS CYLINDER COMPARISON")
    draw.rounded_rectangle([20, 30, 650, 160], radius=16, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=2)
    draw.rounded_rectangle([28, 38, 642, 152], radius=12, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [28, 45, 642, 100], "台灣標準瓦斯鋼瓶各規格尺寸", get_font(30), (255, 255, 255, 255))
    draw_centered_text(draw, [28, 102, 642, 145], "全台家用與商用規格全覽對照圖", get_font(18), (224, 242, 254, 255))

    # 2. Card 1: 4kg (header [105, 200, 291, 258], body [105, 258, 291, 335])
    draw.rounded_rectangle([105, 200, 291, 258], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [105, 200, 291, 258], "4 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([105, 258, 291, 335], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [105, 262, 291, 298], "露營休閒 / 泡茶", get_font(15), (30, 41, 59, 255))
    draw_centered_text(draw, [105, 298, 291, 332], "極致輕巧好收納", get_font(14), (100, 116, 139, 255))

    # 3. Card 2: 10kg (header [354, 168, 537, 226], body [354, 226, 537, 303])
    draw.rounded_rectangle([354, 168, 537, 226], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [354, 168, 537, 226], "10 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([354, 226, 537, 303], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [354, 230, 537, 266], "1~2人租屋套房", get_font(15), (30, 41, 59, 255))
    draw_centered_text(draw, [354, 266, 537, 300], "窄流理台專用矮瓶", get_font(14), (100, 116, 139, 255))

    # 4. Card 3: 16kg (header [598, 138, 771, 195], body [598, 195, 771, 272])
    draw.rounded_rectangle([598, 138, 771, 195], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [598, 138, 771, 195], "16 公斤", get_font(22), (255, 255, 255, 255))
    # Green Star Badge [745, 108, 825, 187]
    draw.ellipse([745, 108, 825, 187], fill=(5, 150, 105, 255), outline=(255, 255, 255, 255), width=2)
    draw_centered_text(draw, [745, 116, 825, 150], "最熱門", get_font(16), (255, 255, 255, 255))
    draw_centered_text(draw, [745, 148, 825, 180], "★首選", get_font(15), (255, 255, 255, 255))
    # Body
    draw.rounded_rectangle([598, 195, 771, 272], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [598, 199, 771, 235], "標準家庭・主力", get_font(15), (30, 41, 59, 255))
    draw_centered_text(draw, [598, 235, 771, 269], "熱水器與廚房首選", get_font(14), (100, 116, 139, 255))

    # 5. Card 4: 20kg (header [847, 118, 1030, 175], body [847, 175, 1030, 252])
    draw.rounded_rectangle([847, 118, 1030, 175], radius=8, fill=(37, 99, 235, 255))
    draw_centered_text(draw, [847, 118, 1030, 175], "20 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([847, 175, 1030, 252], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [847, 179, 1030, 215], "大家庭 / 小吃店", get_font(15), (30, 41, 59, 255))
    draw_centered_text(draw, [847, 215, 1030, 249], "快速爐熱炒大火力", get_font(14), (100, 116, 139, 255))

    # 6. Card 5: 50kg (header [1094, 40, 1278, 96], body [1094, 96, 1278, 180])
    draw.rounded_rectangle([1094, 40, 1278, 96], radius=8, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [1094, 40, 1278, 96], "50 公斤", get_font(22), (255, 255, 255, 255))
    draw.rounded_rectangle([1094, 96, 1278, 180], radius=6, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=1)
    draw_centered_text(draw, [1094, 102, 1278, 138], "中央廚房 / 餐廳", get_font(15), (30, 41, 59, 255))
    draw_centered_text(draw, [1094, 138, 1278, 174], "多管並聯營業大戶", get_font(14), (100, 116, 139, 255))

    # 7. Bottom Table Clean Overlay (Cover y=[520, 740])
    draw.rectangle([0, 520, 1376, 740], fill=(248, 250, 252, 255))
    
    # Left header column [10, 525, 100, 735]
    draw.rounded_rectangle([10, 525, 100, 735], radius=8, fill=(241, 245, 249, 255), outline=(226, 232, 240, 255))
    draw_centered_text(draw, [10, 530, 100, 565], "規格容量", get_font(14), (71, 85, 105, 255))
    draw_centered_text(draw, [10, 570, 100, 605], "鋼瓶高度", get_font(14), (71, 85, 105, 255))
    draw_centered_text(draw, [10, 610, 100, 645], "鋼瓶直徑", get_font(14), (71, 85, 105, 255))
    draw_centered_text(draw, [10, 655, 100, 725], "適用情境", get_font(14), (71, 85, 105, 255))

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
        draw_centered_text(draw, [x1, 530, x2, 565], cap, get_font(18), (37, 99, 235, 255) if is_top else (15, 23, 42, 255))
        draw.line([x1+10, 568, x2-10, 568], fill=(226, 232, 240, 255))
        # Row 2: Height
        draw_centered_text(draw, [x1, 570, x2, 605], h, get_font(15), (5, 150, 105, 255) if is_top else (51, 65, 85, 255))
        draw.line([x1+10, 608, x2-10, 608], fill=(226, 232, 240, 255))
        # Row 3: Dia
        draw_centered_text(draw, [x1, 610, x2, 645], d, get_font(14), (71, 85, 105, 255))
        draw.line([x1+10, 648, x2-10, 648], fill=(226, 232, 240, 255))
        # Row 4: Usage
        draw_centered_text(draw, [x1, 655, x2, 690], s1, get_font(13), (30, 41, 59, 255))
        draw_centered_text(draw, [x1, 690, x2, 725], s2, get_font(12), (100, 116, 139, 255))

    # 8. Bottom Footer overlay [0, 740, 1376, 768]
    draw.rectangle([0, 740, 1376, 768], fill=(241, 245, 249, 255))
    draw_centered_text(draw, [0, 740, 1376, 768], "盛隆瓦斯全規格鋼瓶均合格檢驗附鋁牌 ｜ 尺寸不確定？拍照傳 LINE: @350MZOGG 專人協助 ｜ 門市電話 02-2972-5559", get_font(14), (71, 85, 105, 255))

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

    # Step 1: Left Top [115, 110, 420, 235]
    draw.rectangle([115, 110, 420, 235], fill=(240, 248, 252, 255))
    draw_left_text(draw, 120, 112, "步驟 1：確認是否有瓦斯", get_font(20), (15, 23, 42, 255))
    draw_left_text(draw, 120, 145, "檢查桶裝瓦斯存量與角閥開關", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 120, 175, "若無瓦斯請立即預約換桶", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 120, 205, "盛隆專線 02-2972-5559", get_font(15), (37, 99, 235, 255))

    # Cylinder "LPG" label [125, 305, 195, 355]
    draw.rectangle([125, 305, 195, 355], fill=(210, 218, 224, 255))
    draw_centered_text(draw, [125, 305, 195, 355], "瓦斯", get_font(18), (71, 85, 105, 255))

    # Gauge "Low" label [310, 268, 370, 295]
    draw.rectangle([310, 268, 370, 295], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [310, 268, 370, 295], "殘量", get_font(13), (220, 38, 38, 255))

    # Step 2: Left Bottom [115, 425, 420, 545]
    draw.rectangle([115, 425, 420, 545], fill=(240, 248, 252, 255))
    draw_left_text(draw, 120, 428, "步驟 2：更換全新 1 號電池", get_font(20), (15, 23, 42, 255))
    draw_left_text(draw, 120, 462, "取出熱水器底座電池盒更換", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 120, 490, "推薦使用全新大電量鹼性電池", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 120, 518, "注意正負極方向安裝正確", get_font(15), (37, 99, 235, 255))

    # Step 3: Right Top [1015, 110, 1335, 185]
    draw.rectangle([1015, 110, 1335, 185], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 112, "步驟 3：確認瓦斯開關開啟", get_font(20), (15, 23, 42, 255))
    draw_left_text(draw, 1020, 142, "確認管路凡而把手平行暢通", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 1020, 165, "角閥旋鈕逆時針完全開啟", get_font(14), (71, 85, 105, 255))

    # Step 4: Right Middle [1015, 305, 1240, 400]
    draw.rectangle([1015, 305, 1240, 400], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 308, "步驟 4：確認水壓水量足夠", get_font(20), (15, 23, 42, 255))
    draw_left_text(draw, 1020, 338, "水流過小微動開關無法點火", get_font(14), (71, 85, 105, 255))
    draw_left_text(draw, 1020, 365, "調大進水量或清除龍頭水垢", get_font(14), (71, 85, 105, 255))

    # Step 4: Subtitle below gauge [1015, 435, 1260, 480]
    draw.rectangle([1015, 435, 1260, 480], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 445, "檢查家中蓮蓬頭出水水壓", get_font(15), (71, 85, 105, 255))

    # Step 5: Right Bottom [1015, 510, 1260, 590]
    draw.rectangle([1015, 510, 1260, 590], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1020, 513, "步驟 5：清洗冷熱水濾網", get_font(20), (15, 23, 42, 255))
    draw_left_text(draw, 1020, 545, "旋開進水濾網清除泥沙雜質", get_font(15), (71, 85, 105, 255))
    draw_left_text(draw, 1020, 570, "避免泥沙堵塞阻礙水流啟動", get_font(14), (71, 85, 105, 255))

    # Step 5: Below filter [1020, 660, 1250, 720]
    draw.rectangle([1020, 660, 1250, 720], fill=(235, 246, 252, 255))
    draw_left_text(draw, 1025, 665, "旋開濾網", get_font(15), (15, 23, 42, 255))
    draw_left_text(draw, 1115, 665, "清水沖洗", get_font(15), (15, 23, 42, 255))
    draw_left_text(draw, 1025, 692, "清除水垢泥沙與鐵屑", get_font(14), (100, 116, 139, 255))

    # Bottom valve arrow "OPEN" [540, 660, 625, 705]
    draw.rectangle([540, 660, 625, 705], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [540, 660, 625, 705], "開啟", get_font(16), (15, 23, 42, 255))

    # Bottom Contact Bar [380, 715, 950, 758]
    draw.rounded_rectangle([380, 715, 950, 758], radius=8, fill=(255, 255, 255, 255), outline=(220, 38, 38, 255), width=2)
    draw_centered_text(draw, [380, 715, 950, 758], "【安全提醒】測試後若仍無法點著，請致電盛隆協助：02-2972-5559", get_font(16), (220, 38, 38, 255))

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

    # 1. Top Title [100, 5, 1280, 85]
    draw.rectangle([100, 5, 1280, 85], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [100, 18, 1280, 75], "瓦斯爐火焰判讀與爐底風門調節教學", get_font(34), (30, 41, 59, 255))

    # 2. Left Header [120, 70, 660, 155] (Peach background)
    draw.rectangle([120, 70, 660, 155], fill=(255, 237, 226, 255))
    draw_left_text(draw, 140, 82, "燃燒不完全（紅黃火）", get_font(22), (220, 38, 38, 255))
    draw_left_text(draw, 140, 118, "熱效率差・耗瓦斯・鍋底嚴重積碳燻黑", get_font(15), (100, 116, 139, 255))

    # Left Soot Text [50, 155, 345, 280]
    draw.rectangle([50, 155, 345, 280], fill=(255, 237, 226, 255))
    draw_left_text(draw, 55, 160, "鍋底積碳焦黑", get_font(18), (15, 23, 42, 255))
    draw_left_text(draw, 55, 188, "阻礙熱傳導效率", get_font(14), (71, 85, 105, 255))
    draw_left_text(draw, 55, 212, "浪費燃氣瓦斯費", get_font(14), (220, 38, 38, 255))
    draw_left_text(draw, 55, 236, "鍋底厚垢難刷洗", get_font(14), (100, 116, 139, 255))

    # Left Flame Text [50, 315, 345, 435]
    draw.rectangle([50, 315, 345, 435], fill=(255, 237, 226, 255))
    draw_left_text(draw, 55, 320, "紅火 / 黃火", get_font(20), (220, 38, 38, 255))
    draw_left_text(draw, 55, 355, "空氣不足或快沒氣", get_font(14), (71, 85, 105, 255))
    draw_left_text(draw, 55, 382, "燃燒不全冒黑煙", get_font(14), (100, 116, 139, 255))

    # 3. Right Header [730, 70, 1310, 155] (Light Blue background)
    draw.rectangle([730, 70, 1310, 155], fill=(235, 245, 255, 255))
    draw_left_text(draw, 750, 82, "完全燃燒（清澈藍火）", get_font(22), (37, 99, 235, 255))
    draw_left_text(draw, 750, 118, "火力最強・導熱佳・鍋底乾淨無碳垢", get_font(15), (100, 116, 139, 255))

    # Right Clean Pot Text [1020, 155, 1350, 280]
    draw.rectangle([1020, 155, 1350, 280], fill=(235, 245, 255, 255))
    draw_left_text(draw, 1030, 160, "鍋底乾淨不燒黑", get_font(18), (15, 23, 42, 255))
    draw_left_text(draw, 1030, 188, "受熱均勻熱效最高", get_font(14), (71, 85, 105, 255))
    draw_left_text(draw, 1030, 212, "大幅節省瓦斯費用", get_font(14), (5, 150, 105, 255))
    draw_left_text(draw, 1030, 236, "鍋具光亮好沖洗", get_font(14), (100, 116, 139, 255))

    # Right Blue Flame Text [1020, 315, 1350, 435]
    draw.rectangle([1020, 315, 1350, 435], fill=(235, 245, 255, 255))
    draw_left_text(draw, 1030, 320, "清澈健康藍火", get_font(20), (37, 99, 235, 255))
    draw_left_text(draw, 1030, 355, "火力充沛無黑煙", get_font(14), (71, 85, 105, 255))
    draw_left_text(draw, 1030, 382, "熱量完全釋放極高溫", get_font(14), (100, 116, 139, 255))

    # 4. Bottom Section
    # Left Dark Blue Banner [25, 445, 440, 570]
    draw.rounded_rectangle([25, 445, 440, 570], radius=12, fill=(30, 58, 138, 255))
    draw_centered_text(draw, [25, 452, 440, 488], "爐底風門調節教學", get_font(22), (255, 255, 255, 255))
    draw_centered_text(draw, [25, 492, 440, 518], "撥動調節片，紅火變藍火！", get_font(15), (224, 242, 254, 255))
    draw_centered_text(draw, [25, 520, 440, 545], "盛隆專線 02-2972-5559 ｜ LINE: @350MZOGG", get_font(13), (253, 224, 71, 255))

    # Burner head left [470, 480, 640, 520]
    draw.rectangle([470, 480, 640, 520], fill=(225, 240, 250, 255))
    draw_centered_text(draw, [470, 480, 640, 520], "爐心燃燒頭", get_font(14), (15, 23, 42, 255))

    # Burner head right [850, 470, 1010, 510]
    draw.rectangle([850, 470, 1010, 510], fill=(225, 240, 250, 255))
    draw_centered_text(draw, [850, 470, 1010, 510], "爐頭分火蓋", get_font(14), (15, 23, 42, 255))

    # Gas flow (top pipe) [255, 595, 375, 635]
    draw.rectangle([255, 595, 375, 635], fill=(225, 240, 250, 255))
    draw_centered_text(draw, [255, 595, 375, 635], "瓦斯氣流", get_font(14), (15, 23, 42, 255))

    # Gas pipe [160, 705, 280, 745]
    draw.rectangle([160, 705, 280, 745], fill=(225, 240, 250, 255))
    draw_centered_text(draw, [160, 705, 280, 745], "瓦斯進氣管", get_font(14), (15, 23, 42, 255))

    # Gas flow (bottom) [350, 705, 470, 745]
    draw.rectangle([350, 705, 470, 745], fill=(225, 240, 250, 255))
    draw_centered_text(draw, [350, 705, 470, 745], "瓦斯流向", get_font(14), (15, 23, 42, 255))

    # Venturi tube [520, 715, 670, 750]
    draw.rectangle([520, 715, 670, 750], fill=(225, 240, 250, 255))
    draw_centered_text(draw, [520, 715, 670, 750], "文氏混合管", get_font(14), (15, 23, 42, 255))

    # Air Shutter Damper Plate [720, 705, 920, 755]
    draw.rectangle([720, 705, 920, 755], fill=(225, 240, 250, 255))
    draw_centered_text(draw, [720, 705, 920, 755], "空氣調節風門片", get_font(14), (15, 23, 42, 255))

    # Unified bottom right mechanism card [940, 545, 1360, 740]
    draw.rounded_rectangle([940, 545, 1360, 740], radius=12, fill=(235, 245, 255, 255), outline=(191, 219, 254, 255), width=1)
    draw_left_text(draw, 960, 558, "進氣調節孔（已開啟）", get_font(18), (15, 23, 42, 255))
    draw_left_text(draw, 960, 592, "瓦斯與空氣均勻預混 ｜ 最佳空燃比完全燃燒", get_font(14), (71, 85, 105, 255))
    draw.line([960, 626, 1340, 626], fill=(219, 234, 254, 255), width=1)
    draw_left_text(draw, 960, 640, "撥動風門調節片：增加進氣量即可消除紅火", get_font(15), (37, 99, 235, 255))
    draw_left_text(draw, 960, 672, "若調整後仍為紅火，請致電盛隆 02-2972-5559 派員檢修", get_font(14), (220, 38, 38, 255))
    draw_left_text(draw, 960, 702, "門市諮詢 LINE: @350MZOGG 專人線上協助判讀", get_font(13), (100, 116, 139, 255))

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
    draw_centered_text(draw, [100, 60, 1300, 125], "天然瓦斯 (NG) 與 桶裝瓦斯 (LPG) 規格與設備差異圖解", get_font(32), (30, 41, 59, 255))
    draw_centered_text(draw, [100, 130, 1300, 175], "盛隆瓦斯專業安全指南 ｜ 門市電話 02-2972-5559 ｜ LINE: @350MZOGG", get_font(18), (100, 116, 139, 255))

    # 2. Left Side (Natural Gas)
    # Low pressure [310, 200, 540, 280]
    draw.rectangle([310, 200, 540, 280], fill=(255, 255, 255, 255))
    draw_left_text(draw, 315, 208, "天然瓦斯 (NG)", get_font(20), (37, 99, 235, 255))
    draw_left_text(draw, 315, 242, "供氣低壓: 150~200 mmH2O", get_font(15), (71, 85, 105, 255))

    # Pipeline [140, 390, 420, 440]
    draw.rectangle([140, 390, 420, 440], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [140, 390, 420, 440], "市區自來管線供氣", get_font(18), (15, 23, 42, 255))

    # Large orifice [355, 610, 560, 670]
    draw.rectangle([355, 610, 560, 670], fill=(255, 255, 255, 255))
    draw_left_text(draw, 360, 615, "噴嘴孔徑較大", get_font(18), (37, 99, 235, 255))
    draw_left_text(draw, 360, 642, "天然氣專用規格", get_font(14), (100, 116, 139, 255))

    # 3. Center STOP Sign & Warning
    # Octagon STOP [615, 235, 760, 365]
    draw.rectangle([615, 235, 760, 365], fill=(220, 38, 38, 255))
    draw_centered_text(draw, [615, 235, 760, 365], "停！", get_font(44), (255, 255, 255, 255))

    # Warning text below exclamation [570, 445, 810, 575]
    draw.rectangle([570, 445, 810, 575], fill=(255, 255, 255, 255))
    draw_centered_text(draw, [570, 452, 810, 482], "供壓與熱值完全不同！", get_font(17), (220, 38, 38, 255))
    draw_centered_text(draw, [570, 485, 810, 515], "天然氣爐具直接接桶裝", get_font(16), (220, 38, 38, 255))
    draw_centered_text(draw, [570, 518, 810, 545], "將產生巨大爆燃極危險！", get_font(16), (220, 38, 38, 255))
    draw_centered_text(draw, [570, 548, 810, 572], "必須由合格技師改機換噴嘴", get_font(14), (5, 150, 105, 255))

    # 4. Right Side (LPG)
    # High pressure [840, 205, 985, 275]
    draw.rectangle([840, 205, 985, 275], fill=(255, 255, 255, 255))
    draw_left_text(draw, 845, 208, "桶裝瓦斯 (LPG)", get_font(20), (5, 150, 105, 255))
    draw_left_text(draw, 845, 242, "安全控壓: R280 調整器", get_font(15), (71, 85, 105, 255))

    # High energy density [840, 320, 1010, 395]
    draw.rectangle([840, 320, 1010, 395], fill=(255, 255, 255, 255))
    draw_left_text(draw, 845, 328, "單位熱值極高", get_font(18), (5, 150, 105, 255))
    draw_left_text(draw, 845, 360, "大火快炒鑊氣足", get_font(15), (71, 85, 105, 255))

    # Cylinder label "LPG" [1155, 300, 1255, 355]
    draw.rectangle([1155, 300, 1255, 355], fill=(205, 230, 242, 255))
    draw_centered_text(draw, [1155, 300, 1255, 355], "瓦斯", get_font(22), (71, 85, 105, 255))

    # Smaller orifice [845, 660, 1040, 725]
    draw.rectangle([845, 660, 1040, 725], fill=(255, 255, 255, 255))
    draw_left_text(draw, 850, 665, "噴嘴孔徑較小", get_font(18), (5, 150, 105, 255))
    draw_left_text(draw, 850, 695, "桶裝專用設備", get_font(14), (100, 116, 139, 255))

    # Reverse thread left-hand screw valve [1040, 665, 1345, 730]
    draw.rectangle([1040, 665, 1345, 730], fill=(255, 255, 255, 255))
    draw_left_text(draw, 1045, 668, "台灣標準反牙左旋角閥", get_font(18), (15, 23, 42, 255))
    draw_left_text(draw, 1045, 698, "盛隆專線 02-2972-5559 ｜ LINE: @350MZOGG", get_font(13), (37, 99, 235, 255))

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
