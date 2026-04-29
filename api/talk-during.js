// ═══════════════════════════════════════════════════════
//  책벗 — AI 말걸기 25/50/75 (Vercel Serverless Function)
//  v1.0 (2026-04-29): 마스터 프롬프트 P03~P06 적용
//  
//  엔드포인트: POST /api/talk-during
//  요청: { book, user, milestone: 25 | 50 | 75 }
//  응답: { message }
//  
//  설계 원칙 (합의문서 § ⑤):
//   - AI가 책 내용 먼저 창작·언급 금지 (헌장 2.3)
//   - 3턴 이내 마무리 (P06 원칙 3)
//   - 학년별 언어 분기 (초3-4 / 초5-6 / 중학생·성인)
//   - 강제 아님, 건너뛰기 가능
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
    const { book, user, milestone } = req.body;
    
    // 입력 검증
    if (!book || !user || !milestone) {
      return res.status(400).json({ 
        error: 'Missing required fields: book, user, milestone' 
      });
    }
    
    if (![25, 50, 75].includes(milestone)) {
      return res.status(400).json({ 
        error: 'Invalid milestone (must be 25, 50, or 75)' 
      });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // 학년 분기
    const grade = user.grade || '초5';
    let gradeBand;
    if (grade === '초3' || grade === '초4') gradeBand = 'lower';
    else if (grade === '초5' || grade === '초6') gradeBand = 'middle';
    else gradeBand = 'upper'; // 중1~성인
    
    // 시스템 프롬프트 구성 (P03~P06 적용)
    const systemPrompt = buildSystemPrompt(book, user, milestone, gradeBand);
    
    // Claude API 호출 (Sonnet 사용 — 자연스러운 대화)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: '책벗 AI 친구로서 첫 인사를 해주세요. 위 시스템 프롬프트의 학년별 시작 문구를 그대로 출력하지 말고, 그 정신을 살려 자연스럽게 말을 걸어주세요. 책 내용은 절대 먼저 언급하지 마세요.'
          }
        ],
        system: systemPrompt
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(500).json({ 
        error: 'AI service error',
        message: getFallbackMessage(milestone, gradeBand, user.name)
      });
    }
    
    const data = await response.json();
    const message = data.content[0]?.text || getFallbackMessage(milestone, gradeBand, user.name);
    
    return res.status(200).json({ 
      message,
      milestone,
      usage: data.usage
    });
    
  } catch (err) {
    console.error('talk-during handler error:', err);
    return res.status(500).json({ 
      error: err.message,
      message: '책벗이 잠시 자리를 비웠어요. 이어서 읽어봐요 📖'
    });
  }
}

