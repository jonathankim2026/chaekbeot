// ═══════════════════════════════════════════════════════════
//  책벗 — Claude API 추천 메시지 생성 (Vercel Serverless Function)
//  
//  보안 원칙:
//  - API 키는 Vercel 환경변수(ANTHROPIC_API_KEY)에만 보관
//  - 브라우저 코드에는 절대 노출되지 않음
//  - 이 파일이 중간 서버 역할을 함
//  
//  엔드포인트: POST /api/recommend
//  요청: { book: {...}, user: {...} }
//  응답: { message: "책벗의 추천 메시지" }
// ═══════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다' });
  }

  // 환경변수에서 API 키 읽기
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다');
    return res.status(500).json({ 
      error: 'API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.' 
    });
  }

  try {
    const { book, user } = req.body;

    if (!book || !user) {
      return res.status(400).json({ 
        error: '책 정보 또는 독자 정보가 누락되었습니다' 
      });
    }

    // ─── 책벗 시스템 프롬프트 ───────────────────────
    const systemPrompt = `당신은 '책벗'이라는 독서 동반자입니다.
독자에게 책을 따뜻하고 진솔하게 소개하는 역할을 합니다.

【책벗 원칙】
- 친구처럼 자연스럽게 말합니다
- 과장·강요·아부하지 않습니다
- 독자의 취향과 경험을 존중합니다
- 책의 장점을 정직하게 전달합니다
- 모르는 것은 모른다고 말합니다 (책 내용을 지어내지 않기)

【말투】
- 존댓말 사용 (~해요, ~네요)
- 따뜻하지만 차분하게
- 이모지는 최대 1개, 신중히 사용
- 3~4문장으로 간결하게

【중요】
- 독자 이름을 한 번 부르세요
- 독자의 취향·관심사·경험과 책의 어떤 점이 연결되는지 구체적으로 짚어주세요
- "꼭 읽어야 한다"는 식의 강요는 금지
- 책 내용을 추측해서 말하지 마세요. 주어진 정보(한 줄 소개, 주제)만 사용하세요`;

    // ─── 사용자 프롬프트 ───────────────────────────
    const tasteLabels = {
      narrative: '이야기 속으로 빠져드는 타입 (소설·동화·판타지 선호)',
      knowledge: '새로운 지식을 얻고 싶은 타입 (역사·과학·정보책 선호)',
      thinking: '생각하고 질문하는 타입 (철학·에세이 선호)',
      any: '장르 구분 없이 열린 마음'
    };
    const levelLabels = {
      beginner: '책과 친해지는 중 (책이 낯섦)',
      casual: '가끔 읽는 편 (관심 가는 책 위주)',
      regular: '즐겨 읽는 편 (독서 시간이 익숙함)',
      advanced: '책에 자신 있음 (두꺼운 책도 거뜬)'
    };

    const interestsAll = [
      ...(user.interests || []),
      ...(user.interestsCustom ? [user.interestsCustom] : [])
    ].join(', ') || '특별한 관심 분야 없음';

    const userPrompt = `[독자 정보]
- 이름: ${user.name}
- 학년: ${user.grade}
- 독서 취향: ${tasteLabels[user.readingTaste] || user.readingTaste}
- 관심 분야: ${interestsAll}
- 독서 경험: ${levelLabels[user.readingLevel] || user.readingLevel}

[추천할 책]
- 제목: ${book.title}
- 저자: ${book.author}
- 한 줄 소개: ${book.summary_oneline}
- 주제: ${(book.themes || []).join(', ')}
- 분량: ${book.length_tag || '보통'}

위 독자에게 이 책을 어떻게 소개하면 좋을까요? 
독자의 취향·관심사·경험을 고려해서 따뜻한 한 마디 추천 메시지를 써주세요.
3~4문장으로 짧고 진솔하게.`;

    // ─── Anthropic Claude API 호출 ────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API 오류:', response.status, errorText);
      return res.status(500).json({ 
        error: `Claude API 호출 실패 (${response.status})`,
        detail: errorText.substring(0, 200)
      });
    }

    const data = await response.json();
    const message = data.content?.[0]?.text || '메시지를 생성하지 못했어요.';

    console.log(`추천 생성 완료 - 사용자: ${user.name}, 책: ${book.title}, 토큰: ${data.usage?.input_tokens}/${data.usage?.output_tokens}`);

    return res.status(200).json({ 
      message,
      usage: data.usage
    });

  } catch (error) {
    console.error('추천 생성 오류:', error);
    return res.status(500).json({ 
      error: '추천 메시지 생성 중 오류가 발생했어요',
      detail: error.message
    });
  }
}
