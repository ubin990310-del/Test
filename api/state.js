const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  // CORS 처리 (어느 도메인에서든 Vercel API를 찌를 수 있도록 허용)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // 상태 데이터 가져오기
      const state = await kv.get('appState');
      return res.status(200).json({ state });
    } 
    
    if (req.method === 'POST') {
      const { action, payload } = req.body;
      
      if (action === 'saveState') {
        // 최대 10MB까지 저장 가능한 KV 데이터베이스에 상태 저장
        await kv.set('appState', payload);
        return res.status(200).json({ success: true });
      } 
      
      if (action === 'lockCenter') {
        const { centerId, sabun } = payload;
        const lockKey = 'lock_' + centerId;
        
        const currentLock = await kv.get(lockKey);
        if (currentLock && currentLock !== sabun) {
          return res.status(409).json({ error: 'Already locked' });
        }
        
        // 3600초(1시간) 후 자동 만료되는 락 설정 (사용자가 로그아웃 안하고 꺼버릴 경우 대비)
        await kv.set(lockKey, sabun, { ex: 3600 });
        return res.status(200).json({ success: true });
      }
      
      if (action === 'unlockCenter') {
        const { centerId } = payload;
        await kv.del('lock_' + centerId);
        return res.status(200).json({ success: true });
      }
      
      return res.status(400).json({ error: 'Unknown action' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
