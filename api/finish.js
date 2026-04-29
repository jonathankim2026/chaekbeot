// ═══════════════════════════════════════════════════════
//  책벗 — 완독 축하 메시지 (Vercel Serverless Function)
//  v1.0 (2026-04-29): 합의문서 § ⑥ + 헌장 정신
//  
//  엔드포인트: POST /api/finish
//  요청: { book, user }
//  응답: { message }
//  
//  설계 원칙:
//   - 짧은 정여울 톤 격려 (소화하기 5턴은 다음 세션에)
//   - 책 내용 절대 추측 금지 (헌장 2.3)
//   - 학년별 언어 분기
//   - 다음 단계 (소화하기) 자연스러운 예고
// ═══════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { book, user } = req.body;
    
    if (!book || !user) {
      return res.status(400).json({ 
        error: 'Missing required fields: book, user' 
      });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: getFallbackMessage(user.name, book.title)
      });
    }
    
    // 학년 분기
    const grade = user.grade || '초5';
    let gradeBand;
    if (grade === '초3' || grade === '초4') gradeBand = 'lower';
    else if (grade === '초5' || grade === '초6') gradeBand = 'middle';
    else gradeBand = 'upper'; // 중1~성인
    
    const systemPrompt = buildSystemPrompt(book, user, gradeBand);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        messages: [
          {
            role: 'user',
            content: '책벗 AI 친구로서 완독을 축하하는 짧고 따뜻한 메시지를 써주세요. 책 내용은 절대 언급하지 마세요. 정여울 톤으로, 다음 단계(소화하기) 예고를 자연스럽게 포함해주세요.'
          }
        ],
        system: systemPrompt
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(200).json({ 
        message: getFallbackMessage(user.name, book.title)
      });
    }
    
    const data = await response.json();
    const message = data.content[0]?.text || getFallbackMessage(user.name, book.title);
    
    return res.status(200).json({ 
      message,
      usage: data.usage
    });
    
  } catch (err) {
    console.error('finish handler error:', err);
    return res.status(200).json({ 
      message: getFallbackMessage(req.body?.user?.name, req.body?.book?.title)
    });
  }
}

// ═══════════════════════════════════════════════════════
//  시스템 프롬프트 빌더
// ═══════════════════════════════════════════════════════
function buildSystemPrompt(book, user, gradeBand) {
  const userName = user.name || '독자';
  const bookTitle = book.title || '이 책';
  const bookAuthor = book.author || '';
  const totalPages = book.total_pages || 0;
  const isDbBook = !!(book.summary_oneline);
  const grade = user.grade || '초5';
  
  // 학년별 언어 기준
  const langGuide = {
    lower: '3~5문장, 초등 교과서 어휘, 친구처럼 따뜻하게',
    middle: '5~7문장, 기본 추상어 허용, 선배처럼 진지하게 따뜻하게',
    upper: '6~8문장, 개념어 허용, 동등한 독서 파트너로서'
  }[gradeBand];
  
  const honestyNote = isDbBook 
    ? '' 
    : '\n\n⚠️ 중요: 이 책은 책벗 DB에 없습니다. 책 내용·인물·줄거리·주제를 절대 추측하거나 언급하지 마세요. 완독 사실 그 자체에 대한 축하만 해주세요.';
  
  return `당신은 책벗 AI 독서 친구입니다. ${userName}님이 책 한 권을 완독하셨고, 그 축하 메시지를 작성합니다.

# 독자 정보
- 이름: ${userName}
- 학년: ${grade}

# 완독한 책
- 제목: 「${bookTitle}」
- 저자: ${bookAuthor}
- 총 페이지: ${totalPages}쪽${honestyNote}

# 언어 기준
${langGuide}

# 메시지 구조 (3~4문장)
1. 따뜻한 완독 축하 (${userName}님 호명)
2. 끝까지 읽어낸 것에 대한 인정
3. 다음 단계 예고: 소화하기 (자연스럽게)
4. 마지막 한 마디 — 책벗답게 따뜻하게

# 절대 원칙 (헌장 2.3)
1. 책 내용·인물·줄거리·주제·해석 일절 언급 금지
2. "이 책은 ~한 책이죠" 같은 표현 금지
3. ${userName}님의 완독 노력에 대한 인정에만 집중
4. 평가·교훈 강요 금지
5. 짧고 따뜻하게 — 길지 않게

# 정여울 톤 핵심
- 다정하지만 절제됨
- 여백 있는 문장
- 호들갑 없이 진심
- "정말 멋져요!" 같은 과한 칭찬보다 "끝까지 읽으신 거예요" 같은 잔잔한 인정

# 다음 단계 예고 표현 (자연스럽게)
- "이제 책 한 권의 마지막 페이지를 덮으셨네요"
- "조용히 한 번 더 떠올려보는 시간이 다음에 기다리고 있어요"
- "오늘 읽은 이 책이 ${userName}님 안에서 어떻게 자랄지 궁금해요"
류의 표현으로 소화하기를 자연스럽게 예고

지금 ${userName}님께 완독 축하 메시지를 써주세요.`;
}

// ═══════════════════════════════════════════════════════
//  폴백 메시지 (API 실패 시)
// ═══════════════════════════════════════════════════════
function getFallbackMessage(userName, bookTitle) {
  const name = userName || '독자';
  const title = bookTitle || '이 책';
  
  return `${name} 님,

「${title}」을 끝까지 읽으셨네요.

마지막 페이지를 덮으신 그 순간이 어떤 느낌이었을까요? 책 한 권을 완독한다는 건 단순히 페이지를 넘긴 게 아니에요. ${name} 님 안에 작은 무언가가 자란 거예요.

곧 그 마음을 한 번 더 떠올려보는 시간이 기다리고 있어요. 조급해하지 마시고, 잠시 책을 안고 머물러주세요. 🌿`;
}
