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
draw.rounded_rectangle([40, 24, 1336, 110], radius=18, fill=(37, 99, 235))
draw_centered_text(draw, [40, 32, 1336, 76], "盛隆瓦斯 專業圖鑑 ｜ 桶裝瓦斯 vs 天然瓦斯 用量與熱值換算指南", get_font(28, True), (255, 255, 255))
draw_centered_text(draw, [40, 74, 1336, 104], "熱值效率等效換算 · 實測生活用量對照 · 設備安裝成本透明解析", get_font(16, False), (219, 234, 254))

# ==================== 2. 左側：核心熱值與鋼瓶等效換算 ====================
# 卡片 1: 熱值對決卡
draw.rounded_rectangle([40, 126, 670, 275], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
# 卡片標題
draw.rounded_rectangle([56, 140, 270, 172], radius=8, fill=(239, 246, 255))
draw_centered_text(draw, [56, 140, 270, 172], "【核心物理發熱量對決】", get_font(14, True), (29, 78, 216))

# 桶裝瓦斯數值
draw.rounded_rectangle([56, 182, 345, 226], radius=10, fill=(240, 253, 244), outline=(187, 247, 208), width=1)
draw.text((68, 192), "桶裝瓦斯 (LPG)", font=get_font(13, True), fill=(21, 128, 61))
draw.text((185, 189), "約 11,500 kcal/kg", font=get_font(15, True), fill=(22, 101, 52))

# 天然瓦斯數值
draw.rounded_rectangle([360, 182, 650, 226], radius=10, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
draw.text((372, 192), "天然瓦斯 (NG)", font=get_font(13, True), fill=(100, 116, 139))
draw.text((490, 189), "約 9,000 kcal/度", font=get_font(15, True), fill=(51, 65, 85))

# 關鍵換算金色框
draw.rounded_rectangle([56, 234, 650, 266], radius=8, fill=(254, 243, 199))
draw_centered_text(draw, [56, 234, 650, 266], "【關鍵等效公式】 1 公斤 桶裝瓦斯 ＝ 約 1.25 ～ 1.33 度 天然瓦斯", get_font(14, True), (180, 83, 9))

# 卡片 2: 常用鋼瓶等效天然氣度數換算
draw.rounded_rectangle([40, 290, 670, 665], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
draw.rounded_rectangle([56, 304, 290, 336], radius=8, fill=(239, 246, 255))
draw_centered_text(draw, [56, 304, 290, 336], "【常用鋼瓶換算天然氣度數】", get_font(14, True), (29, 78, 216))

# 規格 1: 16kg (家庭最熱門)
draw.rounded_rectangle([56, 346, 650, 442], radius=12, fill=(255, 255, 255), outline=(37, 99, 235), width=2)
draw.rounded_rectangle([70, 360, 175, 428], radius=10, fill=(37, 99, 235))
draw_centered_text(draw, [70, 368, 175, 396], "16 kg", get_font(18, True), (255, 255, 255))
draw_centered_text(draw, [70, 396, 175, 420], "家庭主力桶", get_font(12, False), (219, 234, 254))

draw.text((195, 362), "等效天然氣：約 20 ～ 21 度 (m³)", font=get_font(16, True), fill=(15, 23, 42))
draw.text((195, 388), "• 適用 1~4 人日常下廚熱水，一般家庭約可用 1 ～ 1.5 個月", font=get_font(13, False), fill=(71, 85, 105))
draw.text((195, 412), "• 產生相同熱量，相當於連續使用 21 度天然氣", font=get_font(13, False), fill=(37, 99, 235))

# 規格 2: 20kg (大用量/餐飲)
draw.rounded_rectangle([56, 454, 650, 550], radius=12, fill=(255, 255, 255), outline=(226, 232, 240), width=1)
draw.rounded_rectangle([70, 468, 175, 536], radius=10, fill=(15, 23, 42))
draw_centered_text(draw, [70, 476, 175, 504], "20 kg", get_font(18, True), (255, 255, 255))
draw_centered_text(draw, [70, 504, 175, 528], "商用大家庭", get_font(12, False), (148, 163, 184))

draw.text((195, 470), "等效天然氣：約 25 ～ 26 度 (m³)", font=get_font(16, True), fill=(15, 23, 42))
draw.text((195, 496), "• 大家庭、餐廳小吃大火快炒首選，出氣強勁「鑊氣足」", font=get_font(13, False), fill=(71, 85, 105))
draw.text((195, 520), "• 熱值高升溫迅速，出餐效率明顯優於天然氣", font=get_font(13, False), fill=(15, 23, 42))

# 規格 3: 10kg (小家庭/外宿)
draw.rounded_rectangle([56, 562, 650, 652], radius=12, fill=(255, 255, 255), outline=(226, 232, 240), width=1)
draw.rounded_rectangle([70, 574, 175, 640], radius=10, fill=(5, 150, 105))
draw_centered_text(draw, [70, 582, 175, 608], "10 kg", get_font(18, True), (255, 255, 255))
draw_centered_text(draw, [70, 608, 175, 632], "輕量小家庭", get_font(12, False), (209, 250, 229))

draw.text((195, 576), "等效天然氣：約 12.5 ～ 13 度 (m³)", font=get_font(16, True), fill=(15, 23, 42))
draw.text((195, 602), "• 套房外宿、煮水少開火，一桶可用 2 ～ 3 個月", font=get_font(13, False), fill=(71, 85, 105))
draw.text((195, 626), "• 體積小好移動，免綁約、零基本費最彈性", font=get_font(13, False), fill=(5, 150, 105))

# ==================== 3. 右側：實際生活場景用量對比表 ====================
draw.rounded_rectangle([695, 126, 1336, 460], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
draw.rounded_rectangle([715, 140, 945, 172], radius=8, fill=(239, 246, 255))
draw_centered_text(draw, [715, 140, 945, 172], "【實際生活場景用量全覽表】", get_font(14, True), (29, 78, 216))

# 表頭
table_y = 182
draw.rounded_rectangle([715, table_y, 1315, table_y + 34], radius=8, fill=(241, 245, 249))
draw.text((730, table_y + 7), "生活使用情境", font=get_font(13, True), fill=(71, 85, 105))
draw.text((910, table_y + 7), "桶裝瓦斯 (LPG)", font=get_font(13, True), fill=(37, 99, 235))
draw.text((1110, table_y + 7), "天然瓦斯 (NG)", font=get_font(13, True), fill=(100, 116, 139))

# Row 1: 一般家庭 (3~4人)
r1_y = table_y + 40
draw.rectangle([715, r1_y, 1315, r1_y + 50], fill=(255, 255, 255))
draw.line([715, r1_y + 50, 1315, r1_y + 50], fill=(241, 245, 249), width=1)
draw.text((730, r1_y + 6), "1. 一般家庭 (3~4人)", font=get_font(13, True), fill=(15, 23, 42))
draw.text((730, r1_y + 27), "日常熱水澡 + 晚餐烹飪", font=get_font(11, False), fill=(148, 163, 184))
draw.text((910, r1_y + 7), "1 桶 16kg 用 1 ～ 1.5 個月", font=get_font(13, True), fill=(22, 101, 52))
draw.text((910, r1_y + 27), "冬天約1個月，夏天1.5~2個月", font=get_font(11, False), fill=(71, 85, 105))
draw.text((1110, r1_y + 7), "每月約 16 ～ 22 度", font=get_font(13, False), fill=(51, 65, 85))
draw.text((1110, r1_y + 27), "雙月一期約 32～44度", font=get_font(11, False), fill=(148, 163, 184))

# Row 2: 單身租屋 / 外宿
r2_y = r1_y + 54
draw.rectangle([715, r2_y, 1315, r2_y + 50], fill=(250, 250, 250))
draw.line([715, r2_y + 50, 1315, r2_y + 50], fill=(241, 245, 249), width=1)
draw.text((730, r2_y + 6), "2. 單身外宿 / 租屋族", font=get_font(13, True), fill=(15, 23, 42))
draw.text((730, r2_y + 27), "洗澡為主、少開大火", font=get_font(11, False), fill=(148, 163, 184))
draw.text((910, r2_y + 7), "10kg 或 16kg 用 2 ～ 3 個月", font=get_font(13, True), fill=(22, 101, 52))
draw.text((910, r2_y + 27), "★ 零基本費，用完才叫最划算", font=get_font(11, True), fill=(180, 83, 9))
draw.text((1110, r2_y + 7), "每月約 6 ～ 10 度", font=get_font(13, False), fill=(51, 65, 85))
draw.text((1110, r2_y + 27), "※ 每期仍須強制繳固定基本費", font=get_font(11, False), fill=(220, 38, 38))

# Row 3: 餐飲快炒小吃
r3_y = r2_y + 54
draw.rectangle([715, r3_y, 1315, r3_y + 50], fill=(255, 255, 255))
draw.line([715, r3_y + 50, 1315, r3_y + 50], fill=(241, 245, 249), width=1)
draw.text((730, r3_y + 6), "3. 餐飲小吃 / 熱炒店", font=get_font(13, True), fill=(15, 23, 42))
draw.text((730, r3_y + 27), "大量連續快炒油炸", font=get_font(11, False), fill=(148, 163, 184))
draw.text((910, r3_y + 7), "瞬間火力猛、鑊氣強大", font=get_font(13, True), fill=(22, 101, 52))
draw.text((910, r3_y + 27), "單位熱值高，升溫快速出餐快", font=get_font(11, False), fill=(71, 85, 105))
draw.text((1110, r3_y + 7), "升溫相對溫和", font=get_font(13, False), fill=(51, 65, 85))
draw.text((1110, r3_y + 27), "需特大管徑與大瓦斯表", font=get_font(11, False), fill=(148, 163, 184))

# Row 4: 停電與地震應變
r4_y = r3_y + 54
draw.rectangle([715, r4_y, 1315, r4_y + 50], fill=(250, 250, 250))
draw.text((730, r4_y + 6), "4. 停電與災害時可用性", font=get_font(13, True), fill=(15, 23, 42))
draw.text((730, r4_y + 27), "應急防災彈性", font=get_font(11, False), fill=(148, 163, 184))
draw.text((910, r4_y + 7), "機械爐具不受停電影響", font=get_font(13, True), fill=(22, 101, 52))
draw.text((910, r4_y + 27), "防災自給自足，煮飯無礙", font=get_font(11, False), fill=(71, 85, 105))
draw.text((1110, r4_y + 7), "微電腦表可能自動遮斷", font=get_font(13, False), fill=(51, 65, 85))
draw.text((1110, r4_y + 27), "斷電時可能暫時無法供氣", font=get_font(11, False), fill=(148, 163, 184))

# ==================== 卡片 4: 初期建置費用與經濟效益實情解析 (完整更新) ====================
draw.rounded_rectangle([695, 475, 1336, 665], radius=16, fill=(240, 253, 244), outline=(187, 247, 208), width=2)
draw.text((715, 488), "【盛隆瓦斯 設備建置與經濟效益實情評估】", font=get_font(15, True), fill=(21, 128, 61))

draw.text((715, 516), "① 既有設備戶 0 元安裝：家中若已有管線、合格調整器且鋼瓶未過期/未報廢，完全免安裝費，以桶換桶！", font=get_font(12, True), fill=(22, 101, 52))
draw.text((715, 540), "② 新裝無設備戶（基本約 1,000~5,000元）：含合格空瓶押金、標準安全軟管與 CNS 認證安全調整器。", font=get_font(12, False), fill=(22, 101, 52))
draw.text((715, 564), "③ 安全性能加強（費用視配備略增）：可選配超流防爆自動遮斷調整器、白鐵防鼠咬金屬軟管，守護倍增。", font=get_font(12, False), fill=(22, 101, 52))
draw.text((715, 588), "④ 天然瓦斯對比（動輒 3~10 萬元）：需負擔昂貴室外立管拉管工程與裝表費，工程長且老舊公寓常無法申裝。", font=get_font(12, False), fill=(100, 116, 139))
draw.text((715, 612), "⑤ 零固定基本費負擔：桶裝瓦斯「叫一桶算一桶、零基本費」，天然氣無論有無使用每期均收基本費與表租。", font=get_font(12, False), fill=(22, 101, 52))
draw.text((715, 636), "📞 快速配送與安全檢測專線：新北三重 02-2972-5559，盛隆師傅現場免費測漏，守護居家安心！", font=get_font(12, True), fill=(37, 99, 235))

# ==================== 4. 底部 FOOTER ====================
draw.line([40, 680, 1336, 680], fill=(226, 232, 240), width=1)
draw_centered_text(draw, [40, 692, 1336, 750], "盛隆瓦斯行（盛隆煤氣） · 新北市三重區合法登記販賣業者 · 門市專線：02-2972-5559 · LINE ID: @350MZOGG", get_font(13, True), (100, 116, 139))

output_path = 'c:/Gass/website/images/gas-consumption-comparison.jpg'
img.save(output_path, 'JPEG', quality=95)
print('Updated infographic generated successfully at:', output_path)
