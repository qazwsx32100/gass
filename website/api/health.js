export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    service: '盛隆瓦斯品牌形象官網',
    version: '1.5.1',
    timestamp: new Date().toISOString()
  });
}
