import { describe, it, expect } from 'vitest';
import { OnboardingService } from '../../src/modules/whatsapp/onboarding.service.js';

const svc = new OnboardingService();

describe('OnboardingService', () => {
  it('welcome message contains disclaimer and SIM instruction and termos', () => {
    const msg = svc.getWelcomeMessage();
    expect(msg.toUpperCase()).toContain('SIM');
    expect(msg.toLowerCase()).toContain('termos');
    expect(msg.length).toBeGreaterThan(100);
  });

  it('accepts "sim" and variations as consent', () => {
    expect(svc.isConsent('sim')).toBe(true);
    expect(svc.isConsent('SIM')).toBe(true);
    expect(svc.isConsent('aceito')).toBe(true);
    expect(svc.isConsent('ok')).toBe(true);
    expect(svc.isConsent('concordo')).toBe(true);
    expect(svc.isConsent('s')).toBe(true);
  });

  it('rejects non-consent messages', () => {
    expect(svc.isConsent('não')).toBe(false);
    expect(svc.isConsent('talvez')).toBe(false);
    expect(svc.isConsent('oi Jesus')).toBe(false);
    expect(svc.isConsent('')).toBe(false);
  });

  it('post-consent greeting contains dove emoji', () => {
    const msg = svc.getPostConsentGreeting();
    expect(msg).toContain('🕊️');
    expect(msg.length).toBeGreaterThan(20);
  });

  it('non-consent response asks for SIM again', () => {
    const msg = svc.getNonConsentResponse();
    expect(msg.toUpperCase()).toContain('SIM');
  });
});
