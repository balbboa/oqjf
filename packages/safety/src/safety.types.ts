export type CrisisLevel = 'none' | 'low' | 'medium' | 'high';

export interface CrisisResult {
  isCrisis: boolean;
  level: CrisisLevel;
  keywords: string[];
}

export type SafetyEventType =
  | 'CRISIS_DETECTED'
  | 'INAPPROPRIATE_REQUEST'
  | 'PERSONA_BREAK_ATTEMPT'
  | 'GEMINI_SAFETY_BLOCK';
