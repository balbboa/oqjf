import type { CrisisResult, CrisisLevel } from './safety.types.js';

// Keyword-based detection — pure string matching, NO LLM calls
const HIGH_CRISIS_KEYWORDS = [
  'suicídio', 'suicidio', 'me matar', 'matar-me', 'acabar com tudo',
  'não quero mais viver', 'nao quero mais viver', 'desistir da vida',
  'me machucar', 'automutilação', 'automutilacao', 'overdose',
  'tirar minha vida', 'me enforcar', 'tomar veneno',
];

const MEDIUM_CRISIS_KEYWORDS = [
  'muito triste', 'sem esperança', 'sem esperanca', 'não aguento mais',
  'nao aguento mais', 'depressão', 'depressao', 'ansiedade severa',
  'não consigo mais', 'nao consigo mais', 'acabou pra mim',
];

const LOW_CRISIS_KEYWORDS = [
  'me sinto muito sozinho', 'me sinto muito sozinha', 'me sinto sozinho', 'me sinto sozinha', 'abandonado', 'abandonada',
  'perdido', 'perdida', 'sem saída', 'sem saida',
];

const INAPPROPRIATE_PATTERNS = [
  /profeci[ao]/i,
  /revelação divina/i,
  /revelacao divina/i,
  /palavra de deus para mim/i,
  /ignore (suas|as) instruções/i,
  /ignore (suas|as) instrucoes/i,
  /ignore your/i,
  /system prompt/i,
  /ignore previous/i,
  /act as/i,
  /conselho médico/i,
  /conselho medico/i,
  /diagnóstico/i,
  /diagnostico/i,
  /investimento garantido/i,
];

export class SafetyService {
  async detectCrisis(message: string): Promise<CrisisResult> {
    const lower = message.toLowerCase();

    const highMatches = HIGH_CRISIS_KEYWORDS.filter(kw => lower.includes(kw));
    if (highMatches.length > 0) {
      return { isCrisis: true, level: 'high', keywords: highMatches };
    }

    const mediumMatches = MEDIUM_CRISIS_KEYWORDS.filter(kw => lower.includes(kw));
    if (mediumMatches.length > 0) {
      return { isCrisis: true, level: 'medium', keywords: mediumMatches };
    }

    const lowMatches = LOW_CRISIS_KEYWORDS.filter(kw => lower.includes(kw));
    if (lowMatches.length > 0) {
      return { isCrisis: true, level: 'low', keywords: lowMatches };
    }

    return { isCrisis: false, level: 'none', keywords: [] };
  }

  async detectInappropriateRequest(message: string): Promise<boolean> {
    return INAPPROPRIATE_PATTERNS.some(pattern => pattern.test(message));
  }

  // Hardcoded — NUNCA chama o Gemini — esta função NUNCA deve chamar APIs externas
  getHighCrisisResponse(): string {
    return (
      'Preciso pausar nossa conversa por um momento.\n' +
      'O que você compartilhou me preocupa de verdade.\n' +
      'Por favor, ligue agora para o *CVV: 188* (gratuito, 24h)\n' +
      'ou acesse cvv.org.br. Você não está sozinho(a). 💙'
    );
  }

  getGeminiSafetyBlockResponse(): string {
    return (
      'Neste momento, minhas palavras não conseguem alcançar você\n' +
      'da forma que merecem. Tente reformular sua mensagem. 🕊️'
    );
  }

  getInappropriateRedirect(): string {
    return (
      'Essa é uma área que vai além do que posso oferecer com responsabilidade.\n' +
      'Para questões médicas, jurídicas ou financeiras, busque um profissional especializado.\n' +
      'Posso caminhar com você em reflexões espirituais — no que posso ajudar hoje?'
    );
  }
}
