import os
from PIL import Image, ImageDraw, ImageFont

def process_gas_leak():
    img_path = 'c:/Gass/website/images/gas-leak-sop.jpg'
    backup_path = 'c:/Gass/website/images/gas-leak-sop.orig.jpg'
    if not os.path.exists(backup_path):
        Image.open(img_path).save(backup_path)
    
    img = Image.open(backup_path).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    font_path_bold = 'C:/Windows/Fonts/msjhbd.ttc'
    font_path_reg = 'C:/Windows/Fonts/msjh.ttc'

    f_title = ImageFont.truetype(font_path_bold, 36)
    f_card_title = ImageFont.truetype(font_path_bold, 22)
    f_card_sub = ImageFont.truetype(font_path_bold, 18)
    f_phone = ImageFont.truetype(font_path_bold, 22)

    # 1. Top Title Banner (Cover "4-STEP GAS LEAK SAFETY PROCEDURE")
    # Area around x: 260 to 1110, y: 55 to 135
    draw.rounded_rectangle([250, 52, 1126, 138], radius=20, fill=(255, 255, 255, 255), outline=(37, 99, 235, 255), width=3)
    draw.rounded_rectangle([258, 60, 1118, 130], radius=16, fill=(37, 99, 235, 255))
    
    title_text = "瓦斯漏氣緊急應變 4 步驟 SOP"
    bbox = f_title.getbbox(title_text)
    tw = bbox[2] - bbox[0]
    draw.text(((1376 - tw) // 2, 70), title_text, font=f_title, fill=(255, 255, 255, 255))

    # 2. Step 1 (Blue)
    # Box: x: 74, y: 528, w: 290, h: 86
    draw.rounded_rectangle([75, 528, 365, 614], radius=16, fill=(37, 99, 235, 255))
    t1 = "順時針關閉桶閥開關"
    bbox = f_card_title.getbbox(t1)
    draw.text((75 + (290 - (bbox[2] - bbox[0])) // 2, 554), t1, font=f_card_title, fill=(255, 255, 255, 255))

    draw.rectangle([65, 624, 375, 685], fill=(255, 255, 255, 255))
    s1 = "① 順時針緊閉鋼瓶角閥"
    bbox = f_card_sub.getbbox(s1)
    draw.text((75 + (290 - (bbox[2] - bbox[0])) // 2, 638), s1, font=f_card_sub, fill=(30, 41, 59, 255))

    # 3. Step 2 (Green)
    # Box: x: 390, y: 528, w: 290, h: 86
    draw.rounded_rectangle([390, 528, 680, 614], radius=16, fill=(5, 150, 105, 255))
    t2 = "輕輕推開窗戶自然通風"
    bbox = f_card_title.getbbox(t2)
    draw.text((390 + (290 - (bbox[2] - bbox[0])) // 2, 554), t2, font=f_card_title, fill=(255, 255, 255, 255))

    draw.rectangle([380, 624, 690, 685], fill=(255, 255, 255, 255))
    s2 = "② 輕推開窗，瓦斯比空氣重"
    bbox = f_card_sub.getbbox(s2)
    draw.text((390 + (290 - (bbox[2] - bbox[0])) // 2, 638), s2, font=f_card_sub, fill=(30, 41, 59, 255))

    # 4. Step 3 (Red)
    # Box: x: 705, y: 528, w: 290, h: 86
    draw.rounded_rectangle([705, 528, 995, 614], radius=16, fill=(220, 38, 38, 255))
    t3 = "嚴禁開關任何電器"
    bbox = f_card_title.getbbox(t3)
    draw.text((705 + (290 - (bbox[2] - bbox[0])) // 2, 554), t3, font=f_card_title, fill=(255, 255, 255, 255))

    draw.rectangle([695, 624, 1005, 685], fill=(255, 255, 255, 255))
    s3 = "③ 禁開電燈電扇防電弧引爆"
    bbox = f_card_sub.getbbox(s3)
    draw.text((705 + (290 - (bbox[2] - bbox[0])) // 2, 638), s3, font=f_card_sub, fill=(30, 41, 59, 255))

    # 5. Step 4 (Indigo)
    # Phone screen cover "911"
    draw.rectangle([1215, 415, 1270, 460], fill=(255, 255, 255, 255))
    draw.text((1220, 420), "盛隆", font=f_phone, fill=(220, 38, 38, 255))

    # Box: x: 1020, y: 528, w: 290, h: 86
    draw.rounded_rectangle([1020, 528, 1310, 614], radius=16, fill=(30, 58, 138, 255))
    t4 = "疏散室外撥打電話求助"
    bbox = f_card_title.getbbox(t4)
    draw.text((1020 + (290 - (bbox[2] - bbox[0])) // 2, 554), t4, font=f_card_title, fill=(255, 255, 255, 255))

    draw.rectangle([1010, 624, 1320, 685], fill=(255, 255, 255, 255))
    s4 = "④ 致電盛隆 02-2972-5559"
    bbox = f_card_sub.getbbox(s4)
    draw.text((1020 + (290 - (bbox[2] - bbox[0])) // 2, 638), s4, font=f_card_sub, fill=(30, 41, 59, 255))

    final = Image.alpha_composite(img, overlay).convert('RGB')
    final.save(img_path, quality=95)
    print("Gas leak localized successfully!")

if __name__ == '__main__':
    process_gas_leak()
