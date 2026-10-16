import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1376, 768
img = Image.new('RGB', (W, H), (248, 250, 252))
draw = ImageDraw.Draw(img)

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

# ==================== 1. 頂部 HEADER BAR ====================
draw.rounded_rectangle([40, 20, 1336, 112], radius=18, fill=(37, 99, 235))
draw_centered_text(draw, [40, 28, 1336, 74], "盛隆瓦斯 專業圖鑑 ｜ 桶裝瓦斯 vs 天然瓦斯 用量與熱值換算指南", get_font(30, True), (255, 255, 255))
draw_centered_text(draw, [40, 74, 1336, 106], "熱值效率等效換算 · 實測生活用量對照 · 設備安裝成本透明解析", get_font(17, False), (219, 234, 254))

# ==================== 2. 左側：核心熱值與鋼瓶等效換算 ====================
# 卡片 1: 熱值對決卡
draw.rounded_rectangle([40, 126, 670, 275], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
# 卡片標題
draw.rounded_rectangle([56, 138, 280, 172], radius=8, fill=(239, 246, 255))
draw_centered_text(draw, [56, 138, 280, 172], "【核心物理發熱量對決】", get_font(15, True), (29, 78, 216))

# 桶裝瓦斯數值
draw.rounded_rectangle([56, 180, 345, 226], radius=10, fill=(240, 253, 244), outline=(187, 247, 208), width=1)
draw.text((66, 190), "桶裝瓦斯 (LPG)", font=get_font(14, True), fill=(21, 128, 61))
draw.text((185, 188), "約 11,500 kcal/kg", font=get_font(16, True), fill=(22, 101, 52))

# 天然瓦斯數值
draw.rounded_rectangle([360, 180, 650, 226], radius=10, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
draw.text((370, 190), "天然瓦斯 (NG)", font=get_font(14, True), fill=(100, 116, 139))
draw.text((488, 188), "約 9,000 kcal/度", font=get_font(16, True), fill=(51, 65, 85))

# 關鍵換算金色框
draw.rounded_rectangle([56, 234, 650, 268], radius=8, fill=(254, 243, 199))
draw_centered_text(draw, [56, 234, 650, 268], "【關鍵等效公式】 1 公斤 桶裝瓦斯 ＝ 約 1.25 ～ 1.33 度 天然瓦斯", get_font(15, True), (180, 83, 9))

# 卡片 2: 常用鋼瓶等效天然氣度數換算
draw.rounded_rectangle([40, 288, 670, 668], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
draw.rounded_rectangle([56, 300, 300, 334], radius=8, fill=(239, 246, 255))
draw_centered_text(draw, [56, 300, 300, 334], "【常用鋼瓶換算天然氣度數】", get_font(15, True), (29, 78, 216))

# 規格 1: 16kg (家庭最熱門)
draw.rounded_rectangle([56, 344, 650, 442], radius=12, fill=(255, 255, 255), outline=(37, 99, 235), width=2)
draw.rounded_rectangle([70, 358, 175, 428], radius=10, fill=(37, 99, 235))
draw_centered_text(draw, [70, 364, 175, 394], "16 kg", get_font(20, True), (255, 255, 255))
draw_centered_text(draw, [70, 394, 175, 422], "家庭主力桶", get_font(13, True), (219, 234, 254))

draw.text((192, 358), "等效天然氣：約 20 ～ 21 度 (m³)", font=get_font(17, True), fill=(15, 23, 42))
draw.text((192, 386), "• 適用 1~4 人日常下廚熱水，一般家庭約可用 1 ～ 1.5 個月", font=get_font(14, False), fill=(71, 85, 105))
draw.text((192, 412), "• 產生相同熱量，相當於連續使用 21 度天然氣", font=get_font(14, True), fill=(37, 99, 235))

# 規格 2: 20kg (大用量/餐飲)
draw.rounded_rectangle([56, 452, 650, 550], radius=12, fill=(255, 255, 255), outline=(226, 232, 240), width=1)
draw.rounded_rectangle([70, 466, 175, 536], radius=10, fill=(15, 23, 42))
draw_centered_text(draw, [70, 472, 175, 502], "20 kg", get_font(20, True), (255, 255, 255))
draw_centered_text(draw, [70, 502, 175, 530], "商用大家庭", get_font(13, True), (148, 163, 184))

draw.text((192, 466), "等效天然氣：約 25 ～ 26 度 (m³)", font=get_font(17, True), fill=(15, 23, 42))
draw.text((192, 494), "• 大家庭、餐廳小吃大火快炒首選，出氣強勁「鑊氣足」", font=get_font(14, False), fill=(71, 85, 105))
draw.text((192, 520), "• 熱值高升溫迅速，出餐效率明顯優於天然氣", font=get_font(14, True), fill=(15, 23, 42))

# 規格 3: 10kg (小家庭/外宿)
draw.rounded_rectangle([56, 560, 650, 656], radius=12, fill=(255, 255, 255), outline=(226, 232, 240), width=1)
draw.rounded_rectangle([70, 574, 175, 642], radius=10, fill=(5, 150, 105))
draw_centered_text(draw, [70, 580, 175, 608], "10 kg", get_font(20, True), (255, 255, 255))
draw_centered_text(draw, [70, 608, 175, 636], "輕量小家庭", get_font(13, True), (209, 250, 229))

draw.text((192, 574), "等效天然氣：約 12.5 ～ 13 度 (m³)", font=get_font(17, True), fill=(15, 23, 42))
draw.text((192, 602), "• 套房外宿、煮水少開火，一桶可用 2 ～ 3 個月", font=get_font(14, False), fill=(71, 85, 105))
draw.text((192, 628), "• 體積小好移動，免綁約、零基本費最彈性", font=get_font(14, True), fill=(5, 150, 105))

# ==================== 3. 右側：實際生活場景用量對比表 ====================
draw.rounded_rectangle([695, 126, 1336, 462], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
draw.rounded_rectangle([715, 138, 955, 172], radius=8, fill=(239, 246, 255))
draw_centered_text(draw, [715, 138, 955, 172], "【實際生活場景用量全覽表】", get_font(15, True), (29, 78, 216))

# 表頭
table_y = 180
draw.rounded_rectangle([715, table_y, 1315, table_y + 36], radius=8, fill=(241, 245, 249))
draw.text((730, table_y + 7), "生活使用情境", font=get_font(14, True), fill=(71, 85, 105))
draw.text((910, table_y + 7), "桶裝瓦斯 (LPG)", font=get_font(14, True), fill=(37, 99, 235))
draw.text((1115, table_y + 7), "天然瓦斯 (NG)", font=get_font(14, True), fill=(100, 116, 139))

# Row 1: 一般家庭 (3~4人)
r1_y = table_y + 42
draw.rectangle([715, r1_y, 1315, r1_y + 52], fill=(255, 255, 255))
draw.line([715, r1_y + 52, 1315, r1_y + 52], fill=(241, 245, 249), width=1)
draw.text((730, r1_y + 5), "1. 一般家庭 (3~4人)", font=get_font(14, True), fill=(15, 23, 42))
draw.text((730, r1_y + 28), "日常熱水澡 + 晚餐烹飪", font=get_font(12, False), fill=(100, 116, 139))
draw.text((910, r1_y + 5), "1 桶 16kg 用 1 ～ 1.5 個月", font=get_font(14, True), fill=(22, 101, 52))
draw.text((910, r1_y + 28), "冬天約1個月，夏天1.5~2個月", font=get_font(12, False), fill=(71, 85, 105))
draw.text((1115, r1_y + 5), "每月約 16 ～ 22 度", font=get_font(14, True), fill=(51, 65, 85))
draw.text((1115, r1_y + 28), "雙月一期約 32～44度", font=get_font(12, False), fill=(100, 116, 139))

# Row 2: 單身租屋 / 外宿
r2_y = r1_y + 56
draw.rectangle([715, r2_y, 1315, r2_y + 52], fill=(250, 250, 250))
draw.line([715, r2_y + 52, 1315, r2_y + 52], fill=(241, 245, 249), width=1)
draw.text((730, r2_y + 5), "2. 單身外宿 / 租屋族", font=get_font(14, True), fill=(15, 23, 42))
draw.text((730, r2_y + 28), "洗澡為主、少開大火", font=get_font(12, False), fill=(100, 116, 139))
draw.text((910, r2_y + 5), "10kg 或 16kg 用 2 ～ 3 個月", font=get_font(14, True), fill=(22, 101, 52))
draw.text((910, r2_y + 28), "★ 零基本費，用完才叫最划算", font=get_font(12, True), fill=(180, 83, 9))
draw.text((1115, r2_y + 5), "每月約 6 ～ 10 度", font=get_font(14, True), fill=(51, 65, 85))
draw.text((1115, r2_y + 28), "※ 每期仍須強制繳固定基本費", font=get_font(12, True), fill=(220, 38, 38))

# Row 3: 餐飲快炒小吃
r3_y = r2_y + 56
draw.rectangle([715, r3_y, 1315, r3_y + 52], fill=(255, 255, 255))
draw.line([715, r3_y + 52, 1315, r3_y + 52], fill=(241, 245, 249), width=1)
draw.text((730, r3_y + 5), "3. 餐飲小吃 / 熱炒店", font=get_font(14, True), fill=(15, 23, 42))
draw.text((730, r3_y + 28), "大量連續快炒油炸", font=get_font(12, False), fill=(100, 116, 139))
draw.text((910, r3_y + 5), "瞬間火力猛、鑊氣強大", font=get_font(14, True), fill=(22, 101, 52))
draw.text((910, r3_y + 28), "單位熱值高，升溫快速出餐快", font=get_font(12, False), fill=(71, 85, 105))
draw.text((1115, r3_y + 5), "升溫相對溫和", font=get_font(14, True), fill=(51, 65, 85))
draw.text((1115, r3_y + 28), "需特大管徑與大瓦斯表", font=get_font(12, False), fill=(100, 116, 139))

# Row 4: 停電與地震應變
r4_y = r3_y + 56
draw.rectangle([715, r4_y, 1315, r4_y + 52], fill=(250, 250, 250))
draw.text((730, r4_y + 5), "4. 停電與災害時可用性", font=get_font(14, True), fill=(15, 23, 42))
draw.text((730, r4_y + 28), "應急防災彈性", font=get_font(12, False), fill=(100, 116, 139))
draw.text((910, r4_y + 5), "機械爐具不受停電影響", font=get_font(14, True), fill=(22, 101, 52))
draw.text((910, r4_y + 28), "防災自給自足，煮飯無礙", font=get_font(12, False), fill=(71, 85, 105))
draw.text((1115, r4_y + 5), "微電腦表可能自動遮斷", font=get_font(14, True), fill=(51, 65, 85))
draw.text((1115, r4_y + 28), "斷電時可能暫時無法供氣", font=get_font(12, False), fill=(100, 116, 139))

# ==================== 卡片 4: 初期建置費用與經濟效益實情解析 ====================
draw.rounded_rectangle([695, 475, 1336, 668], radius=16, fill=(240, 253, 244), outline=(187, 247, 208), width=2)
draw.text((712, 486), "【盛隆瓦斯 設備建置與經濟效益實情評估】", font=get_font(16, True), fill=(21, 128, 61))

draw.text((712, 515), "① 既有設備戶 0 元安裝：已有管線、合格調整器且鋼瓶未過期，完全免安裝費，以桶換桶！", font=get_font(13, True), fill=(22, 101, 52))
draw.text((712, 540), "② 新裝無設備戶（基本約 1,000~5,000元）：含合格空瓶押金、安全軟管與 CNS 認證調整器。", font=get_font(13, False), fill=(22, 101, 52))
draw.text((712, 565), "③ 安全性能加強（依配備選購）：可選配超流防爆自動遮斷調整器、防鼠咬金屬軟管，安全倍增。", font=get_font(13, False), fill=(22, 101, 52))
draw.text((712, 590), "④ 天然瓦斯對比（動輒 3~10 萬元）：需負擔昂貴外管工程與裝表費，工期長且老公寓常無法申裝。", font=get_font(13, False), fill=(100, 116, 139))
draw.text((712, 615), "⑤ 零固定基本費負擔：桶裝瓦斯「叫一桶算一桶、零基本費」，天然氣每期均收基本費與表租。", font=get_font(13, False), fill=(22, 101, 52))
draw.text((712, 640), "★ 快速配送與安全檢測專線：新北三重 02-2972-5559，盛隆師傅現場免費測漏，守護居家安心！", font=get_font(13, True), fill=(37, 99, 235))

# ==================== 4. 底部 FOOTER ====================
draw.line([40, 682, 1336, 682], fill=(226, 232, 240), width=1)
draw_centered_text(draw, [40, 692, 1336, 752], "盛隆瓦斯行（盛隆煤氣） · 新北市三重區合法登記販賣業者 · 門市專線：02-2972-5559 · LINE ID: @350MZOGG", get_font(14, True), (100, 116, 139))

output_path = 'c:/Gass/website/images/gas-consumption-comparison.jpg'
img.save(output_path, 'JPEG', quality=95)
print('Updated infographic generated successfully at:', output_path)
