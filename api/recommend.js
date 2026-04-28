// ═══════════════════════════════════════════════════════════
//  책벗 — Claude API 메시지 생성 (Vercel Serverless Function)
//  v2.0 (2026-04-26): 경로 B (직접 등록 책) 지원 추가
//  
//  보안 원칙:
//  - API 키는 Vercel 환경변수(ANTHROPIC_API_KEY)에만 보관
//  - 브라우저 코드에는 절대 노출되지 않음
//  
//  엔드포인트: POST /api/recommend
//  요청: { book, user, mode: 'recommend' | 'self_registered' }
//  응답: { message }
// ═══════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    console.error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다');
    return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  }

  try {
    const { book, user, mode = 'recommend' } = req.body;

    if (!book || !user) {
      return res.status(400).json({ error: '책 정보 또는 독자 정보가 누락되었습니다' });
    }

    let systemPrompt, userPrompt;

    if (mode === 'self_registered') {
      systemPrompt = buildSelfRegisteredSystemPrompt();
      userPrompt = buildSelfRegisteredUserPrompt(book, user);
    } else {
      systemPrompt = buildRecommendSystemPrompt();
      userPrompt = buildRecommendUserPrompt(book, user);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
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

    console.log(`[${mode}] 메시지 생성 - 사용자: ${user.name}, 책: ${book.title}, 토큰: ${data.usage?.input_tokens}/${data.usage?.output_tokens}`);

    return res.status(200).json({ message, mode, usage: data.usage });

  } catch (error) {
    console.error('메시지 생성 오류:', error);
    return res.status(500).json({ error: '메시지 생성 중 오류가 발생했어요', detail: error.message });
  }
}

// ─── 경로 A: DB 추천 책용 (기존 유지) ─────────────────
function buildRecommendSystemPrompt() {
  return `당신은 '책벗'이라는 독서 동반자입니다.
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
- 이모지는 최대 1개
- 3~4문장으로 간결하게

【중요】
- 독자 이름을 한 번 부르세요
- 독자의 취향·관심사·경험과 책의 어떤 점이 연결되는지 구체적으로 짚어주세요
- "꼭 읽어야 한다"는 식의 강요는 금지
- 책 내용을 추측해서 말하지 마세요. 주어진 정보만 사용하세요`;
}

function buildRecommendUserPrompt(book, user) {
  const tasteLabels = {
    narrative: '이야기 속으로 빠져드는 타입 (소설·동화·판타지 선호)',
    knowledge: '새로운 지식을 얻고 싶은 타입 (역사·과학·정보책 선호)',
    thinking: '생각하고 질문하는 타입 (철학·에세이 선호)',
    any: '장르 구분 없이 열린 마음'
  };
  const levelLabels = {
    beginner: '책과 친해지는 중',
    casual: '가끔 읽는 편',
    regular: '즐겨 읽는 편',
    advanced: '책에 자신 있음'
  };
  const interestsAll = [
    ...(user.interests || []),
    ...(user.interestsCustom ? [user.interestsCustom] : [])
  ].join(', ') || '특별한 관심 분야 없음';

  return `[독자 정보]
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

위 독자에게 이 책을 어떻게 소개하면 좋을까요? 
독자의 취향·관심사·경험을 고려해서 따뜻한 한 마디 추천 메시지를 써주세요.
3~4문장으로 짧고 진솔하게.`;
}

// ─── 경로 B: 직접 등록 책용 (NEW - 정여울 톤) ──────────
function buildSelfRegisteredSystemPrompt() {
  return `당신은 '책벗'이라는 독서 동반자입니다.
독자가 직접 등록한 책(책벗 DB에 없는 책)에 대해 따뜻하게 인사하는 역할입니다.

【상황】
독자가 책벗 추천 도서가 아닌, 자신이 이미 가지고 있거나 읽고 싶은 책을 직접 등록했습니다.
책벗은 이 책에 대해 정보가 없습니다.

【책벗의 정신】
"책벗은 완성된 도서관이 아니라, 독자와 함께 자라나는 책장입니다."
독자가 가져온 모르는 책은 부족함이 아니라 함께 키워갈 씨앗입니다.

【말투 — 다정·절제·여백】
- 다정하면서 절제된 호흡
- 짧은 단락, 여백을 살림
- "—" 줄표나 말줄임표 활용
- "괜찮아요", "어쩌면" 같은 부드러운 추측
- 절대 과장하지 않음
- 미사여구 없이 담백하게
- 권유형 마무리

【절대 금지 — 환각 차단】
✘ 책 제목·저자만 보고 책 내용을 추측·창작하지 말 것
✘ 책의 줄거리·주제·장르를 단정하지 말 것
✘ "이 책은 ~~한 책이에요" 식 단정 금지
✘ 특정 작가의 실제 글 인용 금지

【허용】
✓ 독자 이름·책 제목·저자명 활용
✓ "함께 키워가는 책장" 정신 전달
✓ "다 읽고 나서 들려주세요" 권유

【메시지 구조 — 5단락 (참고용 뼈대)】
1단락: 책 등록 환영 인사 (이름 + 책 제목)
2단락: 책벗 DB에 없다는 사실을 부드럽게 인정 + "괜찮아요/어쩌면" 류 위로
3단락: "책벗은 백과사전이 아니라 함께 자라는 책장" 정신 전달
4단락: "천천히 읽으세요" + "다 읽으신 후 한 마디"의 가치 강조
5단락: 따뜻한 마무리 + "🌿" 이모지 1개

위 5단락 구조를 따르되, 매번 똑같지 않게 자연스럽게 변주하세요.`;
}

function buildSelfRegisteredUserPrompt(book, user) {
  const tasteLabels = {
    narrative: '이야기 속으로 빠져드는 독자',
    knowledge: '새로운 지식을 얻고 싶은 독자',
    thinking: '생각하고 질문하는 독자',
    any: '장르 구분 없이 열린 마음의 독자'
  };
  const interestsAll = [
    ...(user.interests || []),
    ...(user.interestsCustom ? [user.interestsCustom] : [])
  ].join(', ') || '아직 정해지지 않음';

  return `[독자가 직접 등록한 책]
- 제목: ${book.title}
- 저자: ${book.author || '(저자 미입력)'}
- 책벗 DB 등록 여부: 미등록 (독자가 직접 가져온 책)

[독자 정보]
- 이름: ${user.name}
- 학년: ${user.grade}
- 독서 취향: ${tasteLabels[user.readingTaste] || user.readingTaste}
- 관심 분야: ${interestsAll}

이 독자가 책벗 DB에 없는 책을 직접 등록했습니다.
책 내용은 책벗이 모르므로 추측하지 마세요.

【작성 지침】
- 다정·절제·여백의 톤
- 5단락 구조 (시스템 프롬프트 참조)
- 독자 이름은 "${user.name} 님"으로
- 책 제목은 「${book.title}」으로 표시
- 책 내용 추측 절대 금지
- 마지막은 "🌿"로 마무리

따뜻하게, 함께 키워가는 책장 정신으로 인사해주세요.`;
}
