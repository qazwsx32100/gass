from PIL import Image, ImageDraw, ImageFont

def mark_image(filename):
    im = Image.open('website/images/' + filename).convert('RGB')
    draw = ImageDraw.Draw(im)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 12)
    # Draw grid every 50 px
    for x in range(0, 1376, 100):
        draw.line([(x, 0), (x, 768)], fill=(255, 0, 0, 128), width=1)
        draw.text((x + 2, 5), str(x), font=font, fill=(255, 0, 0))
    for y in range(0, 768, 50):
        draw.line([(0, y), (1376, y)], fill=(0, 0, 255, 128), width=1)
        draw.text((5, y + 2), str(y), font=font, fill=(0, 0, 255))
    im.save('website/images/grid_' + filename)
    print("Saved grid for " + filename)

if __name__ == '__main__':
    mark_image('heater-troubleshoot.orig.jpg')
    mark_image('cylinder-sizes-comparison.orig.jpg')
    mark_image('stove-flame-damper.orig.jpg')
    mark_image('natural-vs-lpg-gas.orig.jpg')