// ═══════════════════════════════════════════════════════
//  시스템 프롬프트 빌더
// ═══════════════════════════════════════════════════════
function buildSystemPrompt(book, user, milestone, gradeBand) {
  const userName = user.name || '독자';
  const bookTitle = book.title || '이 책';
  const bookAuthor = book.author || '';
  const currentPage = book.current_page || 0;
  const totalPages = book.total_pages || 0;
  const isDbBook = !!(book.summary_oneline);
  const grade = user.grade || '초5';
  // 학년별 언어 기준
  const langGuide = {
    lower: '3~5문장, 초등 교과서 어휘, 친구처럼 반말 OK',
    middle: '5~7문장, 기본 추상어 허용, 선배처럼 존댓말',
    upper: '7~10문장, 개념어 허용, 선생님처럼 존댓말'
  }[gradeBand];
  
  // 마일스톤별 시작 문구 가이드 (학년별)
  const startGuide = {
    25: {
      lower: `"안녕! ${userName}~ 오늘 읽으면서 기억에 남은 것 있어? 뭐든 편하게 이야기해줘 😊"`,
      middle: `"안녕하세요! 오늘 읽은 부분에서 인상 깊었던 것이 있다면 이야기해줄 수 있어요?"`,
      upper: `"오늘 읽은 부분에서 가장 머릿속에 남은 장면이나 생각이 있나요?"`
    },
    50: {
      lower: `"와, 벌써 절반이나 읽었어요! 대단해요! 지금까지 어떤 인물이 제일 마음에 들었어요?"`,
      middle: `"절반 넘게 읽었군요! 지금까지 읽으면서 기대했던 것과 다른 부분이 있었나요?"`,
      upper: `"책의 절반 지점입니다. 가장 의문이 생기거나 생각해보게 된 부분이 있나요?"`
    },
    75: {
      lower: `"거의 다 왔어요! 정말 대단해요! 이제 곧 끝나가는데, 어떻게 끝날 것 같아요?"`,
      middle: `"거의 다 읽어가고 있네요! 이 책이 어떻게 마무리될 것 같아요?"`,
      upper: `"클라이맥스를 향해 가고 있군요. 지금 이 시점에서 가장 궁금한 것이 무엇인가요?"`
    }
  }[milestone][gradeBand];
  
  // DB 밖 책 추가 안내
  const honestyNote = isDbBook 
    ? '' 
    : '\n\n⚠️ 중요: 이 책은 책벗 DB에 없습니다. 책 내용·인물·줄거리를 절대 추측하거나 언급하지 마세요. 독자가 말하는 것에만 반응하세요.';
  
  return `당신은 책벗 AI 독서 친구입니다.

# 독자 정보
- 이름: ${userName}
- 학년: ${grade}
- 진행: ${currentPage}/${totalPages}쪽 (${milestone}% 지점)

# 책 정보
- 제목: 「${bookTitle}」
- 저자: ${bookAuthor}${honestyNote}

# 언어 기준
${langGuide}

# 시작 문구 가이드 (이 정신을 살려 자연스럽게)
${startGuide}

# 절대 원칙 (합의문서 § ⑤ + 헌장 2.3)
1. AI가 책 내용을 먼저 창작·언급하지 않습니다.
2. 독자가 말한 것만을 기반으로 응답합니다.
3. 첫 인사 + 질문 1개로 끝냅니다 (대화는 독자 답변 후 이어짐).
4. 마지막은 항상 "이어서 읽어봐요!" 같은 읽기 복귀 격려.
5. 별도 입력창 강제 없이 편안한 대화 분위기.
6. 평가·교정·스포일러 절대 금지.
7. 답변 길이: ${langGuide.split(',')[0]}.

# 출력 형식
첫 인사 + 자연스러운 질문만 하나 던집니다.
이미 안다는 듯한 표현 금지 ("이 책은 ~한 책이죠" 같은 문장 금지).
독자가 답하면 그것에서 시작합니다.

지금 ${milestone}% 지점 첫 인사를 시작하세요.`;
}

// ═══════════════════════════════════════════════════════
//  폴백 메시지 (API 실패 시)
// ═══════════════════════════════════════════════════════
function getFallbackMessage(milestone, gradeBand, userName) {
  const name = userName || '독자';
  
  const fallbacks = {
    25: {
      lower: `안녕! ${name}~ 오늘 읽으면서 기억에 남은 것 있어? 뭐든 편하게 이야기해줘 😊`,
      middle: `안녕하세요, ${name}님! 오늘 읽은 부분에서 인상 깊었던 것이 있다면 이야기해주세요.`,
      upper: `${name}님, 오늘 읽은 부분에서 가장 머릿속에 남은 장면이나 생각이 있나요?`
    },
    50: {
      lower: `와, ${name}~ 벌써 절반이나 읽었어요! 대단해요! 지금까지 어떤 인물이 제일 마음에 들었어요?`,
      middle: `${name}님, 절반 넘게 읽었군요! 지금까지 읽으면서 기대했던 것과 다른 부분이 있었나요?`,
      upper: `${name}님, 책의 절반 지점입니다. 가장 의문이 생기거나 생각해보게 된 부분이 있나요?`
    },
    75: {
      lower: `${name}~ 거의 다 왔어요! 정말 대단해요! 이제 곧 끝나가는데, 어떻게 끝날 것 같아요?`,
      middle: `${name}님, 거의 다 읽어가고 있네요! 이 책이 어떻게 마무리될 것 같아요?`,
      upper: `${name}님, 클라이맥스를 향해 가고 있군요. 지금 이 시점에서 가장 궁금한 것이 무엇인가요?`
    }
  };
  
  return fallbacks[milestone]?.[gradeBand] || `${name}님, 오늘 읽으신 부분에 대해 한 마디 들려주세요 🌿`;
}
