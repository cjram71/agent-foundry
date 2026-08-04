import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Registering Around Town Stockholm project...');

  const project = await prisma.project.upsert({
    where: { id: 'around-town-stockholm-id' },
    update: {
      authorisedStatus: true,
      spendingLimit: 50.00
    },
    create: {
      id: 'around-town-stockholm-id',
      name: 'Around Town Stockholm',
      githubOwner: 'cjram71',
      githubRepo: 'around-town-stockholm',
      defaultBranch: 'main',
      authorisedStatus: true,
      spendingLimit: 50.00
    }
  });

  console.log('Project registered:', project.name, `(${project.githubOwner}/${project.githubRepo})`);

  // Create an initial validation task
  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Verify Next.js Build and TypeScript Integrity',
      completeInstruction: 'Run repository typechecks and build validation inside the isolated runner sandbox.',
      status: 'draft',
      riskLevel: 'low'
    }
  });

  console.log('Test task created:', task.id, '| Status:', task.status);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
