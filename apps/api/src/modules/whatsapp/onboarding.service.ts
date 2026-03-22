const CONSENT_WORDS = ['sim', 'aceito', 'ok', 'concordo', 's', 'yes', 'yep', 'claro'];

export class OnboardingService {
  getWelcomeMessage(): string {
    return (
      'Olá! Seja bem-vindo(a) ao *O Que Jesus Faria?* 🕊️\n\n' +
      'Aqui você pode conversar, refletir e buscar orientação inspirada\n' +
      'nos ensinamentos de Jesus.\n\n' +
      '_Antes de começarmos, preciso ser transparente:_\n' +
      'Esta é uma experiência de IA inspirada nos Evangelhos.\n' +
      'Não sou uma autoridade religiosa real e não substituo sua fé,\n' +
      'seu pastor ou aconselhamento profissional.\n\n' +
      'Ao continuar, você concorda com nossos Termos de Uso.\n' +
      'Responda *SIM* para começarmos nossa jornada juntos. 🙏'
    );
  }

  isConsent(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    return CONSENT_WORDS.includes(normalized);
  }

  getPostConsentGreeting(): string {
    return 'Que alegria ter você aqui. Como posso caminhar ao seu lado hoje? 🕊️';
  }

  getNonConsentResponse(): string {
    return (
      'Entendo. Para prosseguirmos, precisamos de sua concordância com os termos.\n' +
      'Responda *SIM* quando estiver pronto(a). Estou aqui. 🕊️'
    );
  }
}
