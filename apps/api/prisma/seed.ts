import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Usuário de teste (nunca usar em produção)
  await prisma.user.upsert({
    where: { whatsappId: '+5511999990000' },
    update: {},
    create: {
      whatsappId: '+5511999990000',
      whatsappName: 'Teste Local',
      freeMessagesLimit: 30,
      onboardingCompleted: false,
    },
  });
  console.log('Seed concluído.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
