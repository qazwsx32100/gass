import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1376, 768
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
# 1. 瓦斯爐點著手一放開立刻熄火圖解 (stove-thermocouple-troubleshoot.jpg)
# ==============================================================================
def render_stove_thermocouple():
    img = Image.new('RGB', (W, H), (248, 250, 252))
    draw = ImageDraw.Draw(img)

    # Top Header Bar
    draw.rounded_rectangle([40, 20, 1336, 112], radius=18, fill=(220, 38, 38))
    draw_centered_text(draw, [40, 26, 1336, 72], "盛隆瓦斯 專業圖鑑 ｜ 瓦斯爐放手立刻熄火排查指南", get_font(29, True), (255, 255, 255))
    draw_centered_text(draw, [40, 72, 1336, 106], "熱電偶熄火安全感應針原理 · 爐頭雙針構造解析 · 居家 3 步驟清潔自救", get_font(16, False), (254, 226, 226))

    # Left Column (x: 40 ~ 670): 構造原理與故障元兇
    # Card 1: 爐頭雙針構造
    draw.rounded_rectangle([40, 126, 670, 380], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.rounded_rectangle([56, 140, 300, 174], radius=8, fill=(254, 242, 242))
    draw_centered_text(draw, [56, 140, 300, 174], "【爐頭核心構造：雙針功能解析】", get_font(15, True), (185, 28, 28))

    # 點火針
    draw.rounded_rectangle([56, 184, 650, 268], radius=12, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
    draw.rounded_rectangle([70, 196, 195, 256], radius=10, fill=(71, 85, 105))
    draw_centered_text(draw, [70, 202, 195, 230], "點火針", get_font(17, True), (255, 255, 255))
    draw_centered_text(draw, [70, 230, 195, 252], "白色陶瓷", get_font(12, False), (226, 232, 240))
    draw_left_text(draw, 210, 198, "功能：高壓放電產生「啪啪」電火花點燃瓦斯。", get_font(15, True), (30, 41, 59))
    draw_left_text(draw, 210, 228, "特徵：鬆開旋鈕後停止放電，與點著後是否熄火無關。", get_font(13.5, False), (100, 116, 139))

    # 熱電偶感應針
    draw.rounded_rectangle([56, 280, 650, 364], radius=12, fill=(255, 241, 242), outline=(254, 205, 211), width=1)
    draw.rounded_rectangle([70, 292, 195, 352], radius=10, fill=(225, 29, 72))
    draw_centered_text(draw, [70, 298, 195, 326], "熱電偶", get_font(17, True), (255, 255, 255))
    draw_centered_text(draw, [70, 326, 195, 348], "金屬安全針", get_font(12, False), (255, 228, 230))
    draw_left_text(draw, 210, 294, "功能：安全熄火保護核心！受火加熱產生微電流。", get_font(15, True), (159, 18, 57))
    draw_left_text(draw, 210, 324, "特徵：微電流吸住安全電磁閥；若未加熱即自動斷氣防漏！", get_font(13.5, False), (190, 18, 60))

    # Card 2: 為什麼手一放開就立刻熄火？
    draw.rounded_rectangle([40, 396, 670, 746], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.rounded_rectangle([56, 410, 340, 444], radius=8, fill=(254, 243, 199))
    draw_centered_text(draw, [56, 410, 340, 444], "【手放開立刻熄火三大常見原因】", get_font(15, True), (180, 83, 9))

    reasons = [
        ("① 油垢積碳嚴重覆蓋（最常見 80%）", "烹飪湯汁、油煙長期覆蓋金屬針尖，阻隔火焰導熱，熱電偶無法感測溫度。", (245, 158, 11)),
        ("② 按壓旋鈕受熱時間不足", "點著火後需按壓 3～5 秒讓熱電偶充分加熱升溫；若一點著就放手，電磁閥尚未吸合。", (59, 130, 246)),
        ("③ 感應針位置偏移或零件老化損壞", "爐蓋未蓋平導致火焰未燒到感應針；若清潔且長按仍熄火，則為熱電偶或電磁閥損壞。", (239, 68, 68))
    ]
    ry = 458
    for title, desc, col in reasons:
        draw.rounded_rectangle([56, ry, 650, ry + 78], radius=10, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
        draw.rectangle([56, ry + 10, 62, ry + 68], fill=col)
        draw_left_text(draw, 74, ry + 12, title, get_font(15, True), (15, 23, 42))
        draw_left_text(draw, 74, ry + 42, desc, get_font(13, False), (71, 85, 105))
        ry += 92

    # Right Column (x: 706 ~ 1336): 居家 3 步驟清潔自救 & 專業維修判定
    # Card 3: 居家清潔自救 3 步驟
    draw.rounded_rectangle([706, 126, 1336, 520], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.rounded_rectangle([722, 140, 980, 174], radius=8, fill=(240, 253, 244))
    draw_centered_text(draw, [722, 140, 980, 174], "【居家免花錢：簡易 3 步驟清潔法】", get_font(15, True), (21, 128, 61))

    steps = [
        ("步驟 1：關閉瓦斯，靜待爐頭完全冷卻", "安全第一！順時針關閉瓦斯鋼瓶總角閥，並等待爐具降至常溫，切勿燙傷。", (37, 99, 235)),
        ("步驟 2：乾布或細砂紙輕拭熱電偶金屬針", "使用乾棉布或 400 號細砂紙，輕輕摩擦清潔感應銅針表面的黑垢碳渣至金屬發亮。", (16, 185, 129)),
        ("步驟 3：點火並持續下壓旋鈕停留 3~5 秒", "點著火後請手動下壓停留 3~5 秒，確認火焰包覆金屬針充分加熱後再放手。", (245, 158, 11))
    ]
    sy = 188
    for title, desc, col in steps:
        draw.rounded_rectangle([722, sy, 1320, sy + 88], radius=12, fill=(240, 253, 250), outline=(204, 251, 241), width=1)
        draw.rounded_rectangle([736, sy + 14, 846, sy + 74], radius=10, fill=col)
        draw_centered_text(draw, [736, sy + 22, 846, sy + 46], "SOP", get_font(13, True), (255, 255, 255))
        draw_centered_text(draw, [736, sy + 46, 846, sy + 68], "步驟", get_font(12, False), (240, 253, 250))
        draw_left_text(draw, 860, sy + 16, title, get_font(16, True), (15, 23, 42))
        draw_left_text(draw, 860, sy + 48, desc, get_font(13.5, False), (71, 85, 105))
        sy += 104

    # Card 4: 何時判定需更換零件 & 盛隆專線
    draw.rounded_rectangle([706, 536, 1336, 746], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.rounded_rectangle([722, 550, 960, 584], radius=8, fill=(254, 242, 242))
    draw_centered_text(draw, [722, 550, 960, 584], "【專業檢修與更換判定標準】", get_font(15, True), (185, 28, 28))

    draw_left_text(draw, 726, 596, "● 火焰已持續燒紅感應針超過 10 秒，手一放開依然「秒熄火」 ➔ 熱電偶內部熱電材料老化。", get_font(14, False), (51, 65, 85))
    draw_left_text(draw, 726, 626, "● 感應針金屬出現斷裂、嚴重鏽蝕孔洞或底座電線鬆脫 ➔ 感應線組老化需整組換新。", get_font(14, False), (51, 65, 85))
    draw_left_text(draw, 726, 656, "● 爐火燃燒時火勢微弱無法包覆感應針 ➔ 爐心分火器孔洞遭油垢阻塞，需清理火孔。", get_font(14, False), (51, 65, 85))

    # Bottom Contact Banner
    draw.rounded_rectangle([722, 688, 1320, 734], radius=10, fill=(30, 41, 59))
    draw_centered_text(draw, [722, 688, 1320, 734], "💡 自行清潔仍無法排除？盛隆瓦斯專業技師到府安全檢修專線：02-2972-5559", get_font(14.5, True), (253, 224, 71))

    out_file = 'website/images/stove-thermocouple-troubleshoot.jpg'
    img.save(out_file, 'JPEG', quality=95)
    print(f"Saved: {out_file} ({os.path.getsize(out_file)} bytes)")

# ==============================================================================
# 2. 強制排氣熱水器法規與陽台通風圖解 (forced-exhaust-water-heater.jpg)
# ==============================================================================
def render_forced_exhaust_heater():
    img = Image.new('RGB', (W, H), (248, 250, 252))
    draw = ImageDraw.Draw(img)

    # Top Header Bar
    draw.rounded_rectangle([40, 20, 1336, 112], radius=18, fill=(30, 64, 175))
    draw_centered_text(draw, [40, 26, 1336, 72], "盛隆瓦斯 消防安全圖鑑 ｜ 熱水器強制排氣 (FE式) 法規與陽台通風指南", get_font(28, True), (255, 255, 255))
    draw_centered_text(draw, [40, 72, 1336, 106], "杜絕一氧化碳中毒 · 陽台加裝窗戶／鐵欄杆／曬衣法規判定 · 屋外型 (RF) vs 強制排氣 (FE) 對照", get_font(16, False), (219, 234, 254))

    # Left Column (x: 40 ~ 670): RF vs FE 對照比較
    # Card 1: 屋外型 RF 式
    draw.rounded_rectangle([40, 126, 670, 360], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.rounded_rectangle([56, 140, 310, 174], radius=8, fill=(254, 242, 242))
    draw_centered_text(draw, [56, 140, 310, 174], "【傳統屋外型熱水器（RF式）】", get_font(15, True), (185, 28, 28))

    draw.rounded_rectangle([56, 184, 220, 224], radius=8, fill=(239, 68, 68))
    draw_centered_text(draw, [56, 184, 220, 224], "嚴格安裝限制", get_font(14, True), (255, 255, 255))
    draw_left_text(draw, 232, 192, "【僅限 100% 完全開放無阻隔之室外陽台】", get_font(15, True), (220, 38, 38))

    draw_left_text(draw, 58, 238, "● 排氣方式：自然對流排氣，無排氣管與抽風馬達。", get_font(14, False), (51, 65, 85))
    draw_left_text(draw, 58, 268, "● 致命危險：一旦陽台加裝窗戶、鐵窗或掛滿衣物，廢氣無法排出，", get_font(14, False), (51, 65, 85))
    draw_left_text(draw, 58, 296, "  極易造成無色無味「一氧化碳 (CO) 倒灌進室內」，引發集體中毒意外！", get_font(14, True), (185, 28, 28))
    draw_left_text(draw, 58, 326, "❌ 法律規範：室內空間、加裝鋁窗或通風不良陽台，消防法規嚴禁安裝！", get_font(14, True), (220, 38, 38))

    # Card 2: 強制排氣型 FE 式
    draw.rounded_rectangle([40, 376, 670, 746], radius=16, fill=(255, 255, 255), outline=(37, 99, 235), width=2)
    draw.rounded_rectangle([56, 390, 330, 424], radius=8, fill=(239, 246, 255))
    draw_centered_text(draw, [56, 390, 330, 424], "【強制排氣型熱水器（FE式 / 首選）】", get_font(15, True), (29, 78, 216))

    draw.rounded_rectangle([56, 434, 240, 474], radius=8, fill=(37, 99, 235))
    draw_centered_text(draw, [56, 434, 240, 474], "消防法規唯一認證", get_font(14, True), (255, 255, 255))
    draw_left_text(draw, 252, 442, "【加裝窗戶／鐵窗／非開放陽台 必裝】", get_font(15, True), (30, 64, 175))

    fe_points = [
        ("① 強力風機強制抽氣", "開水點火前，內部抽風馬達先啟動，點燃後將廢氣主動強力推送至管外。"),
        ("② 直徑 60mm 不銹鋼排氣管", "耐高溫、耐酸腐蝕之白鐵排氣管直接穿出窗外，廢氣 100% 排放至戶外大氣。"),
        ("③ 風壓安全開關防倒灌", "室外強風倒灌或排氣管阻塞時，安全晶片立即自動中斷瓦斯供應，安全零死角。"),
        ("④ 密閉空間生命安全護盾", "全面阻絕一氧化碳中毒風險，守護全家洗澡沐浴生命安全。")
    ]
    fy = 486
    for title, desc in fe_points:
        draw.rounded_rectangle([56, fy, 650, fy + 54], radius=8, fill=(240, 249, 255), outline=(186, 230, 253), width=1)
        draw_left_text(draw, 70, fy + 8, title, get_font(14.5, True), (3, 105, 161))
        draw_left_text(draw, 70, fy + 30, desc, get_font(12.5, False), (51, 65, 85))
        fy += 62

    # Right Column (x: 706 ~ 1336): 陽台環境自我檢視 & 鐵欄杆曬衣盲點
    # Card 3: 陽台環境自我檢驗表
    draw.rounded_rectangle([706, 126, 1336, 480], radius=16, fill=(255, 255, 255), outline=(226, 232, 240), width=2)
    draw.rounded_rectangle([722, 140, 1020, 174], radius=8, fill=(254, 243, 199))
    draw_centered_text(draw, [722, 140, 1020, 174], "【陽台環境檢驗：符合任一項即必須裝 FE 式】", get_font(15, True), (180, 83, 9))

    checks = [
        ("陽台裝有鋁門窗、氣密窗、玻璃窗", "無論平時窗戶是否開啟，加裝窗戶後即在法規上被定義為密閉或半密閉空間。"),
        ("陽台加裝防盜鐵窗、鐵欄杆或百葉窗", "鐵窗防盜網、鐵條、遮雨棚等設施均會大幅降低自然風流對流效率。"),
        ("陽台經常晾曬大量衣物或堆放雜物", "密集懸掛的衣物會形成風阻氣壁，阻礙空氣對流，廢氣滯留陽台。"),
        ("陽台外推改造為室內廚房、臥房或客廳", "陽台外推完全屬於室內起居空間，依法嚴禁安裝傳統屋外型熱水器。")
    ]
    cy = 188
    for item, exp in checks:
        draw.rounded_rectangle([722, cy, 1320, cy + 62], radius=10, fill=(248, 250, 252), outline=(226, 232, 240), width=1)
        draw.rounded_rectangle([734, cy + 12, 794, cy + 50], radius=8, fill=(220, 38, 38))
        draw_centered_text(draw, [734, cy + 12, 794, cy + 50], "必裝", get_font(14, True), (255, 255, 255))
        draw_left_text(draw, 808, cy + 10, item, get_font(15, True), (15, 23, 42))
        draw_left_text(draw, 808, cy + 34, exp, get_font(12.5, False), (100, 116, 139))
        cy += 70

    # Card 4: ⚠️ 致命迷思：鐵欄杆曬衣物！
    draw.rounded_rectangle([706, 496, 1336, 746], radius=16, fill=(254, 242, 242), outline=(252, 165, 165), width=2)
    draw.rounded_rectangle([722, 510, 1080, 544], radius=8, fill=(220, 38, 38))
    draw_centered_text(draw, [722, 510, 1080, 544], "⚠️ 消防署重大警語：鐵欄杆曬衣服的致命迷思！", get_font(15, True), (255, 255, 255))

    draw_left_text(draw, 726, 558, "很多民眾誤以為「陽台沒裝玻璃窗、只有鐵欄杆，就等於開放空間」？", get_font(15, True), (185, 28, 28))
    draw_left_text(draw, 726, 586, "👉 這是極度危險的錯誤迷思！消防署統計，多起一氧化碳中毒慘劇正是發生在", get_font(14, False), (30, 41, 59))
    draw_left_text(draw, 726, 612, "   「沒裝玻璃窗、但鐵欄杆掛滿衣服」的陽台！衣物阻擋空氣流通，無風時", get_font(14, False), (30, 41, 59))
    draw_left_text(draw, 726, 638, "   廢氣滯留陽台並經由紗門紗窗滲透流入客廳與臥房，造成熟睡中家人缺氧中毒！", get_font(14, True), (185, 28, 28))

    # Bottom Contact Banner
    draw.rounded_rectangle([722, 680, 1320, 730], radius=10, fill=(30, 41, 59))
    draw_centered_text(draw, [722, 680, 1320, 730], "🛡️ 盛隆瓦斯關心您：熱水器安裝環境評估與安全檢測諮詢專線：02-2972-5559", get_font(14.5, True), (253, 224, 71))

    out_file = 'website/images/forced-exhaust-water-heater.jpg'
    img.save(out_file, 'JPEG', quality=95)
    print(f"Saved: {out_file} ({os.path.getsize(out_file)} bytes)")

if __name__ == '__main__':
    render_stove_thermocouple()
    render_forced_exhaust_heater()
