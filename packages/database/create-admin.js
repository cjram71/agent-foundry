const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const readline = require('readline');

const prisma = new PrismaClient();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n--- Create Foundry Administrator ---');
rl.question('Enter Admin Email (e.g., cory@aroundtown.local): ', async (email) => {
  rl.question('Enter Secure Password: ', async (password) => {
    try {
      // Hash the password with a strong cost factor of 12
      const passwordHash = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          email: email.trim(),
          passwordHash: passwordHash,
          role: 'ADMIN'
        }
      });
      console.log(`\n[OK] Administrator account successfully created for: ${user.email}`);
    } catch (error) {
      if (error.code === 'P2002') {
        console.log('\n[FAIL] An administrator with this email already exists.');
      } else {
        console.error('\n[FAIL] Error creating user:', error);
      }
    } finally {
      await prisma.$disconnect();
      rl.close();
    }
  });
});
