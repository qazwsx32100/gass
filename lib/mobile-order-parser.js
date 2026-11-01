export function extractOrderSpecs(o) {
  const chips = [];

  if (Number(o?.raw50) > 0) {
    chips.push({
      spec: "50kg",
      qty: Number(o.raw50),
      label: `50kg × ${o.raw50}`,
      bg: "rgba(147, 51, 234, 0.16)",
      color: "#9333ea",
      border: "rgba(147, 51, 234, 0.38)",
    });
  }
  if (Number(o?.raw20) > 0) {
    chips.push({
      spec: "20kg",
      qty: Number(o.raw20),
      label: `20kg × ${o.raw20}`,
      bg: "rgba(22, 163, 74, 0.16)",
      color: "#16a34a",
      border: "rgba(22, 163, 74, 0.38)",
    });
  }
  if (Number(o?.raw16) > 0) {
    chips.push({
      spec: "16kg",
      qty: Number(o.raw16),
      label: `16kg × ${o.raw16}`,
      bg: "rgba(37, 99, 235, 0.16)",
      color: "#2563eb",
      border: "rgba(37, 99, 235, 0.38)",
    });
  }
  if (Number(o?.raw10) > 0) {
    chips.push({
      spec: "10kg",
      qty: Number(o.raw10),
      label: `10kg × ${o.raw10}`,
      bg: "rgba(234, 88, 12, 0.16)",
      color: "#ea580c",
      border: "rgba(234, 88, 12, 0.38)",
    });
  }
  if (Number(o?.raw4) > 0) {
    chips.push({
      spec: "4kg",
      qty: Number(o.raw4),
      label: `4kg × ${o.raw4}`,
      bg: "rgba(219, 39, 119, 0.16)",
      color: "#db2777",
      border: "rgba(219, 39, 119, 0.38)",
    });
  }

  if (chips.length === 0 && o?.items) {
    const rawItems = String(o.items).trim();
    const specPatterns = [
      { regex: /(?:50\s*(?:kg|公斤|k)|五[十0]公斤)[\s*xX×:：-]*(\d+)?/i, spec: "50kg", bg: "rgba(147, 51, 234, 0.16)", color: "#9333ea", border: "rgba(147, 51, 234, 0.38)" },
      { regex: /(?:20\s*(?:kg|公斤|k)|二[十0]公斤)[\s*xX×:：-]*(\d+)?/i, spec: "20kg", bg: "rgba(22, 163, 74, 0.16)", color: "#16a34a", border: "rgba(22, 163, 74, 0.38)" },
      { regex: /(?:16\s*(?:kg|公斤|k)|十[六6]公斤)[\s*xX×:：-]*(\d+)?/i, spec: "16kg", bg: "rgba(37, 99, 235, 0.16)", color: "#2563eb", border: "rgba(37, 99, 235, 0.38)" },
      { regex: /(?:10\s*(?:kg|公斤|k)|十公斤)[\s*xX×:：-]*(\d+)?/i, spec: "10kg", bg: "rgba(234, 88, 12, 0.16)", color: "#ea580c", border: "rgba(234, 88, 12, 0.38)" },
      { regex: /(?:4\s*(?:kg|公斤|k)|四公斤)[\s*xX×:：-]*(\d+)?/i, spec: "4kg", bg: "rgba(219, 39, 119, 0.16)", color: "#db2777", border: "rgba(219, 39, 119, 0.38)" },
    ];

    for (const pat of specPatterns) {
      const match = rawItems.match(pat.regex);
      if (match) {
        const qty = match[1] ? parseInt(match[1], 10) : 1;
        chips.push({
          spec: pat.spec,
          qty: qty || 1,
          label: `${pat.spec} × ${qty || 1}`,
          bg: pat.bg,
          color: pat.color,
          border: pat.border,
        });
      }
    }

    if (chips.length === 0) {
      chips.push({
        spec: "other",
        qty: 1,
        label: rawItems.length > 12 ? rawItems.slice(0, 11) + "…" : rawItems,
        bg: "rgba(13, 148, 136, 0.15)",
        color: "#0d9488",
        border: "rgba(13, 148, 136, 0.35)",
      });
    }
  }

  if (chips.length === 0) {
    chips.push({
      spec: "20kg",
      qty: 1,
      label: "瓦斯 × 1",
      bg: "rgba(22, 163, 74, 0.16)",
      color: "#16a34a",
      border: "rgba(22, 163, 74, 0.38)",
    });
  }

  return chips;
}

export function parseAddressForMobile(rawAddr) {
  if (!rawAddr) {
    return { district: "", streetAndNumber: "無地址", floor: "", isSanchong: true };
  }

  let text = rawAddr.trim();
  text = text.replace(/^(?:台灣|臺灣)?(?:新北市|台北市|臺北市)?/, "").trim();

  let district = "";
  const distMatch = text.match(/^([^\s號路街道巷弄]+?[區鄉鎮市])/);
  if (distMatch) {
    district = distMatch[1];
    text = text.slice(district.length).trim();
  }

  const isSanchong = !district || district === "三重區" || district === "三重";

  let floor = "";
  const floorMatch = text.match(/([0-9一二三四五六七八九十B]+(?:樓(?:之[0-9]+)?|[fF](?:-[0-9]+)?|地下(?:一|二|[0-9])?層?)(?:[前後後右左側室號])?)/);
  if (floorMatch) {
    floor = floorMatch[1];
    text = text.replace(floorMatch[0], "").trim();
  }

  text = text.replace(/[,，、\s]+$/, "").trim();

  return {
    district: district || (isSanchong ? "三重區" : ""),
    streetAndNumber: text || rawAddr,
    floor: floor,
    isSanchong,
  };
}
