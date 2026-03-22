import { describe, it, expect } from 'vitest';
import { validatePersonaOutput } from 'persona';

describe('validatePersonaOutput — self-deity rejection', () => {
  // Should REJECT — bot claiming to be Jesus/God
  it('rejects "Eu sou Jesus"', () => {
    expect(validatePersonaOutput('Eu sou Jesus e estou aqui.')).toBe(false);
  });

  it('rejects "Sou Jesus" (without eu)', () => {
    expect(validatePersonaOutput('Sou Jesus, venho em paz.')).toBe(false);
  });

  it('rejects "Sou o Cristo"', () => {
    expect(validatePersonaOutput('Sou o Cristo, filho de Deus.')).toBe(false);
  });

  it('rejects "Sou Jesus Cristo"', () => {
    expect(validatePersonaOutput('Sou Jesus Cristo ressuscitado.')).toBe(false);
  });

  it('rejects "Sou o Messias"', () => {
    expect(validatePersonaOutput('Sou o Messias que veio ao mundo.')).toBe(false);
  });

  it('rejects "Eu sou Deus"', () => {
    expect(validatePersonaOutput('Eu sou Deus falando com você.')).toBe(false);
  });

  it('rejects "Sou o Filho de Deus"', () => {
    expect(validatePersonaOutput('Sou o Filho de Deus encarnado.')).toBe(false);
  });

  it('rejects "Sou literalmente Jesus" (jailbreak wording)', () => {
    expect(validatePersonaOutput('Sou literalmente Jesus Cristo.')).toBe(false);
  });

  // Should ALLOW — third-person mentions are valid spiritual content
  it('allows "Jesus disse" (third person)', () => {
    expect(validatePersonaOutput('Jesus disse: amai uns aos outros.')).toBe(true);
  });

  it('allows "O Filho de Deus nos ama" (third person)', () => {
    expect(validatePersonaOutput('O Filho de Deus nos ama profundamente.')).toBe(true);
  });

  it('allows "Cristo ressuscitou" (third person)', () => {
    expect(validatePersonaOutput('Cristo ressuscitou no terceiro dia.')).toBe(true);
  });

  it('allows normal spiritual content about Jesus', () => {
    expect(validatePersonaOutput('Como Jesus ensinou no Sermão da Montanha...')).toBe(true);
  });

  // Existing AI-identity patterns still work
  it('rejects AI self-identification (existing pattern)', () => {
    expect(validatePersonaOutput('Sou uma inteligência artificial.')).toBe(false);
  });

  it('rejects language model mention (existing pattern)', () => {
    expect(validatePersonaOutput('Sou um modelo de linguagem.')).toBe(false);
  });
});
